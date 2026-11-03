'use client';

import { VideoCameraOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Card, Tag, Flex, Collapse, Typography, Grid } from 'antd';

import { useEffect, useMemo, useState } from 'react';

import type { SearchResultItem, SourceConfig } from '@/lib/types';
import { useAppStore } from '@/lib/store';
import { qualityKey } from '@/lib/quality';
import { compactRemarks, inferGroupRemarks } from '@/lib/remarks';
import { SmartImage } from './smart-image';
import { QualityBadge } from './quality-badge';
import { useQualityProbe } from './use-quality-probe';
import { useInView } from './use-in-view';

// —— 跨源同名聚合 ——

export interface AggregatedGroup {
  key: string;
  name: string;
  year?: string;
  typeName?: string;
  pic?: string;
  remarks?: string;
  items: SearchResultItem[];
}

function buildGroup(
  name: string,
  year: string | undefined,
  items: SearchResultItem[],
): AggregatedGroup {
  return {
    key: `${name}|${year ?? ''}|${items.map((i) => `${i.sourceKey}_${i.vodId}`).join(',')}`,
    name,
    year,
    typeName: items.find((i) => i.typeName)?.typeName,
    pic: items.find((i) => i.pic)?.pic,
    // 同一部剧各源文案详略不同（「全34集」/「完结」/「更新至34集」），推到统一结论，
    // 否则同一部剧的来源列表会看起来状态各异
    remarks: inferGroupRemarks(items.map((i) => i.remarks)),
    items,
  };
}

/**
 * 把扁平的跨源搜索结果按「同名影片」聚合：
 * - 以名称分桶；桶内年份不一致时（同名翻拍）按年份拆分，无年份的条目并入年份桶；
 * - 保持传入顺序（搜索结果已按名称排序）。
 */
export function aggregateResults(list: SearchResultItem[]): AggregatedGroup[] {
  const byName = new Map<string, SearchResultItem[]>();
  for (const item of list) {
    const k = (item.name || '').trim();
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(item);
  }
  const groups: AggregatedGroup[] = [];
  for (const [name, items] of byName) {
    const years = [...new Set(items.map((i) => i.year).filter(Boolean))] as string[];
    if (years.length > 1) {
      for (const y of years) {
        groups.push(
          buildGroup(
            name,
            y,
            items.filter((i) => i.year === y),
          ),
        );
      }
      const noYear = items.filter((i) => !i.year);
      if (noYear.length) groups.push(buildGroup(name, undefined, noYear));
    } else {
      groups.push(buildGroup(name, years[0], items));
    }
  }
  return groups;
}

/**
 * 聚合影片卡片：
 * - 单源：点击直接打开该源详情（与旧体验一致）；
 * - 多源：显示「N 个来源」徽章，点击展开各源列表，选择具体源后打开详情。
 */
