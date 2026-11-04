import { db, MAX_HISTORY, MAX_SEARCH_HISTORY, type HistoryEntry, type ProgressEntry, type SearchHistoryEntry } from './db';
import { useAppStore, STORE_VERSION } from './store';
import { PERSIST_KEY, flushPendingPersist } from './persist-storage';
import { loadCacheSettings, SETTINGS_KEY as CACHE_KEY, type CacheSettings } from './video-cache';
import { loadDownloadSettings, SETTINGS_KEY as DOWNLOAD_KEY, type DownloadSettings } from './download-settings';
import { readThemeChoice, THEME_STORAGE_KEY, type ThemeChoice } from './theme-preference';

const SETTING_KEYS = [
  'customAPIs', 'selectedKeys', 'envKeysSeen', 'subscriptions', 'liveEnvKeysSeen',
  'liveSubscriptions', 'liveSelectedUrls', 'liveFavorites', 'liveRecent', 'envSubsSeen',
  'yellowFilter', 'adFilter', 'doubanEnabled', 'recommendSource', 'recommendSourceTouched',
  'autoplayNext', 'skipMarks', 'autoSkipSegments', 'imageProxyMode',
  'imageProxyModeTouched', 'customImageProxy',
] as const;
type Settings = Pick<ReturnType<typeof useAppStore.getState>, typeof SETTING_KEYS[number]>;

export interface ConfigBackup {
  name: 'Meet-you-Backup';
  version: 1;
  createdAt: number;
  settings: Settings;
  preferences: { theme: ThemeChoice; cache: CacheSettings; download: DownloadSettings };
  history: HistoryEntry[];
  progress: ProgressEntry[];
  searchHistory: SearchHistoryEntry[];
}

type Row = Record<string, unknown>;
const object = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown) => number(value) && Number.isInteger(value);
const boolean = (value: unknown) => typeof value === 'boolean';
const strings = (value: unknown) => Array.isArray(value) && value.every(text);
const url = (value: unknown) => text(value) && /^https?:\/\//i.test(value) && URL.canParse(value);
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value);
const rows = (value: unknown, check: (row: Row) => boolean) => Array.isArray(value) && value.every((item) => object(item) && check(item));
const unique = (items: Row[], key: string) => new Set(items.map((item) => item[key])).size === items.length;

/** Preview and import share this validation; no storage changes happen before it completes. */
export function parseConfigBackup(content: string): ConfigBackup {
  let data: unknown;
  try { data = JSON.parse(content); } catch { throw new Error('文件不是合法的 JSON'); }
  if (!object(data) || data.name !== 'Meet-you-Backup' || data.version !== 1) {
    throw new Error('不支持此备份格式，请使用当前版本重新导出；旧版配置不可导入');
  }
  const fail = (section: string): never => { throw new Error(`备份中的${section}格式不正确，未导入任何数据`); };
  if (!number(data.createdAt)) fail('导出时间');
  const settings = data.settings;
  if (!object(settings)) return fail('设置');
  const checks: Record<typeof SETTING_KEYS[number], (value: unknown) => boolean> = {
    customAPIs: (v) => rows(v, (s) => nonempty(s.key) && nonempty(s.name) && url(s.url)
      && optional(s.detail, text) && optional(s.isAdult, boolean)) && unique(v as Row[], 'key'),
    selectedKeys: strings, envKeysSeen: strings, liveEnvKeysSeen: strings,
    liveSelectedUrls: strings, liveFavorites: strings, envSubsSeen: strings,
    subscriptions: (v) => rows(v, (s) => url(s.url) && optional(s.name, text)
      && optional(s.enabled, boolean) && optional(s.refreshDays, (n) => integer(n) && (n as number) >= 1 && (n as number) <= 365)),
    liveSubscriptions: (v) => rows(v, (s) => url(s.url) && optional(s.name, text)
      && optional(s.epg, text) && strings(s.fromSubscriptions)),
    liveRecent: (v) => rows(v, (s) => nonempty(s.url) && text(s.name) && number(s.timestamp)
      && ['logo', 'group', 'tvgId', 'epg', 'sourceUrl'].every((key) => optional(s[key], text))),
    yellowFilter: boolean, adFilter: boolean, doubanEnabled: boolean,
    recommendSource: (v) => ['douban', 'bangumi', 'hot-list'].includes(v as string),
    recommendSourceTouched: boolean, autoplayNext: boolean, autoSkipSegments: boolean,
    imageProxyMode: (v) => ['direct', 'proxy', 'custom'].includes(v as string),
    imageProxyModeTouched: boolean, customImageProxy: text,
    skipMarks: (v) => object(v) && Object.values(v).every((mark) => object(mark)
      && boolean(mark.enabled) && number(mark.updatedAt) && rows(mark.segments, (s) =>
        ['opening', 'middle', 'ending'].includes(s.type as string) && number(s.start)
        && ((number(s.end) && s.end > s.start) || (s.type === 'ending' && s.end === -1)))),
  };
  for (const key of SETTING_KEYS) if (!checks[key](settings[key])) fail(`设置「${key}」`);
  if (!rows(data.history, (h) => nonempty(h.sourceKey) && nonempty(h.vodId)
    && h.id === `${h.sourceKey}_${h.vodId}` && text(h.title)
    && ['sourceUrl', 'pic'].every((key) => optional(h[key], text))
    && integer(h.episodeIndex) && integer(h.totalEpisodes)
    && number(h.playbackPosition) && number(h.duration) && number(h.timestamp))) fail('观看历史');
  if (!rows(data.progress, (p) => nonempty(p.key) && number(p.position) && number(p.duration) && number(p.updatedAt))) fail('逐集进度');
  if (!rows(data.searchHistory, (s) => nonempty(s.text) && s.text.length <= 50 && number(s.timestamp))) fail('搜索记录');
  const prefs = data.preferences;
  if (!object(prefs) || !['light', 'dark', 'system'].includes(prefs.theme as string)
    || !object(prefs.download) || !boolean(prefs.download.proxy)
    || !object(prefs.cache) || !boolean(prefs.cache.enabled)
    || !number(prefs.cache.horizonSeconds)
    || !(prefs.cache.horizonSeconds === 0 || (prefs.cache.horizonSeconds >= 60 && prefs.cache.horizonSeconds <= 7200))
    || !number(prefs.cache.maxBytesPerEpisode) || prefs.cache.maxBytesPerEpisode < 50 * 1024 ** 2 || prefs.cache.maxBytesPerEpisode > 8 * 1024 ** 3
    || !number(prefs.cache.maxTotalBytes) || prefs.cache.maxTotalBytes < 100 * 1024 ** 2 || prefs.cache.maxTotalBytes > 20 * 1024 ** 3) fail('本机偏好');
  // Only known settings can reach the store (never methods or runtime/env data).
  const result = data as unknown as ConfigBackup;
  result.settings = Object.fromEntries(SETTING_KEYS.map((key) => [key, settings[key]])) as Settings;
  return result;
}

