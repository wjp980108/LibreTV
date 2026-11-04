'use client';

import {
  ArrowDownOutlined, LeftOutlined, RightOutlined, PlaySquareOutlined,
  PlayCircleFilled, SwapOutlined, DownloadOutlined, ScissorOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';
import {
  Button,
  Spin,
  Empty,
  Typography,
  Flex,
  Layout,
  Badge,
  Popover,
  Switch,
} from 'antd';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
// 播放器（artplayer + hls.js）按需加载：拆出独立 chunk，不占首屏 First Load JS
const PlayerShell = dynamic(() => import('@/components/player-shell').then((m) => m.PlayerShell), {
  ssr: false,
  loading: () => (
    <Flex style={{ width: '100%', height: '100%' }} align="center" justify="center">
      <Spin size="large" />
    </Flex>
  ),
});
import { SwitchSourceModal } from '@/components/switch-source';
import { SkipMarkPanel } from '@/components/skip-mark-panel';
import { skipMarkKey, validateSegment, type SkipSegment } from '@/lib/skip-marks';
import type { PlayerSkipApi } from '@/components/player-shell';
import { useToast } from '@/components/toast';
import { enqueueDownload } from '@/components/download-manager';

import { useAuth } from '@/components/auth';
import { resolveSource, useAppStore } from '@/lib/store';
import { qualityKey } from '@/lib/quality';
import { ThemeToggle } from '@/components/theme';
import styles from './watch.module.css';
import {
  clearProgress,
  progressKeyOf,
  saveProgress,
  updateHistoryProgress,
  upsertHistory,
  db,
} from '@/lib/db';

/**
 * 播放页（唯一入口，替代旧版 watch.html → player.html 跳转链）。
 * 状态全部由 URL 驱动：/watch?source=xx&id=..&index=..&title=..
 * 集数列表由服务端详情接口获取；进度与历史走 IndexedDB。
 */
export default function WatchPage() {
  return (
    <Suspense>
      <WatchContent />
    </Suspense>
  );
}

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const store = useAppStore();
  const { verified } = useAuth();
  const { toast } = useToast();

  const sourceKey = searchParams.get('source') || '';
  const vodId = searchParams.get('id') || '';
  const directUrl = searchParams.get('url') || '';
  const titleParam = searchParams.get('title') || '';
  const indexParam = parseInt(searchParams.get('index') || '0', 10) || 0;

  const [reversed, setReversed] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [skipPanelOpen, setSkipPanelOpen] = useState(false);
  // 播放器对外暴露的精确时间读取接口（「记录当前」用），随播放器卸载置空
  const playerApiRef = useRef<PlayerSkipApi | null>(null);
  // 播放框：小屏「跳过标记」抽屉要按它的底边算剩余高度，避免压住画面
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const [sheetMaxHeight, setSheetMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!skipPanelOpen) return;
    const measure = () => {
      // 桌面端抽屉贴右侧、整屏高，不受播放器位置影响
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setSheetMaxHeight(undefined);
        return;
      }
      const box = playerFrameRef.current?.getBoundingClientRect();
      if (!box) {
        setSheetMaxHeight(undefined);
        return;
      }
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const room = viewport - box.bottom - 12;
      // 不超过视口 60%；矮窗下最多压到 160px，再小就没法用了
      setSheetMaxHeight(Math.round(Math.max(160, Math.min(viewport * 0.6, room))));
    };
    measure();
    // 只在打开与尺寸变化时测：跟着滚动实时改高度会让抽屉边滚边长，很晃
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [skipPanelOpen]);

  const source = resolveSource(store, sourceKey, {
    url: searchParams.get('sourceUrl') || undefined,
    detail: searchParams.get('detail') || undefined,
  });

  // 详情查询：无 id（纯直连链接分享）时跳过
  const detailQuery = useQuery({
    queryKey: ['detail', sourceKey, vodId, source?.url],
    queryFn: ({ signal }) => api.detail(vodId, source!, signal),
    enabled: Boolean(source && vodId && verified),
    staleTime: 5 * 60_000,
  });

  const episodes = useMemo(() => detailQuery.data?.episodes ?? [], [detailQuery.data]);
  const videoTitle = titleParam || detailQuery.data?.videoInfo?.title || '未知视频';

  // 当前播放地址：优先取剧集列表中的当前集，其次直连 URL 参数
  const currentUrl = useMemo(() => {
    if (episodes.length > 0) {
      const idx = Math.min(Math.max(indexParam, 0), episodes.length - 1);
      return episodes[idx] || directUrl;
    }
    return directUrl;
  }, [episodes, indexParam, directUrl]);

  const currentIndex = useMemo(() => {
    if (episodes.length > 0) return Math.min(Math.max(indexParam, 0), episodes.length - 1);
    return indexParam;
  }, [episodes, indexParam]);

  // 跳过片段按剧名记忆：换集不变，换源到同名资源也能命中。
  // 标题缺失（直连链接）时退回 source:vodId，至少保证本源本片可用。
  const skipMarkFallback = `${sourceKey}:${vodId || currentUrl}`;
  const markKey = useMemo(
    () => skipMarkKey(videoTitle, skipMarkFallback),
    [videoTitle, skipMarkFallback],
  );
  const skipMark = store.skipMarks[markKey];
  const markedCount = skipMark?.segments.length ?? 0;

  // 中段两步态的起点：页面层持有，面板按钮与 Shift+S/E 共用同一份状态
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  // 换集清空中段两步态：起点属于上一集，不能和新集的位置拼成区间
  useEffect(() => setPendingStart(null), [sourceKey, vodId, currentIndex]);

  const goEpisode = useCallback(
    (index: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('index', String(index));
      sp.set('url', episodes[index] || directUrl);
      sp.delete('position');
      router.replace(`/watch?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams, episodes, directUrl],
  );

  // 进度恢复优先级：URL position 参数 > IndexedDB 记录
  const getRestorePosition = useCallback(async () => {
    const urlPos = parseInt(searchParams.get('position') || '0', 10) || 0;
    if (urlPos > 0) return urlPos;
    if (!vodId) return 0;
    const entry = await db.progress.get(progressKeyOf(sourceKey, vodId, currentIndex));
    return entry?.position ?? 0;
  }, [searchParams, sourceKey, vodId, currentIndex]);

  // 写入观看历史（进入页面即记录，进度后续增量更新）
  useEffect(() => {
    if (!verified || !sourceKey || !currentUrl) return;
    const timer = setTimeout(() => {
      upsertHistory({
        sourceKey,
        sourceUrl: source?.url,
        vodId: vodId || currentUrl,
        title: videoTitle,
        pic: detailQuery.data?.videoInfo?.cover,
        episodeIndex: currentIndex,
        totalEpisodes: episodes.length,
        playbackPosition: 0,
        duration: 0,
        timestamp: Date.now(),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, sourceKey, vodId, currentIndex, videoTitle, currentUrl]);

  // 播放中与暂停时的进度落盘逻辑一致，共用同一回调
  const handleProgress = useCallback(
    (position: number, duration: number) => {
      if (vodId) {
        saveProgress(sourceKey, vodId, currentIndex, position, duration).catch(() => {});
        updateHistoryProgress(sourceKey, vodId || currentUrl, position, duration).catch(() => {});
      }
    },
    [sourceKey, vodId, currentIndex, currentUrl],
  );

  // 自动连播的 800ms 延迟切集要在卸载时取消，避免离开页面后跳转
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
    },
    [],
  );

  const handleEnded = useCallback(() => {
    if (vodId) clearProgress(sourceKey, vodId, currentIndex).catch(() => {});
    if (store.autoplayNext && currentIndex < episodes.length - 1) {
      autoNextTimer.current = setTimeout(() => goEpisode(currentIndex + 1), 800);
    }
  }, [store.autoplayNext, currentIndex, episodes.length, goEpisode, sourceKey, vodId]);

  // 快捷键（Shift+I/O/S/E）记录片段：校验后写入
  const handleRecordSegment = useCallback(
    (segment: SkipSegment) => {
      const duration = playerApiRef.current?.getDuration() ?? 0;
      const existing = useAppStore.getState().skipMarks[markKey]?.segments ?? [];
      const error = validateSegment(segment, duration, existing);
      if (error) {
        toast(error, 'error');
        return;
      }
      useAppStore.getState().setSkipMark(markKey, [...existing, segment]);
      const label =
        segment.type === 'opening'
          ? '片头结束'
          : segment.type === 'ending'
            ? '片尾开始'
            : '中段片段';
      // 中段命中时的表现取决于全局「自动跳过片段」，记完就说清楚，避免"标了却没反应"
      const hint =
        segment.type === 'middle'
          ? useAppStore.getState().autoSkipSegments
            ? '，命中时将自动跳过'
            : '，命中时显示跳过按钮'
          : '';
      toast(`已记录${label}${hint}`, 'success');
    },
    [markKey, toast],
  );

  // Alt+←/→ 集数切换快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goEpisode(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < episodes.length - 1) {
        e.preventDefault();
        goEpisode(currentIndex + 1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentIndex, episodes.length, goEpisode]);

  const orderedEpisodes = reversed
    ? [...episodes].map((_, i) => episodes.length - 1 - i)
    : episodes.map((_, i) => i);

  if (!verified) {
    return (
      <Flex style={{ minHeight: '100dvh' }} align="center" justify="center">
        <Typography.Paragraph
          type="secondary"
          style={{ margin: 0, fontSize: 'var(--ant-font-size)' }}
        >
          等待访问验证...
        </Typography.Paragraph>
      </Flex>
    );
  }

  if (!source) {
    return (
      <Flex style={{ minHeight: '100dvh', paddingInline: 16 }} align="center" justify="center">
        <Flex vertical style={{ textAlign: 'center', maxWidth: 448 }}>
          <Typography.Title level={1} style={{ margin: 0, fontWeight: 500, marginBottom: 8 }}>
            点播源不存在
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size)',

              marginBottom: 16,
            }}
          >
            该视频来自点播源「{sourceKey}」，但它可能已被删除。请在设置中重新添加后重试。
          </Typography.Paragraph>
          <Button type="primary" href="/">
            返回首页
          </Button>
        </Flex>
      </Flex>
    );
  }

  return (
    <Layout className={styles.page}>
      <Layout.Header className={styles.header}>
        <nav className={styles.headerInner} aria-label="播放页导航">
          <BackButton />
          <HomeButton />
          <span className={styles.headerDivider} />
          <span className={styles.headerTitle} title={videoTitle}>{videoTitle}</span>
          <div className={styles.headerTools}>
            <Popover title="播放快捷键" trigger="click" placement="bottomRight" content={
              <div className={styles.shortcuts}>
                <span>播放 / 暂停</span><kbd>空格</kbd>
                <span>快退 / 快进 5 秒</span><kbd>← / →</kbd>
                <span>调整音量</span><kbd>↑ / ↓</kbd>
                <span>全屏</span><kbd>F</kbd>
                <span>上一集 / 下一集</span><kbd>Alt + ← / →</kbd>
              </div>
            }>
              <Button type="text" icon={<QuestionCircleOutlined />} aria-label="查看播放快捷键" />
            </Popover>
            <ThemeToggle />
          </div>
        </nav>
      </Layout.Header>

      <Layout.Content className={styles.content}>
        <div className={styles.watchLayout}>
          <section className={styles.playerColumn} aria-label="影片播放">
            <div className={styles.playerCard}>
              <div ref={playerFrameRef} className={styles.playerFrame}>
                {currentUrl ? (
                  <PlayerShell
                    url={currentUrl}
                    title={videoTitle}
                    adFilter={store.adFilter}
                    autoplayNext={store.autoplayNext}
                    skipMark={skipMark}
                    autoSkipSegments={store.autoSkipSegments}
                    pendingStart={pendingStart}
                    onPendingStart={setPendingStart}
                    onPlayerApi={(api) => {
                      playerApiRef.current = api;
                    }}
                    onRecordSegment={handleRecordSegment}
                    episodeKey={`${sourceKey}:${vodId}:${currentIndex}`}
                    nextUrl={
                      currentIndex + 1 < episodes.length ? episodes[currentIndex + 1] : undefined
                    }
                    nextEpisodeKey={
                      currentIndex + 1 < episodes.length
                        ? `${sourceKey}:${vodId}:${currentIndex + 1}`
                        : undefined
                    }
                    getRestorePosition={getRestorePosition}
                    onTimeUpdate={handleProgress}
                    onPause={handleProgress}
                    onEnded={handleEnded}
                    hasPrevEpisode={currentIndex > 0}
                    hasNextEpisode={episodes.length > 0 && currentIndex < episodes.length - 1}
                    onPrevEpisode={() => goEpisode(currentIndex - 1)}
                    onNextEpisode={() => goEpisode(currentIndex + 1)}
                    onQuality={(height) => {
                      // 播放实测是最权威的画质来源，回写后搜索列表里该「源 + 影片」直接显示
                      if (!sourceKey || !vodId) return;
                      useAppStore.getState().setQuality({
                        [qualityKey(sourceKey, vodId)]: {
                          height,
                          from: 'play',
                          timestamp: Date.now(),
                        },
                      });
                    }}
                  />
                ) : (
                  <Flex vertical gap={16} className={styles.playerEmpty} align="center" justify="center">
                    {detailQuery.isLoading ? (
                      <Spin size="large" />
                    ) : (
                      <>
                        <span>{detailQuery.isError ? '视频加载失败，请尝试其他来源' : '暂无可用播放地址'}</span>
                        <Button icon={<SwapOutlined />} onClick={() => setSwitchOpen(true)}>切换来源</Button>
                      </>
                    )}
                  </Flex>
                )}
              </div>

              <div className={styles.playerDetails}>
                <div className={styles.filmHeading}>
                  <div className={styles.filmInfo}>
                    <Typography.Title level={1} className={styles.videoTitle}>{videoTitle}</Typography.Title>
                    <div className={styles.videoMeta}>
                      <span className={styles.nowPlaying}><PlayCircleFilled aria-hidden />
                        {episodes.length > 0 ? `第 ${currentIndex + 1} 集` : '当前视频'}
                      </span>
                      <span>{source.name}</span>
                      {episodes.length > 0 && <span>共 {episodes.length} 集</span>}
                    </div>
                  </div>
                  <div className={styles.episodeNavigation}>
                    <Button icon={<LeftOutlined />} disabled={currentIndex <= 0}
                      onClick={() => goEpisode(currentIndex - 1)}>上一集</Button>
                    <Button type="primary" icon={<RightOutlined />} iconPlacement="end"
                      disabled={episodes.length === 0 || currentIndex >= episodes.length - 1}
                      onClick={() => goEpisode(currentIndex + 1)}>下一集</Button>
                  </div>
                </div>
                <div className={styles.toolbar}>
                  <Button type="text" icon={<SwapOutlined />} onClick={() => setSwitchOpen(true)}>切换来源</Button>
                  <Button type={skipPanelOpen ? 'primary' : 'text'} icon={<ScissorOutlined />}
                    aria-expanded={skipPanelOpen} aria-haspopup="dialog"
                    onClick={() => setSkipPanelOpen((v) => !v)}
                    title={markedCount > 0
                      ? `本剧已标记 ${markedCount} 段${skipMark?.enabled === false ? '（本剧跳过已关闭）' : ''}`
                      : '标记片头 / 中段 / 片尾，供本剧各集自动跳过'}>
                    跳过标记{markedCount > 0 ? ` (${markedCount})` : ''}
                    {markedCount > 0 && skipMark?.enabled === false && (
                      <Badge color="var(--ant-color-text-tertiary)" aria-label="本剧跳过已关闭" />
                    )}
                  </Button>
                  <Button type="text" icon={<DownloadOutlined />} disabled={!currentUrl} onClick={() => {
                    if (!currentUrl) return;
                    enqueueDownload({
                      url: currentUrl,
                      title: `${videoTitle}${episodes.length > 1 ? ` 第${currentIndex + 1}集` : ''}`,
                      format: 'MP4',
                    });
                  }}>下载本集</Button>
                </div>
              </div>
              <SkipMarkPanel
                open={skipPanelOpen}
                onClose={() => setSkipPanelOpen(false)}
                markKey={markKey}
                pendingStart={pendingStart}
                onPendingStart={setPendingStart}
                mobileMaxHeight={sheetMaxHeight}
                getPlayerClock={() => {
                  const api = playerApiRef.current;
                  if (!api) return null;
                  return {
                    currentTime: api.getCurrentTime(),
                    duration: api.getDuration(),
                    seek: (s) => api.seek(s),
                    pause: () => api.pause(),
                    isPaused: () => api.isPaused(),
                  };
                }}
              />
            </div>
          </section>

          <aside className={styles.episodePanel} aria-label="剧集选择">
            <div className={styles.episodePanelHeader}>
              <div className={styles.episodeHeading}>
                <Typography.Title level={2}>选集</Typography.Title>
                <span>{episodes.length > 0 ? `${episodes.length} 集` : '剧集列表'}</span>
                {episodes.length > 1 && (
                  <Button type="text" size="small" icon={<ArrowDownOutlined style={reversed ? { transform: 'rotate(180deg)' } : undefined} />}
                    onClick={() => setReversed((v) => !v)}
                    aria-label={reversed ? '切换为正序排列' : '切换为倒序排列'}>
                    {reversed ? '正序' : '倒序'}
                  </Button>
                )}
              </div>
              <div className={styles.episodeStatus}>
                <span>{episodes.length > 0 ? `当前播放 · 第 ${currentIndex + 1} 集` : '选择剧集开始观看'}</span>
                {episodes.length > 0 && <span>{currentIndex + 1} / {episodes.length}</span>}
              </div>
            </div>
            <div className={styles.episodeScroll} data-episode-list>
              {episodes.length === 0 ? (
                detailQuery.isLoading ? (
                  <Flex style={{ minHeight: 160 }} align="center" justify="center"><Spin /></Flex>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={detailQuery.isError ? '获取剧集失败' : '暂无剧集信息'} />
                )
              ) : (
                <div className={styles.episodeGrid}>
                  {orderedEpisodes.map((realIndex) => (
                    <EpisodeButton key={realIndex} index={realIndex} active={realIndex === currentIndex}
                      onClick={() => goEpisode(realIndex)} />
                  ))}
                </div>
              )}
            </div>
            <div className={styles.episodePanelFooter}>
              <div>
                <span>自动连播</span>
                <p>本集结束后，接着播放下一集</p>
              </div>
              <Switch checked={store.autoplayNext} aria-label="自动连播"
                onChange={(checked) => store.updateSettings({ autoplayNext: checked })} />
            </div>
          </aside>
        </div>
      </Layout.Content>

      {switchOpen && (
        <SwitchSourceModal
          currentTitle={videoTitle}
          currentSourceKey={sourceKey}
          currentVodId={vodId}
          currentIndex={currentIndex}
          onClose={() => setSwitchOpen(false)}
        />
      )}
    </Layout>
  );
}

/** 集数按钮：激活时自动滚动进可视区（长剧列表） */
function EpisodeButton({
  index,
  active,
  onClick,
}: {
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = ref.current;
    const list = button?.closest<HTMLElement>('[data-episode-list]');
    if (!active || !button || !list) return;
    // 只滚动选集区域，避免手机切集时把整页和播放器推离视口。
    const box = button.getBoundingClientRect();
    const viewport = list.getBoundingClientRect();
    if (box.top < viewport.top) list.scrollTop += box.top - viewport.top - 8;
    else if (box.bottom > viewport.bottom) list.scrollTop += box.bottom - viewport.bottom + 8;
  });

  return (
    <Button
      type={active ? 'primary' : 'default'}
      className={styles.episodeButton}
      ref={ref}
      aria-label={`第 ${index + 1} 集${active ? '，当前播放' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      {active && <PlayCircleFilled aria-hidden />}{index + 1}
    </Button>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <Button
      type="text"
      style={{ marginInlineStart: -8 }}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/');
      }}
      aria-label="返回"
    >
      <LeftOutlined style={{ fontSize: 20 }} aria-hidden />
    </Button>
  );
}

/** 首页按钮：直达首页，避免从外链进入时逐级 back */
function HomeButton() {
  return (
    <Link
      href="/"
      className={styles.brand}
      aria-label="回首页"
      title="回首页"
    >
      <span className={styles.brandIcon}><PlaySquareOutlined aria-hidden /></span>
      <span className={styles.brandName}>Meet you</span>
    </Link>
  );
}
