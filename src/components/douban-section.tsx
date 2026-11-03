'use client';

import { ReloadOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useState } from 'react';
import {
  Button,
  Segmented,
  Skeleton,
  Tag,
  Row,
  Col,
  Typography,
  Empty,
  Result,
  Divider,
  Flex,
} from 'antd';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import type { DoubanItem } from '@/lib/types';
import { DoubanCard } from './video-card';

const MOVIE_TAGS = [
  '热门',
  '最新',
  '经典',
  '豆瓣高分',
  '冷门佳片',
  '华语',
  '欧美',
  '韩国',
  '日本',
  '动画',
];
const TV_TAGS = [
  '热门',
  '美剧',
  '英剧',
  '韩剧',
  '日剧',
  '国产剧',
  '港剧',
  '日本动画',
  '综艺',
  '纪录片',
];
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 首页推荐区：按设置展示豆瓣热门、Bangumi 新番放送或影视热榜。 */
export function RecommendSection({ onPick }: { onPick: (title: string) => void }) {
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  const recommendSource = useAppStore((s) => s.recommendSource);

  return (
    <Flex
      component="section"
      vertical
      gap={20}
      id="discover"
      style={{ scrollMarginTop: 100 }}
      aria-labelledby="discover-title"
    >
      <Flex align="center" justify="space-between" gap={12}>
        <Flex vertical>
          <Typography.Text style={{ fontSize: 10, letterSpacing: 1.8, fontWeight: 500 }}>
            FIND YOUR NEXT FAVORITE
          </Typography.Text>
          <Typography.Title level={4} id="discover-title" style={{ margin: 0 }}>
            为你发现
            <Typography.Text type="secondary" style={{ fontSize: 11, marginInlineStart: 16 }}>
              {recommendSource === 'bangumi' ? '跟上每一份热爱' : '总有一部，正合你意'}
            </Typography.Text>
          </Typography.Title>
        </Flex>
        <Typography.Text style={{ fontSize: 12 }}>
          {recommendSource === 'bangumi'
            ? 'Bangumi 每日放送'
            : recommendSource === 'hot-list'
              ? '影视热榜'
              : '豆瓣精选'}
        </Typography.Text>
      </Flex>
      {!doubanEnabled ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="首页推荐已关闭，可在影院设置中开启。你也可以在上方直接搜索影片。"
        />
      ) : recommendSource === 'bangumi' ? (
        <BangumiView onPick={onPick} />
      ) : recommendSource === 'hot-list' ? (
        <HotListView onPick={onPick} />
      ) : (
        <DoubanView onPick={onPick} />
      )}
    </Flex>
  );
}

/**
 * 豆瓣推荐：影视切换 + 标签筛选。
 * 一次性渲染全部条目：数据本就一次拉全（50 条），卡片图片又是 lazy 加载，
 * 视口外的图不会请求，因此不需要「加载更多」这类本地切片分页来打断浏览。
 */
function DoubanView({ onPick }: { onPick: (title: string) => void }) {
  const [type, setType] = useState<'movie' | 'tv'>('movie');
  const [tag, setTag] = useState('热门');

  const query = useQuery({
    queryKey: ['douban', type, tag],
    queryFn: ({ signal }) => api.douban(type, tag, 0, 50, signal),
  });

  const tags = type === 'movie' ? MOVIE_TAGS : TV_TAGS;
  const items = query.data?.items ?? [];

  const switchType = (t: 'movie' | 'tv') => {
    if (t === type) return;
    setType(t);
    setTag('热门');
  };

  return (
    <Flex component="section" vertical gap={20} aria-label="影视推荐">
      <Flex align="center" wrap gap={12}>
        <Segmented
          aria-label="影视类型"
          value={type}
          options={[
            { label: '电影', value: 'movie' },
            { label: '剧集', value: 'tv' },
          ]}
          onChange={switchType}
        />
        <Divider orientation="vertical" />
        <Flex wrap gap={4} style={{ flex: 1, minWidth: 200 }}>
          {tags.map((t) => (
            <Tag.CheckableTag key={t} checked={t === tag} onChange={() => setTag(t)}>
              {t}
            </Tag.CheckableTag>
          ))}
        </Flex>
        <Button
          type="text"

          aria-label="刷新推荐"
          title="刷新推荐"
          loading={query.isFetching}
          icon={<ReloadOutlined style={{ fontSize: 16 }} aria-hidden />}
          onClick={() => void query.refetch()}
        />
      </Flex>

      <RecommendationGrid
        items={items}
        loading={query.isLoading}
        failed={query.isError}
        onRetry={() => void query.refetch()}
        onPick={onPick}
      />
    </Flex>
  );
}

