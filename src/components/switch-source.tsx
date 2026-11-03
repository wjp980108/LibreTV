'use client';

import { LinkOutlined } from '@ant-design/icons';
import {
  Button,
  Modal,
  Tabs,
  Badge,
  Spin,
  Empty,
  Space,
  Typography,
  Flex,
  Row,
  Col,
  Layout,
  Tag,
  Statistic,
} from 'antd';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import type { SourceConfig, SearchResultItem } from '@/lib/types';
import { buildWatchUrl } from '@/lib/utils';
import { useAppStore, resolveSource } from '@/lib/store';
import { qualityKey, qualityLabel } from '@/lib/quality';
import { useToast } from './toast';

import { SmartImage } from './smart-image';
import { QualityBadge } from './quality-badge';
import { useQualityProbe } from './use-quality-probe';

/**
 * 换源面板：跨源按标题搜索 → 匹配同名/同前缀资源 → 并发测速（详情接口耗时）→ 按速度排序展示。
 * 切换时保留当前集数索引（旧版 switchToResource 逻辑的去 DOM 化重写）。
 */

interface Candidate {
  source: SourceConfig;
  result: SearchResultItem;
  ms?: number;
  ok?: boolean;
  episodes?: number;
  /** 测速失败原因：失败源点开后至少能知道是超时、还是源站直接拒绝 */
  error?: string;
}

/** 候选条目的稳定标识：选中态必须绑它，绑数组下标会在测速结果重排后指错源 */
const candidateKey = (c: Candidate) => `${c.source.key}_${c.result.vodId}`;

const isCurrentCandidate = (c: Candidate, sourceKey: string, vodId: string) =>
  c.source.key === sourceKey && String(c.result.vodId) === String(vodId);