export async function exportConfig(): Promise<string> {
  const state = useAppStore.getState();
  const settings = Object.fromEntries(SETTING_KEYS.map((key) => [key, state[key]])) as Settings;
  // Sync results and failure penalties are temporary; preserve only subscription choices.
  settings.subscriptions = state.subscriptions.map(({ url, name, enabled, refreshDays }) => ({ url, name, enabled, refreshDays }));
  settings.liveSubscriptions = state.liveSubscriptions.map(({ url, name, epg, fromSubscriptions }) => ({ url, name, epg, fromSubscriptions }));
  const records = await db.transaction('r', [db.history, db.progress, db.searchHistory], async () => ({
    history: await db.history.toArray(),
    progress: await db.progress.toArray(),
    searchHistory: await db.searchHistory.toArray(),
  }));
  const backup: ConfigBackup = {
    name: 'Meet-you-Backup', version: 1, createdAt: Date.now(), settings,
    preferences: { theme: readThemeChoice(), cache: loadCacheSettings(), download: loadDownloadSettings() },
    ...records,
  };
  const content = JSON.stringify(backup, null, 2);
  parseConfigBackup(content);
  return content;
}

/** Keep the latest record for each ID. Ties prefer the incoming backup. */
function mergeNewest<T>(current: T[], incoming: T[], key: (row: T) => string, time: (row: T) => number): T[] {
  const merged = new Map<string, T>();
  for (const row of [...current, ...incoming]) {
    const previous = merged.get(key(row));
    if (!previous || time(row) >= time(previous)) merged.set(key(row), row);
  }
  return [...merged.values()].sort((a, b) => time(b) - time(a));
}

export async function importConfig(content: string): Promise<void> {
  const backup = parseConfigBackup(content);
  flushPendingPersist();
  const keys = [PERSIST_KEY, THEME_STORAGE_KEY, CACHE_KEY, DOWNLOAD_KEY];
  let previous: (string | null)[] = [];
  let storageChanged = false;
  try {
    await db.transaction('rw', [db.history, db.progress, db.searchHistory], async () => {
      const history = mergeNewest(await db.history.toArray(), backup.history, (h) => h.id, (h) => h.timestamp).slice(0, MAX_HISTORY);
      const progress = mergeNewest(await db.progress.toArray(), backup.progress, (p) => p.key, (p) => p.updatedAt);
      const searches = mergeNewest(await db.searchHistory.toArray(), backup.searchHistory, (s) => s.text, (s) => s.timestamp).slice(0, MAX_SEARCH_HISTORY);
      await db.history.clear();
      await db.history.bulkPut(history);
      await db.progress.bulkPut(progress);
      await db.searchHistory.clear();
      await db.searchHistory.bulkPut(searches);
      // A storage quota error aborts the IndexedDB transaction as well.
      flushPendingPersist();
      previous = keys.map((key) => localStorage.getItem(key));
      storageChanged = true;
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ state: { ...backup.settings, sourceHealth: {}, qualityMap: {} }, version: STORE_VERSION }));
      localStorage.setItem(THEME_STORAGE_KEY, backup.preferences.theme);
      localStorage.setItem(CACHE_KEY, JSON.stringify(backup.preferences.cache));
      localStorage.setItem(DOWNLOAD_KEY, JSON.stringify(backup.preferences.download));
    });
  } catch (error) {
    if (storageChanged) keys.forEach((key, i) => {
      if (previous[i] === null) localStorage.removeItem(key);
      else localStorage.setItem(key, previous[i]!);
    });
    throw error;
  }
  // Keep the in-memory state consistent until the caller reloads the page.
  useAppStore.setState({ ...backup.settings, sourceHealth: {}, qualityMap: {} });
  flushPendingPersist();
}
