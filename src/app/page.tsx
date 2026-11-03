'use client';
import { SearchOutlined } from '@ant-design/icons';
import type { ComponentRef } from 'react';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  AutoComplete,
  Space,
  Card,
  Skeleton,
  Empty,
  Typography,
  Layout,
  Grid,
  Row,
  Col,
  Form,
  Result,
  Flex,
  Alert,
} from 'antd';
import { CinemaHero, ContinueWatching } from '@/components/cinema-home';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { RecommendSection } from '@/components/douban-section';
import { DetailModal } from '@/components/detail-modal';
import { AggregatedCard, aggregateResults } from '@/components/video-card';
import {
  useAppStore,
  resolveSource,
  isInDisabledSubscription,
  isSourceDisabled,
} from '@/lib/store';
import { api } from '@/lib/client-api';
import type { SearchResultItem, SourceSearchOutcome } from '@/lib/types';
import { useSearchHistory } from '@/components/search-history';
import { formatDisableTtl, validateSourceUrl } from '@/lib/utils';
import { useToast } from '@/components/toast';

import { SiteFooter } from '@/components/site-footer';

/**
 * 首页：搜索（URL ?s= 驱动，可后退/分享）+ 豆瓣推荐。
 * 搜索状态由 React Query 管理，失败源在结果区顶部以非阻塞方式展示。
 */