export function SwitchSourceModal({
  currentTitle,
  currentSourceKey,
  currentVodId,
  currentIndex,
  onClose,
}: {
  currentTitle: string;
  currentSourceKey: string;
  currentVodId: string;
  currentIndex: number;
  onClose: () => void;
}) {
  const store = useAppStore();
  const router = useRouter();
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [phase, setPhase] = useState<'searching' | 'testing' | 'done'>('searching');
  /** 封面加载失败记录（按卡片 key）；失败后降级为占位图标，避免破图 */
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});
  /** 当前选中的候选：存稳定 key 而不是下标，测速重排后仍然指向同一个源 */
  const [selectedKey, setSelectedKey] = useState('');
  /** 正在单独重测的候选 key：失败源给一次重试机会，失败原因不能只是死路 */
  const [retestingKey, setRetestingKey] = useState('');
  /** 重测的在途请求：换片重搜/关闭面板时中止，避免卸载后 setState */
  const retestAbortRef = useRef<AbortController | null>(null);

  /** Tab 栏左右是否还有内容：没有渐隐提示，用户不知道右边还藏着源 */

  // 打开时把焦点移入弹窗、Tab 圈闭在弹窗内、关闭后归还焦点

  const sources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索/测速与 React key 撞车
    const seen = new Set<string>();
    return store.selectedKeys
      .map((key) => resolveSource(store, key))
      .filter((s): s is SourceConfig => {
        if (!s || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      });
  }, [store]);

  useEffect(() => {
    // 关闭弹窗时中止在途请求：否则 N 个源的搜索 + N 个详情测速会继续占用网络与后端
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      // 1) 并行搜索所有选中源
      setPhase('searching');
      try {
        const { list } = await api.search(currentTitle, sources, store.yellowFilter, {
          signal: controller.signal,
        });
        if (cancelled) return;

        // 匹配口径：优先完全同名，其次名称以标题开头（兼容「小偷 HD」「小偷[电影解说]」这类修饰名）。
        // 都没有则不展示该源——不再兜底取搜索第一条，避免把搜到的其他影片（如搜「小偷」
        // 命中的《宝贝 小偷与大盗》）误当成换源目标。
        const title = currentTitle.trim();
        const matched: Candidate[] = [];
        for (const s of sources) {
          const hits = list.filter((r) => r.sourceKey === s.key);
          const exact =
            hits.find((r) => (r.name || '').trim() === title) ??
            hits.find((r) => (r.name || '').trim().startsWith(title));
          if (exact) matched.push({ source: s, result: exact });
        }

        // 2) 并发测速（详情接口耗时）并获取集数
        setPhase('testing');
        await Promise.all(
          matched.map(async (c) => {
            const r = await api.detailSpeed(c.result.vodId, c.source, controller.signal);
            if (cancelled) return;
            c.ok = r.ok;
            c.ms = r.ms;
            c.episodes = r.detail?.episodes.length ?? 0;
            c.error = r.ok ? undefined : r.error;
          }),
        );
        if (cancelled) return;
        setCandidates(matched);
        setPhase('done');
      } catch (err) {
        // 主动中止不算失败，不提示
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (!cancelled && !aborted) {
          toast(err instanceof Error ? err.message : '换源搜索失败', 'error');
          setPhase('done');
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // 换片重搜 / 关闭面板时，单独发起的重测也要跟着停
      retestAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTitle, store.yellowFilter]);

  const { qualities, probing, progress, probe, retry } = useQualityProbe(sources);

  // 测速完成后补探画质：用户正是在这里比较来源，「快」和「清楚」要能一起看。
  // 只探测速成功的候选——详情接口都打不通的源，再花 8s 探 m3u8 没有意义。
  useEffect(() => {
    if (phase !== 'done') return;
    const targets = candidates.filter((c) => c.ok).map((c) => c.result);
    if (targets.length > 0) probe(targets);
  }, [phase, candidates, probe]);

  const sorted = useMemo(
    () =>
      [...candidates].sort((a, b) => {
        const aCurrent = isCurrentCandidate(a, currentSourceKey, currentVodId);
        const bCurrent = isCurrentCandidate(b, currentSourceKey, currentVodId);
        if (aCurrent !== bCurrent) return aCurrent ? -1 : 1;
        const msA = a.ok ? (a.ms ?? 99_999) : 99_999;
        const msB = b.ok ? (b.ms ?? 99_999) : 99_999;
        return msA - msB;
      }),
    [candidates, currentSourceKey, currentVodId],
  );

  /**
   * 面板展示的源：优先用户点过的那个；还没点过时先落到「第一个可切换的源」——
   * 打开面板的目的就是换源，默认停在「当前播放中」等于让用户多点一次。
   */
  const selected =
    sorted.find((c) => candidateKey(c) === selectedKey) ??
    sorted.find((c) => !isCurrentCandidate(c, currentSourceKey, currentVodId) && c.ok) ??
    sorted[0];
  const selectedCandidateKey = selected ? candidateKey(selected) : '';

  const retest = async (c: Candidate) => {
    const key = candidateKey(c);
    setRetestingKey(key);
    retestAbortRef.current?.abort();
    const controller = new AbortController();
    retestAbortRef.current = controller;
    try {
      const r = await api.detailSpeed(c.result.vodId, c.source, controller.signal);
      if (controller.signal.aborted) return;
      setCandidates((prev) =>
        prev.map((x) =>
          candidateKey(x) === key
            ? {
                ...x,
                ok: r.ok,
                ms: r.ms,
                episodes: r.detail?.episodes.length ?? 0,
                error: r.ok ? undefined : r.error,
              }
            : x,
        ),
      );
      // 重测成功说明源只是刚才抖了一下：强制补一次画质，否则会撞上失败冷却（2 分钟内不再探）
      if (r.ok) retry([c.result]);
    } finally {
      if (retestAbortRef.current === controller) {
        retestAbortRef.current = null;
        setRetestingKey('');
      }
    }
  };

  const switchTo = (c: Candidate) => {
    if (!c.episodes) {
      toast('该源无可用播放资源', 'warning');
      return;
    }
    const targetIndex = currentIndex < c.episodes ? currentIndex : 0;
    onClose(); // 先关闭面板，避免路由参数变化后弹窗残留旧数据
    router.push(
      buildWatchUrl({
        sourceKey: c.source.key,
        vodId: c.result.vodId,
        index: targetIndex,
        title: c.result.name || currentTitle,
        sourceUrl: c.source.url,
        detail: c.source.detail,
      }),
    );
  };

  return (
    <Modal
      open
      title={`换源：${currentTitle}`}
      onCancel={onClose}
      width={768}
      footer={null}
      destroyOnHidden
      styles={{
        body: { maxHeight: 'calc(100dvh - 180px)', overflowY: 'auto', overflowX: 'hidden' },
      }}
    >
      {/* 标题固定在滚动区之外：比 sticky 更省事，也不会有背景覆盖不到 padding 的缝隙 */}
      <Flex style={{ marginBottom: 16, flexShrink: 0 }} align="center" justify="space-between">
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title
            level={2}
            ellipsis
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size-lg)',
              fontWeight: 600,

              minWidth: 0,
            }}
            title={currentTitle}
          >
            {currentTitle}
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{ margin: 0, fontSize: 'var(--ant-font-size-sm)' }}
          >
            {phase === 'searching'
              ? '正在搜索各资源...'
              : phase === 'testing'
                ? '正在测试各资源速率...'
                : `共 ${sorted.length} 个来源 · ${sorted.filter((c) => c.ok).length} 个可用`}
          </Typography.Paragraph>
          {phase === 'done' && progress.total > 0 && (
            <Typography.Paragraph
              type="secondary"
              style={{
                margin: 0,
                fontSize: 'var(--ant-font-size-sm)',

                fontVariantNumeric: 'tabular-nums',
                marginTop: 2,
              }}
            >
              {progress.done < progress.total
                ? `画质探测中 ${progress.done}/${progress.total}`
                : progress.known > 0
                  ? `画质已探到 ${progress.known}/${progress.total}`
                  : // 一个都没探到不等于失败：多为单码率/直链，说清楚省得用户以为坏了
                    '源站未提供画质'}
            </Typography.Paragraph>
          )}
        </Flex>
      </Flex>

      {/* 内容区独占剩余高度并自己滚动：标题与拖拽条始终可见，不随内容滚走 */}
      <Layout.Content
        style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden', flex: '1 1 0%' }}
      >
        {phase !== 'done' ? (
          <Spin description={phase === 'searching' ? '搜索各资源中...' : '测速中...'}>
            <Flex style={{ minHeight: 112 }} />
          </Spin>
        ) : sorted.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space orientation="vertical">
                <Typography.Text>{'其他点播源未找到同名资源'}</Typography.Text>
              </Space>
            }
          ></Empty>
        ) : (
          <>
            <Tabs
              activeKey={selectedCandidateKey}
              onChange={setSelectedKey}
              size="small"
              items={sorted.map((c) => ({
                key: candidateKey(c),
                label: (
                  <Typography.Text>
                    {c.source.name}
                    {isCurrentCandidate(c, currentSourceKey, currentVodId) ? ' · 当前' : ''}
                    {qualityLabel(qualities[qualityKey(c.source.key, c.result.vodId)]?.height)
                      ? ' · ' +
                        qualityLabel(qualities[qualityKey(c.source.key, c.result.vodId)]?.height)
                      : ''}
                  </Typography.Text>
                ),
                icon: (
                  <Badge status={!c.ok ? 'error' : (c.ms ?? 0) > 2000 ? 'warning' : 'success'} />
                ),
              }))}
            />

            {/* 选中源详情：封面降到缩略图，只留速度/集数两项真正要比的数据 */}
            {selected &&
              (() => {
                const c = selected;
                const isCurrent = isCurrentCandidate(c, currentSourceKey, currentVodId);
                const key = candidateKey(c);
                const coverFailed = imgFailed[key] ?? false;
                const qKey = qualityKey(c.source.key, c.result.vodId);
                return (
                  <Flex
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: 'var(--ant-color-bg-container)',
                      borderRadius: 'var(--ant-border-radius-lg)',
                    }}
                    align="flex-start"
                    gap={12}
                  >
                    <Flex
                      style={{
                        width: 80,
                        aspectRatio: '2/3',
                        borderRadius: 'var(--ant-border-radius)',
                        overflow: 'hidden',
                        backgroundColor: 'var(--ant-color-fill-tertiary)',
                        flexShrink: 0,
                      }}
                    >
                      {c.result.pic && !coverFailed ? (
                        <SmartImage
                          url={c.result.pic}
                          mode={store.imageProxyMode}
                          customProxy={store.customImageProxy}
                          alt={c.result.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onExhausted={() => setImgFailed((prev) => ({ ...prev, [key]: true }))}
                        />
                      ) : (
                        <Flex
                          style={{
                            width: '100%',
                            height: '100%',
                            color: 'var(--ant-color-text-tertiary)',
                          }}
                          align="center"
                          justify="center"
                        >
                          <LinkOutlined style={{ fontSize: 20 }} aria-hidden />
                        </Flex>
                      )}
                    </Flex>
                    <Flex vertical style={{ minWidth: 0, flex: '1 1 0%' }}>
                      <Flex style={{ minWidth: 0 }} align="center" gap={8}>
                        <Typography.Title
                          level={3}
                          ellipsis
                          style={{
                            margin: 0,
                            fontSize: 'var(--ant-font-size)',
                            fontWeight: 600,

                            minWidth: 0,
                          }}
                          title={c.source.name}
                        >
                          {c.source.name}
                        </Typography.Title>
                        <QualityBadge
                          entry={qualities[qKey]}
                          loading={probing[qKey]}
                          onRetry={() => retry([c.result])}
                        />
                        {isCurrent && (
                          <Tag style={{ flexShrink: 0 }} color="gold">
                            播放中
                          </Tag>
                        )}
                      </Flex>
                      <Row gutter={[16, 8]} style={{ marginTop: 8 }}>
                        <Col span={12}>
                          <Statistic
                            title="速度"
                            value={c.ok ? (c.ms ?? 0) : '不可用'}
                            suffix={c.ok ? 'ms' : undefined}
                            styles={{
                              content: {
                                fontSize: 14,
                                color: !c.ok
                                  ? 'var(--ant-color-error)'
                                  : (c.ms ?? 0) > 2000
                                    ? 'var(--ant-color-warning)'
                                    : 'var(--ant-color-success)',
                              },
                            }}
                          />
                        </Col>
                        <Col span={12}>
                          <Statistic
                            title="集数"
                            value={c.episodes || '无资源'}
                            suffix={c.episodes ? '集' : undefined}
                            styles={{ content: { fontSize: 14 } }}
                          />
                        </Col>
                      </Row>
                      <Flex style={{ marginTop: 10 }} wrap align="center" gap={8}>
                        {isCurrent ? (
                          <Typography.Text
                            style={{
                              fontSize: 'var(--ant-font-size-sm)',
                              color: 'var(--ant-color-primary)',
                            }}
                          >
                            当前正在播放
                          </Typography.Text>
                        ) : (
                          <>
                            <Button
                              type="primary"
                              size="small"
                              htmlType="button"

                              disabled={!c.episodes}
                              onClick={() => switchTo(c)}
                            >
                              切换到此源
                            </Button>
                            {/* 测速失败但拿得到集数：允许点。详情接口偶发超时很常见，别把能播的源挡在外面 */}
                            {!c.ok && !!c.episodes && (
                              <Typography.Text
                                type="warning"
                                style={{
                                  fontSize: 'var(--ant-font-size-sm)',
                                }}
                              >
                                测速未通过，仍可尝试
                              </Typography.Text>
                            )}
                          </>
                        )}
                        {!c.ok && (
                          <Button
                            type="default"
                            size="small"
                            htmlType="button"

                            disabled={retestingKey === key}
                            onClick={() => void retest(c)}
                          >
                            {retestingKey === key ? '重测中...' : '重新测速'}
                          </Button>
                        )}
                      </Flex>
                      {!c.ok && c.error && (
                        <Typography.Paragraph
                          type="secondary"
                          ellipsis={{ rows: 1 }}
                          style={{ margin: 0, marginTop: 4, fontSize: '11px' }}
                          title={c.error}
                        >
                          {c.error}
                        </Typography.Paragraph>
                      )}
                    </Flex>
                  </Flex>
                );
              })()}
          </>
        )}
      </Layout.Content>
    </Modal>
  );
}
