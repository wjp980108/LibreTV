'use client';

import {
  UndoOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  StarFilled,
  StarOutlined,
  CopyOutlined,
  MenuOutlined,
} from '@ant-design/icons';

import {
  Button,
  Drawer,
  Grid,
  Tag,
  Spin,
  Flex,
  Layout,
  Row,
  Col,
  Card,
  Typography,
  Badge,
} from 'antd';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { copyToClipboard } from '@/lib/clipboard';
import { Header } from '@/components/header';
// 播放器（artplayer + hls.js）按需加载：拆出独立 chunk，不占首屏 First Load JS
import dynamic from 'next/dynamic';
const LivePlayer = dynamic(() => import('@/components/live-player').then((m) => m.LivePlayer), {
  ssr: false,
  loading: () => (
    <Flex
      style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
      align="center"
      justify="center"
    >
      <Spin size="large" />
    </Flex>
  ),
});
import { LiveChannelList, type LiveChannelItem } from '@/components/live-channel-list';
import { LiveEpgPanel } from '@/components/live-epg-panel';
import { useAuth } from '@/components/auth';
import { allLiveSources, useAppStore } from '@/lib/store';
import { SmartImage } from '@/components/smart-image';

/**
 * 直播页：左侧播放器 + 频道信息 + 节目单；右侧频道侧栏。
 * 状态由 URL 驱动（?url=&name=&group=&tvgId=&epg=），支持频道深链与刷新保持。
 * 换台路径：侧栏点击、全局 ↑↓ 键盘、播放器控制条上一台/下一台（全屏可用）。
 * 移动端侧栏为底部抽屉（右下角 FAB 呼出，选中频道后自动收起）。
 */
export default function LivePage() {
  return (
    <Suspense>
      <LiveContent />
    </Suspense>
  );
}

function LiveContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  // 精确订阅所需字段：任何其他 store 变化（如测活写回）不应触发本组件重渲染
  const liveSelectedUrls = useAppStore((s) => s.liveSelectedUrls);
  const liveEnvSources = useAppStore((s) => s.liveEnvSources);
  const liveSubscriptions = useAppStore((s) => s.liveSubscriptions);
  const liveFavorites = useAppStore((s) => s.liveFavorites);
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const { verified } = useAuth();
  const [copied, setCopied] = useState(false);
  // 移动端频道抽屉开合
  const [listOpen, setListOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  /** 侧栏上报的筛选排序结果（键盘换台沿此列表顺序）；ref 存储，不触发重渲染 */
  const filteredRef = useRef<LiveChannelItem[]>([]);
  /** 当前频道镜像：selectChannel 内读取最近一次播放的频道，用于记录"上一个频道" */
  const currentChannelRef = useRef<LiveChannelItem | undefined>(undefined);
  /** 上一个频道：退格键/按钮一键切回（电视遥控器 back 键习惯） */
  const lastChannelRef = useRef<LiveChannelItem | null>(null);

  // 仅聚合已启用的直播源（设置 → 直播源中的勾选状态）
  const sources = useMemo(() => {
    const selected = new Set(liveSelectedUrls);
    return allLiveSources({ liveEnvSources, liveSubscriptions }).filter((s) => selected.has(s.url));
  }, [liveSelectedUrls, liveEnvSources, liveSubscriptions]);

  // 聚合全部直播源的 M3U 解析结果（单源失败不影响整体）
  const playlistsQuery = useQuery({
    queryKey: ['livePlaylists', sources.map((s) => s.url).join('|')],
    queryFn: async () => {
      const results = await Promise.allSettled(sources.map((s) => api.livePlaylist(s.url)));
      return sources.map((source, i) => ({ source, result: results[i] }));
    },
    enabled: verified && sources.length > 0,
    staleTime: 10 * 60_000,
  });

  const { channels, groups, failedCount } = useMemo(() => {
    const list: LiveChannelItem[] = [];
    const seen = new Set<string>();
    let failed = 0;
    for (const { source, result } of playlistsQuery.data ?? []) {
      if (result.status !== 'fulfilled') {
        failed++;
        continue;
      }
      for (const c of result.value.channels) {
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        list.push({ ...c, epg: source.epg, sourceUrl: source.url });
      }
    }
    const groups = [
      ...new Set(list.map((c) => c.group).filter((g): g is string => Boolean(g))),
    ].sort((a, b) => a.localeCompare(b, 'zh'));
    return { channels: list, groups, failedCount: failed };
  }, [playlistsQuery.data]);

  // 当前频道：优先取列表内完整对象（含台标），否则由 URL 参数重建
  const currentUrl = searchParams.get('url') || '';
  const currentChannel = useMemo(() => {
    const found = channels.find((c) => c.url === currentUrl);
    if (found) return found;
    if (!currentUrl) return undefined;
    return {
      id: searchParams.get('tvgId') || currentUrl,
      url: currentUrl,
      name: searchParams.get('name') || '未知频道',
      group: searchParams.get('group') || undefined,
      tvgId: searchParams.get('tvgId') || undefined,
      epg: searchParams.get('epg') || undefined,
    } as LiveChannelItem;
  }, [channels, currentUrl, searchParams]);

  useEffect(() => {
    setLogoFailed(false);
  }, [currentChannel?.url]);
  useEffect(() => {
    currentChannelRef.current = currentChannel;
  }, [currentChannel]);

  const selectChannel = useCallback(
    (c: LiveChannelItem) => {
      const cur = currentChannelRef.current;
      if (cur && cur.url !== c.url) lastChannelRef.current = cur;
      const sp = new URLSearchParams({ url: c.url, name: c.name });
      if (c.group) sp.set('group', c.group);
      if (c.tvgId) sp.set('tvgId', c.tvgId);
      if (c.epg) sp.set('epg', c.epg);
      router.replace(`/live?${sp.toString()}`, { scroll: false });
      useAppStore.getState().addLiveRecent({
        url: c.url,
        name: c.name,
        logo: c.logo,
        group: c.group,
        tvgId: c.tvgId,
        epg: c.epg,
        sourceUrl: c.sourceUrl,
      });
    },
    [router],
  );

  const handleFilteredChange = useCallback((list: LiveChannelItem[]) => {
    filteredRef.current = list;
  }, []);

  /** 沿侧栏当前筛选排序的列表顺序切上一台/下一台（循环） */
  const switchChannelByOffset = useCallback(
    (delta: 1 | -1) => {
      const list = filteredRef.current;
      if (list.length === 0) return;
      const nowUrl = new URLSearchParams(window.location.search).get('url') || '';
      const idx = list.findIndex((c) => c.url === nowUrl);
      const next =
        idx === -1
          ? delta === 1
            ? 0
            : list.length - 1
          : (idx + delta + list.length) % list.length;
      selectChannel(list[next]);
    },
    [selectChannel],
  );

  const goPrevChannel = useCallback(() => switchChannelByOffset(-1), [switchChannelByOffset]);
  const goNextChannel = useCallback(() => switchChannelByOffset(1), [switchChannelByOffset]);

  /** 切回上一个频道（Backspace / 信息条按钮） */
  const backToPrevChannel = useCallback(() => {
    const prev = lastChannelRef.current;
    if (!prev) return;
    lastChannelRef.current = null;
    selectChannel(prev);
  }, [selectChannel]);

  // 全局键盘：↑↓ 直接切台，Backspace 切回上一个频道。
  // 输入框/列表光标导航场景让位（列表聚焦时由列表内 ↑↓ 管理光标）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isChannelKey = e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Backspace';
      if (!isChannelKey) return;
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.closest('[data-channel-list]')) return;
      }
      e.preventDefault();
      if (e.key === 'Backspace') backToPrevChannel();
      else switchChannelByOffset(e.key === 'ArrowDown' ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [switchChannelByOffset, backToPrevChannel]);

  const handleSelect = useCallback(
    (c: LiveChannelItem) => {
      selectChannel(c);
      // 移动端抽屉：选中即收起
      setListOpen(false);
    },
    [selectChannel],
  );

  if (!verified) {
    return (
      <Layout style={{ minHeight: '100dvh', background: 'var(--ant-color-bg-layout)' }}>
        <Header />
        <Flex style={{ flex: '1 1 0%' }} align="center" justify="center">
          <Typography.Paragraph
            type="secondary"
            style={{ margin: 0, fontSize: 'var(--ant-font-size)' }}
          >
            等待访问验证...
          </Typography.Paragraph>
        </Flex>
      </Layout>
    );
  }

  const logo = currentChannel?.logo;
  const isFavorite = currentChannel ? liveFavorites.includes(currentChannel.url) : false;

  return (
    <Layout style={{ minHeight: '100dvh', background: 'var(--ant-color-bg-layout)' }}>
      <Header showSearch />
      <Layout.Content style={{ maxWidth: 1280, width: '100%', marginInline: 'auto', padding: 16 }}>
        <Row gutter={[16, 16]}>
          {/* 主栏：播放器 + 信息条 + 节目单 */}
          <Col xs={24} lg={17} xl={18} style={{ minWidth: 0 }}>
            <Flex vertical style={{ minWidth: 0 }}>
              <Flex
                style={{
                  aspectRatio: '16/9',
                  backgroundColor: '#000',
                  borderRadius: 'var(--ant-border-radius-lg)',
                  overflow: 'hidden',
                }}
              >
                {currentUrl ? (
                  <LivePlayer
                    url={currentUrl}
                    title={currentChannel?.name || '直播'}
                    onPrevChannel={goPrevChannel}
                    onNextChannel={goNextChannel}
                  />
                ) : (
                  <Flex
                    style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
                    vertical
                    align="center"
                    justify="center"
                    gap={8}
                  >
                    <Badge status="processing" color="red" />
                    <Typography.Paragraph
                      style={{
                        margin: 0,
                        color: 'color-mix(in srgb, #fff 60%, transparent)',
                        fontSize: 'var(--ant-font-size)',
                      }}
                    >
                      {sources.length === 0
                        ? liveEnvSources.length + liveSubscriptions.length > 0
                          ? '所有直播源均已停用，请在设置中勾选启用'
                          : '请先在设置中添加直播源（M3U 订阅）'
                        : playlistsQuery.isLoading
                          ? '频道列表加载中...'
                          : '从右侧选择一个频道开始观看'}
                    </Typography.Paragraph>
                  </Flex>
                )}
              </Flex>

              {/* 频道信息条 */}
              {currentChannel && (
                <Card size="small" style={{ marginTop: 12 }}>
                  <Flex align="center" gap={12}>
                    <Flex
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--ant-border-radius-sm)',
                        backgroundColor: 'var(--ant-color-fill-tertiary)',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}

                      align="center"
                      justify="center"
                    >
                      {logo && !logoFailed ? (
                        <SmartImage
                          url={logo}
                          mode={imageProxyMode}
                          customProxy={customImageProxy}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          onExhausted={() => setLogoFailed(true)}
                        />
                      ) : (
                        <Typography.Text
                          type="secondary"
                          style={{
                            fontSize: 'var(--ant-font-size-sm)',
                          }}
                        >
                          {currentChannel.name.slice(0, 1)}
                        </Typography.Text>
                      )}
                    </Flex>
                    <Flex vertical style={{ minWidth: 0, flex: '1 1 0%' }}>
                      <Flex align="center" gap={8}>
                        <Badge status="processing" color="red" />
                        <Typography.Title
                          level={1}
                          ellipsis
                          style={{
                            margin: 0,
                            fontSize: 'var(--ant-font-size)',
                            fontWeight: 600,

                            minWidth: 0,
                          }}
                        >
                          {currentChannel.name}
                        </Typography.Title>
                        {currentChannel.group && (
                          <Tag style={{ flexShrink: 0 }}>{currentChannel.group}</Tag>
                        )}
                      </Flex>
                      <Typography.Paragraph
                        type="secondary"
                        ellipsis
                        style={{
                          margin: 0,
                          fontSize: 'var(--ant-font-size-sm)',

                          minWidth: 0,
                          marginTop: 2,
                        }}
                      >
                        {currentChannel.url}
                      </Typography.Paragraph>
                    </Flex>
                    <Flex style={{ flexShrink: 0 }} align="center" gap={4}>
                      <Button
                        type="text"

                        aria-label="上一个频道"
                        title={
                          lastChannelRef.current
                            ? `上一个频道：${lastChannelRef.current.name}（Backspace）`
                            : '暂无上一个频道'
                        }
                        onClick={backToPrevChannel}
                      >
                        <UndoOutlined style={{ fontSize: 16 }} aria-hidden />
                      </Button>
                      <Button
                        type="text"

                        aria-label="上一台"
                        title="上一台（↑）"
                        onClick={goPrevChannel}
                      >
                        <DoubleLeftOutlined style={{ fontSize: 16 }} aria-hidden />
                      </Button>
                      <Button
                        type="text"

                        aria-label="下一台"
                        title="下一台（↓）"
                        onClick={goNextChannel}
                      >
                        <DoubleRightOutlined style={{ fontSize: 16 }} aria-hidden />
                      </Button>
                      <Button
                        color={isFavorite ? 'gold' : 'default'}
                        variant="text"

                        aria-label={isFavorite ? '取消收藏' : '收藏'}
                        title={isFavorite ? '取消收藏' : '收藏'}
                        onClick={() =>
                          useAppStore.getState().toggleLiveFavorite(currentChannel.url)
                        }
                      >
                        {isFavorite ? (
                          <StarFilled style={{ fontSize: 16 }} aria-hidden />
                        ) : (
                          <StarOutlined style={{ fontSize: 16 }} aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="text"

                        aria-label="复制播放地址"
                        title="复制播放地址"
                        onClick={async () => {
                          const ok = await copyToClipboard(currentChannel.url);
                          if (ok) {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }
                        }}
                      >
                        {copied ? (
                          <Typography.Text type="success" style={{ fontSize: '10px' }}>
                            已复制
                          </Typography.Text>
                        ) : (
                          <CopyOutlined style={{ fontSize: 16 }} aria-hidden />
                        )}
                      </Button>
                    </Flex>
                  </Flex>
                </Card>
              )}

              {/* 节目单 */}
              {currentChannel && (
                <Card size="small" style={{ marginTop: 12 }}>
                  <Typography.Title
                    level={2}
                    style={{
                      margin: 0,
                      fontSize: 'var(--ant-font-size)',
                      fontWeight: 600,

                      marginBottom: 10,
                    }}
                  >
                    节目单
                  </Typography.Title>
                  <LiveEpgPanel epgUrl={currentChannel.epg} tvgId={currentChannel.tvgId} />
                </Card>
              )}
            </Flex>
          </Col>

          <Col xs={24} lg={7} xl={6} style={{ minWidth: 0 }}>
            {screens.lg ? (
              <Card
                size="small"
                style={{
                  position: 'sticky',
                  top: 80,
                  height: 'calc(100vh-6.5rem)',
                  minHeight: 0,
                  overflow: 'hidden',
                  borderColor: 'var(--ant-color-border-secondary)',
                  backgroundColor: 'var(--ant-color-bg-elevated)',
                }}
                styles={{ body: { padding: 0, height: '100%' } }}
              >
                <Flex style={{ height: '100%' }} vertical component="aside">
                  <Flex style={{ minHeight: 0, flex: '1 1 0%' }} vertical>
                    {playlistsQuery.isLoading && channels.length === 0 ? (
                      <Flex style={{ flex: '1 1 0%' }} align="center" justify="center">
                        <Spin size="large" />
                      </Flex>
                    ) : (
                      <LiveChannelList
                        channels={channels}
                        groups={groups}
                        currentUrl={currentUrl}
                        onSelect={handleSelect}
                        onFilteredChange={handleFilteredChange}
                      />
                    )}
                    {(failedCount > 0 || sources.length === 0) && (
                      <Typography.Paragraph
                        type="secondary"
                        style={{
                          margin: 0,
                          fontSize: '10px',

                          paddingInline: 12,
                          paddingBlock: 6,
                          borderTopWidth: 1,
                          borderStyle: 'solid',
                          borderColor: 'var(--ant-color-border-secondary)',
                          flexShrink: 0,
                        }}
                      >
                        {sources.length === 0
                          ? liveEnvSources.length + liveSubscriptions.length > 0
                            ? '所有直播源均已停用，请在设置中勾选启用'
                            : '暂无直播源，请在设置 → 直播源中添加'
                          : `${failedCount > 0 ? `${failedCount} 个订阅拉取失败 · ` : ''}共 ${sources.length} 个已启用源`}
                      </Typography.Paragraph>
                    )}
                  </Flex>
                </Flex>
              </Card>
            ) : (
              <Drawer
                open={listOpen}
                onClose={() => setListOpen(false)}
                title="频道列表"
                placement="bottom"
                size="75vh"
                destroyOnHidden
                styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column' } }}
              >
                <Flex style={{ minHeight: 0, flex: '1 1 0%' }} vertical>
                  {playlistsQuery.isLoading && channels.length === 0 ? (
                    <Flex style={{ flex: '1 1 0%' }} align="center" justify="center">
                      <Spin size="large" />
                    </Flex>
                  ) : (
                    <LiveChannelList
                      channels={channels}
                      groups={groups}
                      currentUrl={currentUrl}
                      onSelect={handleSelect}
                      onFilteredChange={handleFilteredChange}
                    />
                  )}
                  {(failedCount > 0 || sources.length === 0) && (
                    <Typography.Paragraph
                      type="secondary"
                      style={{
                        margin: 0,
                        fontSize: '10px',

                        paddingInline: 12,
                        paddingBlock: 6,
                        borderTopWidth: 1,
                        borderStyle: 'solid',
                        borderColor: 'var(--ant-color-border-secondary)',
                        flexShrink: 0,
                      }}
                    >
                      {sources.length === 0
                        ? liveEnvSources.length + liveSubscriptions.length > 0
                          ? '所有直播源均已停用，请在设置中勾选启用'
                          : '暂无直播源，请在设置 → 直播源中添加'
                        : `${failedCount > 0 ? `${failedCount} 个订阅拉取失败 · ` : ''}共 ${sources.length} 个已启用源`}
                    </Typography.Paragraph>
                  )}
                </Flex>
              </Drawer>
            )}
          </Col>
        </Row>

        {/* 移动端呼出频道列表的悬浮按钮 */}
        {!listOpen && channels.length > 0 && (
          <Button
            type="text"
            style={{
              position: 'fixed',
              bottom: 16,
              right: 16,
              zIndex: 30,
              ...(screens.lg ? { display: 'none' } : {}),
            }}
            onClick={() => setListOpen(true)}
          >
            <MenuOutlined style={{ fontSize: 16 }} aria-hidden />
            频道
          </Button>
        )}
      </Layout.Content>
    </Layout>
  );
}