/** 搜索结果分批渲染的批大小：一次挂载上千张卡片会明显掉帧 */
const RESULT_PAGE_SIZE = 60;

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const screens = Grid.useBreakpoint();
  const desktop = !!screens.md;
  const sidebarWidth = screens.xl ? 214 : 180;
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const urlQuery = searchParams.get('s') || '';
  // 精确订阅所需字段（对齐 live 页的做法）：搜索流式期间逐源写健康度、
  // 打开设置抽屉/历史面板等无关 store 变化，都不应触发首页整树重渲染
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const [input, setInput] = useState(urlQuery);
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  /** 流式搜索中已结算的源（data 就绪前用于增量渲染） */
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const inputRef = useRef<ComponentRef<typeof AutoComplete>>(null);

  // URL 驱动搜索：?s= 变化时回填输入框
  useEffect(() => {
    setInput(urlQuery);
  }, [urlQuery]);

  // 源名回显：失败/停用提示里显示友好名称而非裸 key
  const sourceName = (key: string) =>
    customAPIs.find((a) => a.key === key)?.name ??
    envSources.find((a) => a.key === key)?.name ??
    key;

  const selectedSources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索
    const seen = new Set<string>();
    return (
      selectedKeys
        .map((key) => resolveSource({ customAPIs, envSources }, key))
        .filter((s): s is NonNullable<typeof s> => {
          if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
          seen.add(s.key);
          return true;
        })
        // 自动停用期内的源不参与搜索（到期自动恢复）
        .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
        // 所属订阅被整体停用的源同样跳过（无损：各源勾选状态保留，重新启用即恢复）
        .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key))
    );
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);
  const disabledSources = useMemo(
    () => selectedKeys.filter((key) => isSourceDisabled({ sourceHealth }, key)),
    [selectedKeys, sourceHealth],
  );
  // 来自已关闭订阅的源：勾选状态还在，但本次搜索用不到，必须明确告知
  const offSubscriptionSources = useMemo(
    () =>
      selectedKeys.filter(
        (key) =>
          !isSourceDisabled({ sourceHealth }, key) &&
          isInDisabledSubscription({ subscriptions }, key),
      ),
    [selectedKeys, sourceHealth, subscriptions],
  );

  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedKeys, yellowFilter],
    // 与 runSearch 的截断规则保持一致：顶栏搜索 / 手动构造长链接不会绕过上限
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        // 逐源结算即更新：结果边搜边渲染，同时滚动健康度
        onSource: (outcome) => {
          setStreamedOutcomes((prev) => [...prev, outcome]);
          for (const ev of useAppStore.getState().recordSourceHealth([outcome])) {
            toast(
              ev.permanent
                ? `「${sourceName(ev.key)}」多次失败，已停止参与搜索，可在设置中恢复`
                : `「${sourceName(ev.key)}」连续超时/失败，已停用 ${formatDisableTtl(ev.ttlMs ?? 0)}`,
              'warning',
            );
          }
        },
      });
    },
    enabled: Boolean(urlQuery) && selectedSources.length > 0,
    // 5 分钟内从播放页返回时直接使用缓存，不重新搜索（服务端另有 60s 结果缓存兜底）
    staleTime: 300_000,
  });

  // 最近搜索改为搜索框下拉（聚焦展开、按输入过滤），不再常驻首屏
  const searchHistory = useSearchHistory(input);

  const runSearch = (q: string) => {
    const query = q.trim().slice(0, 100);
    if (!query) {
      toast('请输入搜索内容', 'info');
      inputRef.current?.focus();
      return;
    }
    if (selectedSources.length === 0) {
      toast('请先在设置中添加并勾选点播源', 'warning');
      return;
    }
    router.push(`/?s=${encodeURIComponent(query)}`, { scroll: false });
    searchHistory.record(query);
  };

  const pickHistory = (text: string) => {
    setInput(text);
    searchHistory.close();
    runSearch(text);
  };

  const isSearching = Boolean(urlQuery) && searchQuery.isFetching && !searchQuery.data;
  // 聚合数据未就绪时，用已结算源的结果增量渲染（健康源不再等坏源超时）
  const streamedList = useMemo(() => streamedOutcomes.flatMap((o) => o.list), [streamedOutcomes]);
  const list = useMemo(
    () => searchQuery.data?.list ?? (isSearching ? streamedList : []),
    [searchQuery.data, isSearching, streamedList],
  );
  const failures =
    searchQuery.data?.failures ??
    streamedOutcomes
      .filter((o) => !o.ok)
      .map((o) => ({ sourceKey: o.sourceKey, error: o.error || '请求失败', timedOut: o.timedOut }));
  // 跨源同名聚合：同名影片合并为一张卡片，展开后可选择具体来源
  const groups = useMemo(() => aggregateResults(list), [list]);

  // 分批渲染：新一次搜索（groups 变化）时重置回首批
  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount]);
  useEffect(() => setVisibleCount(RESULT_PAGE_SIZE), [groups]);

  return (
    <Layout hasSider={false} className="min-h-dvh bg-page">
      <Header cinema />

      <Layout.Content
        className="min-w-0"
        style={{
          marginInlineStart: desktop ? sidebarWidth : 0,
          padding: desktop ? '32px 32px 48px' : '24px 16px 32px',
        }}
      >
        <Flex vertical gap={28} className="mx-auto max-w-[1560px]">
          <Flex
            component="section"
            vertical={!screens.lg}
            align={screens.lg ? 'center' : 'stretch'}
            justify="space-between"
            gap={20}
            aria-label="搜索影片"
          >
            <Flex vertical>
              <Typography.Text style={{ fontSize: 10, letterSpacing: 1.8, fontWeight: 500 }}>
                YOUR PERSONAL CINEMA
              </Typography.Text>
              <Typography.Title style={{ margin: 0, fontSize: 22, lineHeight: 1.45 }} level={1}>
                {urlQuery ? (
                  '寻找你的下一部好片'
                ) : (
                  <>
                    欢迎回到你的影院
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 11, marginInlineStart: 12 }}
                    >
                      好故事，随时开场。
                    </Typography.Text>
                  </>
                )}
              </Typography.Title>
            </Flex>
            <Form
              style={{ width: screens.lg ? 350 : '100%', maxWidth: '100%' }}
              onFinish={() => runSearch(input)}
            >
              <Space.Compact block>
                <AutoComplete
                  style={{ minWidth: 0, width: '100%', flex: '1 1 0%' }}
                  value={input}
                  options={searchHistory.options}
                  open={searchHistory.open}
                  onOpenChange={searchHistory.onOpenChange}
                  onFocus={() => searchHistory.onOpenChange(true)}
                  onChange={(value) => setInput((value ?? '').slice(0, 100))}
                  onSelect={pickHistory}
                  popupRender={searchHistory.popupRender}
                  defaultActiveFirstOption={false}
                  ref={inputRef}
                  allowClear
                  prefix={<SearchOutlined style={{ fontSize: 16 }} aria-hidden />}
                  aria-label="搜索影片"
                  placeholder="搜索电影、剧集，发现好故事…"
                />
                <Button type="primary" htmlType="submit" aria-label="搜索">
                  搜索
                </Button>
              </Space.Compact>
            </Form>
          </Flex>

          {!urlQuery && (
            <>
              <CinemaHero
                onSearch={() => {
                  inputRef.current?.focus();
                  inputRef.current?.nativeElement?.scrollIntoView({
                    block: 'center',
                    behavior: 'smooth',
                  });
                }}
              />
              <ContinueWatching />
            </>
          )}

          {/* 搜索结果 */}
          {urlQuery && (
            <Flex vertical component="section" aria-label="搜索结果" style={{ marginBottom: 40 }}>
              <Flex style={{ marginBottom: 12 }} align="center" justify="space-between">
                <Typography.Title
                  type="secondary"
                  level={2}
                  style={{ margin: 0, fontSize: 'var(--ant-font-size)' }}
                >
                  “<Typography.Text style={{}}>{urlQuery}</Typography.Text>” 的搜索结果
                  {isSearching ? (
                    <Typography.Text type="secondary" style={{}}>
                      （已就绪 {streamedOutcomes.length}/{selectedSources.length} 个源…）
                    </Typography.Text>
                  ) : (
                    searchQuery.data && (
                      <Typography.Text type="secondary" style={{}}>
                        （{groups.length} 部影片 · {list.length} 条结果
                        {failures.length > 0 && `，${failures.length} 个源失败`}）
                      </Typography.Text>
                    )
                  )}
                </Typography.Title>
              </Flex>

              {failures.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  description={
                    <Flex wrap gap={4}>
                      <Typography.Text type="secondary" style={{}}>
                        {isSearching ? '以下源暂时无响应：' : '部分点播源请求失败：'}
                      </Typography.Text>
                      {failures.map((f) => (
                        <Typography.Text
                          key={f.sourceKey}
                          style={{
                            ...(f.timedOut
                              ? { color: 'var(--ant-color-warning)' }
                              : { color: 'var(--ant-color-text-tertiary)' }),
                          }}
                        >
                          {f.timedOut ? '⏱' : '✗'} {sourceName(f.sourceKey)}
                          {f.timedOut ? ' 超时' : ''}
                        </Typography.Text>
                      ))}
                    </Flex>
                  }
                  style={{ marginBottom: 12 }}
                />
              )}

              {disabledSources.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  description={
                    <Flex wrap gap={4}>
                      {disabledSources.length}{' '}
                      个源因连续超时/失败已暂停参与搜索（临时停用的到期自动恢复，
                      长期停用的需在设置中手动恢复）：
                      {disabledSources.map((key) => sourceName(key)).join('、')}
                    </Flex>
                  }
                  style={{ marginBottom: 12 }}
                />
              )}

              {offSubscriptionSources.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  description={
                    <Flex wrap gap={4}>
                      {offSubscriptionSources.length}个源所属的订阅已停用，未参与本次搜索（在设置 →
                      数据源订阅中可重新启用）：
                      {offSubscriptionSources.map((key) => sourceName(key)).join('、')}
                    </Flex>
                  }
                  style={{ marginBottom: 12 }}
                />
              )}

              {selectedSources.length === 0 ? (
                <NoSourceGuide hasSources={customAPIs.length > 0 || envSources.length > 0} />
              ) : list.length > 0 ? (
                <>
                  <Row gutter={[12, 12]} align="top">
                    {visibleGroups.map((group) => (
                      <Col key={group.key} xs={24} sm={12} lg={8}>
                        <AggregatedCard
                          group={group}
                          sources={selectedSources}
                          onOpen={(item) => setDetailItem(item)}
                        />
                      </Col>
                    ))}
                  </Row>
                  {groups.length > visibleCount && (
                    <Flex style={{ marginTop: 16 }} justify="center">
                      <Button
                        type="default"
                        size="small"

                        onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}
                      >
                        加载更多（还有 {groups.length - visibleCount} 部）
                      </Button>
                    </Flex>
                  )}
                </>
              ) : isSearching ? (
                <ResultsSkeleton />
              ) : (
                <Empty
                  style={{ paddingBlock: 64 }}
                  description={
                    <Space orientation="vertical">
                      <Typography.Text>{'没有找到匹配的结果'}</Typography.Text>
                      <Typography.Text type="secondary">
                        {'请尝试其他关键词或更换点播源'}
                      </Typography.Text>
                    </Space>
                  }
                ></Empty>
              )}
            </Flex>
          )}

          {/* 首页推荐（有搜索时隐藏） */}
          {!urlQuery && (
            <RecommendSection
              onPick={(title) => {
                setInput(title);
                runSearch(title);
              }}
            />
          )}
        </Flex>
      </Layout.Content>

      <Layout style={{ marginInlineStart: desktop ? sidebarWidth : 0 }}>
        <SiteFooter />
      </Layout>

      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </Layout>
  );
}

function ResultsSkeleton() {
  return (
    <Row gutter={[12, 12]}>
      {Array.from({ length: 6 }, (_, i) => (
        <Col key={i} xs={24} sm={12} lg={8}>
          <Card size="small">
            <Skeleton active avatar={{ shape: 'square', size: 80 }} paragraph={{ rows: 2 }} />
          </Card>
        </Col>
      ))}
    </Row>
  );
}

/** 无点播源 / 未勾选点播源时的引导（替代旧版首屏静默空白） */
function NoSourceGuide({ hasSources = false }: { hasSources?: boolean }) {
  return (
    <Result
      status="info"
      title={hasSources ? '尚未勾选点播源' : '先添加一个点播源'}
      subTitle={
        hasSources
          ? '点击右上角「设置」，勾选要参与搜索的点播源后重新搜索。'
          : 'LibreTV 不内置采集站。打开「设置 → 添加 API」，填入 Apple CMS 采集站地址，勾选后即可开始搜索。'
      }
    />
  );
}
