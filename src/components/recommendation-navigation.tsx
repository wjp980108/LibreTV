'use client';

import { CalendarOutlined, FireOutlined, PlaySquareOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { ConfigProvider, Menu, Segmented, Typography, type MenuProps } from 'antd';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { HOT_LISTS, MOVIE_TAGS, TV_TAGS, WEEKDAYS, useRecommendationFilters, type DoubanType } from '@/lib/recommendation-filters';
import styles from './cinema.module.css';

export function RecommendationNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const enabled = useAppStore((s) => s.doubanEnabled);
  const source = useAppStore((s) => s.recommendSource);
  const filters = useRecommendationFilters();

  const select = (update: () => void) => {
    update();
    onNavigate?.();
    const section = document.getElementById('discover');
    if (section) section.scrollIntoView({ block: 'start', behavior: 'auto' });
    else router.push('/#discover');
  };

  if (!enabled) {
    return <Typography.Paragraph type="secondary" style={{ padding: 16 }}>首页推荐已关闭，可在设置中开启。</Typography.Paragraph>;
  }

  let selectedKey: string;
  let items: MenuProps['items'];
  if (source === 'douban') {
    const tags = filters.doubanType === 'movie' ? MOVIE_TAGS : TV_TAGS;
    selectedKey = filters.doubanTag;
    items = tags.flatMap((tag, index) => [
      ...(index === (filters.doubanType === 'movie' ? 5 : 7) ? [{ type: 'divider' as const, key: 'separator' }] : []),
      { key: tag, label: tag, onClick: () => select(() => filters.selectDouban(filters.doubanType, tag)) },
    ]);
  } else if (source === 'bangumi') {
    selectedKey = String(filters.weekday);
    items = [
      { key: 'all', icon: <CalendarOutlined />, label: '全部放送', onClick: () => select(() => filters.selectWeekday('all')) },
      ...WEEKDAYS.map((day, index) => ({
        key: String(index + 1), label: day,
        onClick: () => select(() => filters.selectWeekday(index + 1)),
      })),
    ];
  } else {
    selectedKey = filters.hotListId;
    items = HOT_LISTS.map((list) => ({
      key: list.id, label: list.label, icon: <FireOutlined />,
      onClick: () => select(() => filters.selectHotList(list.id)),
    }));
  }

  return (
    <div className={styles.navigation}>
      <div className={styles.navigationHeader}>
        <div className={styles.navigationLabel}><span>探索片库</span><span>DISCOVER</span></div>
        {source === 'douban' ? (
          <Segmented<DoubanType> block className={styles.categorySwitch} value={filters.doubanType}
            aria-label="影片类型"
            options={[
              { value: 'movie', label: '电影', icon: <VideoCameraOutlined /> },
              { value: 'tv', label: '剧集', icon: <PlaySquareOutlined /> },
            ]}
            onChange={(type) => select(() => filters.selectDouban(type, '热门'))} />
        ) : <div className={styles.sourceLabel}>{source === 'bangumi' ? '新番放送' : '影视热榜'}</div>}
      </div>
      <div className={styles.navigationScroll}>
        <ConfigProvider theme={{ components: { Menu: { itemHeight: 38, itemMarginInline: 0, itemMarginBlock: 3, itemBorderRadius: 8 } } }}>
          <Menu aria-label="影片分类" mode="inline" selectedKeys={[selectedKey]} items={items}
            className={styles.categoryMenu} style={{ background: 'transparent', borderInlineEnd: 0 }} />
        </ConfigProvider>
        <div className={styles.sidebarNote} aria-hidden><span />在故事里，<br />与自己相遇。</div>
      </div>
    </div>
  );
}
