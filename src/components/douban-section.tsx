'use client';

import { ReloadOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Button, Skeleton, Empty, Result, Flex } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { HOT_LISTS, WEEKDAYS, useRecommendationFilters } from '@/lib/recommendation-filters';
import type { DoubanItem } from '@/lib/types';
import { DoubanCard } from './video-card';
import { CinemaHero } from './cinema-home';
import styles from './cinema.module.css';

/** Category selection lives in the sidebar; this section only displays its content. */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const enabled = useAppStore((s) => s.doubanEnabled);
  const source = useAppStore((s) => s.recommendSource);

  return (
    <Flex
      component="section"
      vertical
      gap={36}
      aria-labelledby="discover-title"
    >
      {!enabled ? (
        <>
          <CinemaHero />
          <div id="discover" className={styles.collection}>
            <div className={styles.collectionHeading}><div className={styles.collectionTitle}><h2 id="discover-title">为你发现</h2></div></div>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="首页推荐已关闭，可在设置中开启。你也可以在上方直接搜索影片。" />
          </div>
        </>
      ) : source === 'bangumi' ? (
        <BangumiView onPick={onPick} />
      ) : source === 'hot-list' ? (
        <HotListView onPick={onPick} />
      ) : (
        <DoubanView onPick={onPick} />
      )}
    </Flex>
  );
}

function RecommendationHeading({
  title,
  source,
  count,
  refreshing,
  onRefresh,
}: {
  title: string;
  source: string;
  count: number | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className={styles.collectionHeading}>
      <div className={styles.collectionTitle}>
        <h2 id="discover-title">{title}</h2>
        {count !== undefined && count > 0 && <span className={styles.collectionCount}>{count} 部作品</span>}
      </div>
      <div className={styles.collectionActions}>
        <span>{source}</span>
        <Button
          type="text"
          aria-label="刷新推荐"
          title="刷新推荐"
          loading={refreshing}
          icon={<ReloadOutlined aria-hidden />}
          onClick={onRefresh}
        />
      </div>
    </div>
  );
}

function DoubanView({ onPick }: { onPick: (title: string) => void }) {
  const type = useRecommendationFilters((s) => s.doubanType);
  const tag = useRecommendationFilters((s) => s.doubanTag);
  const query = useQuery({
    queryKey: ['douban', type, tag],
    queryFn: ({ signal }) => api.douban(type, tag, 0, 50, signal),
  });

  return (
    <RecommendationCollection
      title={type === 'movie' ? (tag === '冷门佳片' ? tag : `${tag}电影`) : tag === '热门' ? '热门剧集' : tag}
      source="豆瓣精选"
      refreshing={query.isFetching}
      onRefresh={() => void query.refetch()}
      items={query.data?.items ?? []}
      loading={query.isLoading}
      failed={query.isError}
      onPick={onPick}
    />
  );
}

function BangumiView({ onPick }: { onPick: (title: string) => void }) {
  const weekday = useRecommendationFilters((s) => s.weekday);
  const query = useQuery({
    queryKey: ['bangumi-calendar'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
  });
  const items = weekday === 'all'
    ? query.data?.days.flatMap((day) => day.items) ?? []
    : query.data?.days.find((day) => day.weekday === weekday)?.items ?? [];

  return (
    <RecommendationCollection
      title={weekday === 'all' ? '新番放送 · 全部' : `新番放送 · ${WEEKDAYS[weekday - 1]}`}
      source="Bangumi 每日放送"
      refreshing={query.isFetching}
      onRefresh={() => void query.refetch()}
      items={items}
      loading={query.isLoading}
      failed={query.isError}
      onPick={onPick}
    />
  );
}

function HotListView({ onPick }: { onPick: (title: string) => void }) {
  const listId = useRecommendationFilters((s) => s.hotListId);
  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
  });

  return (
    <RecommendationCollection
      title={HOT_LISTS.find((list) => list.id === listId)?.label ?? HOT_LISTS[0].label}
      source="影视热榜"
      refreshing={query.isFetching}
      onRefresh={() => void query.refetch()}
      items={query.data?.items ?? []}
      loading={query.isLoading}
      failed={query.isError}
      onPick={onPick}
    />
  );
}


function RecommendationCollection({
  title,
  source,
  refreshing,
  onRefresh,
  items,
  loading,
  failed,
  onPick,
}: {
  title: string;
  source: string;
  refreshing: boolean;
  onRefresh: () => void;
  items: DoubanItem[];
  loading: boolean;
  failed: boolean;
  onPick: (title: string) => void;
}) {
  return (
    <>
      <CinemaHero items={items} onPick={onPick} />
      <div id="discover" className={styles.collection}>
        <RecommendationHeading title={title} source={source} count={loading || failed ? undefined : items.length}
          refreshing={refreshing} onRefresh={onRefresh} />
        {loading ? <GridSkeleton /> : failed ? (
          <Result
            icon={<VideoCameraOutlined style={{ fontSize: 18 }} aria-hidden />}
            title="故事暂时还没准备好"
            subTitle="推荐加载失败，你可以重试，或在上方搜索想看的影片。"
            extra={<Button onClick={onRefresh} icon={<ReloadOutlined aria-hidden />}>重新加载</Button>}
          />
        ) : items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该分类暂无推荐内容，换个分类看看吧。" />
        ) : (
          <div className={styles.posterGrid}>
            {items.map((item) => (
              <div key={item.id}>
                <DoubanCard item={item} onClick={() => onPick(item.title)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className={styles.posterGrid} aria-label="正在加载推荐" aria-busy="true">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i}>
          <Skeleton.Node active style={{ width: '100%', height: 'auto', aspectRatio: '2/3' }} />
          <Skeleton active title={{ width: '70%' }} paragraph={false} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}
