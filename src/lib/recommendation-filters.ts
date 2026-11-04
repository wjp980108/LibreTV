'use client';

import { create } from 'zustand';

export const MOVIE_TAGS = ['热门', '最新', '经典', '豆瓣高分', '冷门佳片', '华语', '欧美', '韩国', '日本', '动画'];
export const TV_TAGS = ['热门', '美剧', '英剧', '韩剧', '日剧', '国产剧', '港剧', '日本动画', '综艺', '纪录片'];
export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const HOT_LISTS = [
  { id: 'douban_movie_weekly', label: '电影周榜' },
  { id: 'douban_tv_chinese', label: '国产剧周榜' },
  { id: 'douban_tv_global', label: '海外剧周榜' },
  { id: 'douban_show_chinese', label: '国内综艺' },
  { id: 'douban_show_global', label: '海外综艺' },
  { id: 'baidu_teleplay', label: '百度热播剧' },
];

export type DoubanType = 'movie' | 'tv';
export type Weekday = number | 'all';

interface RecommendationFilters {
  doubanType: DoubanType;
  doubanTag: string;
  weekday: Weekday;
  hotListId: string;
  selectDouban: (type: DoubanType, tag: string) => void;
  selectWeekday: (weekday: Weekday) => void;
  selectHotList: (id: string) => void;
}

/** Shared by the category menu and recommendation queries, including across navigation. */
export const useRecommendationFilters = create<RecommendationFilters>((set) => ({
  doubanType: 'movie',
  doubanTag: '热门',
  weekday: 'all',
  hotListId: HOT_LISTS[0].id,
  selectDouban: (doubanType, doubanTag) => set({ doubanType, doubanTag }),
  selectWeekday: (weekday) => set({ weekday }),
  selectHotList: (hotListId) => set({ hotListId }),
}));