export function AggregatedCard({
  group,
  onOpen,
  sources,
}: {
  group: AggregatedGroup;
  onOpen: (item: SearchResultItem) => void;
  /** 完整源配置：探测画质需要 source.url / source.detail，搜索结果里只带 sourceUrl */
  sources?: SourceConfig[];
}) {
  const screens = Grid.useBreakpoint();
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const showImg = !!group.pic && !imgFailed;

  const multi = group.items.length > 1;
  const adult = useMemo(() => group.items.some((i) => i.isAdult), [group.items]);

  const { qualities, probing, progress, prime, probe, probeQueued, retry } =
    useQualityProbe(sources);

  // 收起态就要有结论：先读缓存（展开时才真正探测）。
  // 依赖 group.key 而不是 items 数组——搜索页每次重渲染都会重建分组对象，
  // 用数组做依赖会让这个 effect 每帧触发，进而 setState 死循环。
  useEffect(() => {
    prime(group.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.key]);

  // 单源卡片没有「展开」这一步：进入视口 500ms 后交给全局队列（并发 2），
  // 首屏能先亮，又不会把一屏十几张卡同时打向源站
  const { ref: inViewRef, inView } = useInView<HTMLDivElement>(!multi);
  useEffect(() => {
    if (!multi && inView) probeQueued(group.items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multi, inView, group.key]);

  const singleItem = multi ? undefined : group.items[0];
  const singleKey = singleItem ? qualityKey(singleItem.sourceKey, singleItem.vodId) : undefined;

  // 展开面板按画质降序（同级保持原有源顺序）：探到一个更好的就往上走，
  // 用户不必自己横向比较三行灰字。没探到 / 未探到的排在最后。
  const heightOf = (item: SearchResultItem) =>
    qualities[qualityKey(item.sourceKey, item.vodId)]?.height ?? 0;
  const sortedItems = useMemo(() => {
    const height = (item: SearchResultItem) =>
      qualities[qualityKey(item.sourceKey, item.vodId)]?.height ?? 0;
    return group.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => height(b.item) - height(a.item) || a.index - b.index)
      .map((entry) => entry.item);
  }, [group.items, qualities]);
  const bestHeight = sortedItems.reduce((max, item) => Math.max(max, heightOf(item)), 0);
  // 并列最高时只强调排在第一的那一行：三个源里框两个等于没有推荐
  const firstBest = sortedItems.find((item) => bestHeight > 0 && heightOf(item) === bestHeight);
  const bestKey = firstBest ? qualityKey(firstBest.sourceKey, firstBest.vodId) : undefined;
  // 各源集数一致时（常见：同剧多源同步更新）只在表头说一次，逐行不再重复
  const remarksList = sortedItems.map((item) => compactRemarks(item.remarks));
  const sharedRemarks =
    remarksList.length > 0 && remarksList.every((label) => label && label === remarksList[0])
      ? remarksList[0]
      : undefined;

  const summary = (
    <Flex gap={12} style={{ minWidth: 0 }}>
      <Flex
        align="center"
        justify="center"
        style={{
          width: screens.sm ? 108 : 84,
          aspectRatio: '2/3',
          flexShrink: 0,
          overflow: 'hidden',
          borderRadius: 6,
          background: 'var(--ant-color-fill-tertiary)',
        }}
      >
        {showImg ? (
          <SmartImage
            url={group.pic}
            mode={imageProxyMode}
            customProxy={customImageProxy}
            alt={group.name}
            style={{ width: '100%', height: '100%' }}
            onExhausted={() => setImgFailed(true)}
          />
        ) : (
          <VideoCameraOutlined
            style={{ fontSize: 32, color: 'var(--ant-color-text-quaternary)' }}
            aria-hidden
          />
        )}
      </Flex>
      <Flex vertical gap={8} style={{ minWidth: 0, flex: 1 }}>
        <Typography.Text strong ellipsis={{ tooltip: group.name }}>
          {group.name}
        </Typography.Text>
        <Flex wrap gap={4}>
          {group.typeName && <Tag color="gold">{group.typeName}</Tag>}
          {group.year && <Tag color="purple">{group.year}</Tag>}
          {adult && <Tag color="magenta">18+</Tag>}
          {singleKey && (
            <QualityBadge
              entry={qualities[singleKey]}
              loading={probing[singleKey]}
              onRetry={singleItem ? () => retry([singleItem]) : undefined}
            />
          )}
        </Flex>
        <Typography.Paragraph
          type="secondary"
          ellipsis={{ rows: 2 }}
          style={{ margin: 0, fontSize: 12 }}
        >
          {group.remarks || '暂无介绍'}
        </Typography.Paragraph>
        <Flex wrap align="center" gap={4} style={{ marginTop: 'auto' }}>
          <Tag>{multi ? `${group.items.length} 个来源` : group.items[0].sourceName}</Tag>
          {multi && progress.best && <Tag color="gold">最高 {progress.best}</Tag>}
        </Flex>
      </Flex>
    </Flex>
  );

  return (
    <Card
      ref={inViewRef}
      size="small"
      hoverable={!multi}
      styles={{ body: { padding: multi ? 0 : 12 } }}
      role={!multi ? 'button' : undefined}
      tabIndex={!multi ? 0 : undefined}
      onClick={!multi ? () => onOpen(group.items[0]) : undefined}
      onKeyDown={
        !multi
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(group.items[0]);
              }
            }
          : undefined
      }
    >
      {multi ? (
        <Collapse
          ghost
          size="small"
          expandIconPlacement="end"
          activeKey={expanded ? ['sources'] : []}
          onChange={(keys) => {
            const next = keys.includes('sources');
            setExpanded(next);
            if (next) probe(group.items);
          }}
          items={[
            {
              key: 'sources',
              label: summary,
              children: (
                <Flex vertical gap={8}>
                  <Flex justify="space-between" wrap gap={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      选择来源{sharedRemarks ? ` · 均 ${sharedRemarks}` : ''}
                    </Typography.Text>
                    {progress.total > 0 && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {progress.done < progress.total
                          ? `探测中 ${progress.done}/${progress.total}`
                          : `${progress.best ? '最高 ' + progress.best : '未能探到画质'}${progress.failed > 0 ? ' · ' + progress.failed + ' 源未探到' : ''}`}
                      </Typography.Text>
                    )}
                  </Flex>
                  {sortedItems.map((item) => {
                    const itemKey = qualityKey(item.sourceKey, item.vodId);
                    const label = compactRemarks(item.remarks);
                    return (
                      <Card
                        key={itemKey}
                        size="small"
                        hoverable
                        role="button"
                        tabIndex={0}
                        style={{
                          borderColor:
                            itemKey === bestKey ? 'var(--ant-color-primary-border)' : undefined,
                        }}
                        styles={{ body: { padding: 8 } }}
                        aria-label={`使用 ${item.sourceName} 播放${label && !sharedRemarks ? '，' + label : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpen(item);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            onOpen(item);
                          }
                        }}
                      >
                        <Flex align="center" gap={8}>
                          <Typography.Text ellipsis strong style={{ minWidth: 0, flex: 1 }}>
                            {item.sourceName}
                          </Typography.Text>
                          <QualityBadge
                            entry={qualities[itemKey]}
                            loading={probing[itemKey]}
                            onRetry={() => retry([item])}
                            style={{
                              minWidth: 52,
                              textAlign: 'center',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                          {!sharedRemarks && label && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {label}
                            </Typography.Text>
                          )}
                          <PlayCircleOutlined style={{ fontSize: 18 }} aria-hidden />
                        </Flex>
                      </Card>
                    );
                  })}
                </Flex>
              ),
            },
          ]}
        />
      ) : (
        summary
      )}
    </Card>
  );
}

/** 单源影片卡片，复用聚合卡片的单源业务分支。 */
export function VideoCard({ item, onClick }: { item: SearchResultItem; onClick: () => void }) {
  return <AggregatedCard group={buildGroup(item.name, item.year, [item])} onOpen={onClick} />;
}

/** 推荐海报：Card 负责交互、Typography 负责截断。 */
export function DoubanCard({
  item,
  onClick,
}: {
  item: { title: string; cover: string; rating?: string };
  onClick: () => void;
}) {
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => setImgFailed(false), [item.cover]);
  return (
    <Card
      hoverable
      size="small"
      role="button"
      tabIndex={0}
      aria-label={`搜索 ${item.title}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      cover={
        <Flex
          align="center"
          justify="center"
          style={{
            aspectRatio: '2/3',
            overflow: 'hidden',
            background: 'var(--ant-color-fill-tertiary)',
          }}
        >
          {item.cover && !imgFailed ? (
            <SmartImage
              url={item.cover}
              mode={imageProxyMode}
              customProxy={customImageProxy}
              alt={item.title}
              style={{ width: '100%', height: '100%' }}
              onExhausted={() => setImgFailed(true)}
            />
          ) : (
            <VideoCameraOutlined
              style={{ fontSize: 32, color: 'var(--ant-color-text-quaternary)' }}
              aria-hidden
            />
          )}
        </Flex>
      }
    >
      <Flex vertical gap={6}>
        <Typography.Text ellipsis={{ tooltip: item.title }} strong>
          {item.title}
        </Typography.Text>
        {item.rating && (
          <Tag color="gold" style={{ alignSelf: 'flex-start' }}>
            ★ {item.rating}
          </Tag>
        )}
      </Flex>
    </Card>
  );
}