/** Bangumi 每日放送：星期筛选，一次拉全量无分页 */
function BangumiView({ onPick }: { onPick: (title: string) => void }) {
  const [weekday, setWeekday] = useState<number | 'all'>('all');

  const query = useQuery({
    queryKey: ['bangumi-calendar'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
  });

  let items: DoubanItem[] = [];
  if (query.data) {
    items =
      weekday === 'all'
        ? query.data.days.flatMap((d) => d.items)
        : (query.data.days.find((d) => d.weekday === weekday)?.items ?? []);
  }

  return (
    <Flex component="section" vertical gap={20} aria-label="新番放送推荐">
      <Flex style={{ marginBottom: 16 }} wrap gap={6}>
        <Tag.CheckableTag checked={weekday === 'all'} onChange={() => setWeekday('all')}>
          全部
        </Tag.CheckableTag>
        {WEEKDAYS.map((name, i) => (
          <Tag.CheckableTag
            key={name}
            checked={weekday === i + 1}
            onChange={() => setWeekday(i + 1)}
          >
            {name}
          </Tag.CheckableTag>
        ))}
      </Flex>

      <RecommendationGrid
        items={items}
        loading={query.isLoading}
        failed={query.isError}
        onRetry={() => void query.refetch()}
        onPick={onPick}
      />
    </Flex>
  );
}

const HOT_LISTS = [
  { id: 'douban_movie_weekly', label: '电影周榜' },
  { id: 'douban_tv_chinese', label: '国产剧周榜' },
  { id: 'douban_tv_global', label: '海外剧周榜' },
  { id: 'douban_show_chinese', label: '国内综艺' },
  { id: 'douban_show_global', label: '海外综艺' },
  { id: 'baidu_teleplay', label: '百度热播剧' },
];

/** 影视热榜（60s API）：豆瓣五个周榜 + 百度热播剧，chips 切换 */
function HotListView({ onPick }: { onPick: (title: string) => void }) {
  const [listId, setListId] = useState(HOT_LISTS[0].id);

  const query = useQuery({
    queryKey: ['hot-list', listId],
    queryFn: ({ signal }) => api.hotList(listId, signal),
  });

  const items = query.data?.items ?? [];

  return (
    <Flex component="section" vertical gap={20} aria-label="影视榜单推荐">
      <Flex style={{ marginBottom: 16 }} wrap gap={6}>
        {HOT_LISTS.map((l) => (
          <Tag.CheckableTag key={l.id} checked={listId === l.id} onChange={() => setListId(l.id)}>
            {l.label}
          </Tag.CheckableTag>
        ))}
      </Flex>

      <RecommendationGrid
        items={items}
        loading={query.isLoading}
        failed={query.isError}
        onRetry={() => void query.refetch()}
        onPick={onPick}
      />
    </Flex>
  );
}

function RecommendationGrid({
  items,
  loading,
  failed,
  onRetry,
  onPick,
}: {
  items: DoubanItem[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onPick: (title: string) => void;
}) {
  if (loading) return <GridSkeleton />;
  if (failed)
    return (
      <Result
        icon={<VideoCameraOutlined style={{ fontSize: 18 }} aria-hidden />}
        title="故事暂时还没准备好"
        subTitle="推荐加载失败，你可以重试，或在上方搜索想看的影片。"
        extra={
          <Button onClick={onRetry} icon={<ReloadOutlined style={{ fontSize: 18 }} aria-hidden />}>
            重新加载
          </Button>
        }
      />
    );
  if (items.length === 0)
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="该分类暂无推荐内容，换个分类看看吧。"
      />
    );
  return (
    <Row gutter={[16, 24]}>
      {items.map((item) => (
        <Col key={item.id} xs={8} sm={6} xl={4}>
          <DoubanCard item={item} onClick={() => onPick(item.title)} />
        </Col>
      ))}
    </Row>
  );
}

function GridSkeleton() {
  return (
    <Row gutter={[16, 24]}>
      {Array.from({ length: 12 }, (_, i) => (
        <Col key={i} xs={8} sm={6} xl={4}>
          <Skeleton.Node active style={{ width: '100%', height: 'auto', aspectRatio: '2/3' }} />
          <Skeleton active title={{ width: '70%' }} paragraph={false} style={{ marginTop: 12 }} />
        </Col>
      ))}
    </Row>
  );
}
