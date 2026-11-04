import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type HistoryEntry } from './db';
import { exportConfig, importConfig, parseConfigBackup } from './config-backup';
import { useAppStore } from './store';
import { flushPendingPersist, PERSIST_KEY } from './persist-storage';
import { SETTINGS_KEY as CACHE_KEY } from './video-cache';
import { SETTINGS_KEY as DOWNLOAD_KEY } from './download-settings';
import { THEME_STORAGE_KEY } from './theme-preference';

const history = (id: string, timestamp: number, position: number): HistoryEntry => ({
  id: `custom_test_${id}`, sourceKey: 'custom_test', sourceUrl: 'https://example.com/vod', vodId: id,
  title: `影片 ${id}`, pic: 'https://example.com/poster.jpg', episodeIndex: 2,
  totalEpisodes: 10, playbackPosition: position, duration: 1200, timestamp,
});

beforeEach(async () => {
  flushPendingPersist();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  });
  useAppStore.setState(useAppStore.getInitialState(), true);
  flushPendingPersist();
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  flushPendingPersist();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('个人备份与恢复', () => {
  it('完整往返恢复源、偏好、观看历史、逐集进度和搜索记录', async () => {
    useAppStore.setState({
      customAPIs: [{ key: 'custom_test', name: '测试源', url: 'https://example.com/vod' }],
      selectedKeys: ['custom_test'], autoplayNext: false,
      sourceHealth: { custom_test: { ok: false, failStreak: 3, timestamp: 100, permanent: true } },
    });
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    localStorage.setItem(CACHE_KEY, JSON.stringify({ enabled: false }));
    localStorage.setItem(DOWNLOAD_KEY, JSON.stringify({ proxy: true }));
    await db.history.put(history('1', 1000, 300));
    await db.progress.put({ key: 'custom_test_1_2', position: 300, duration: 1200, updatedAt: 1000 });
    await db.searchHistory.put({ text: '测试影片', timestamp: 1000 });
    const content = await exportConfig();
    expect(JSON.parse(content).settings).not.toHaveProperty('sourceHealth');
    expect(JSON.parse(content).settings).not.toHaveProperty('qualityMap');
    expect(JSON.parse(content).settings).not.toHaveProperty('envSources');
    await Promise.all([db.history.clear(), db.progress.clear(), db.searchHistory.clear()]);
    useAppStore.setState({ customAPIs: [], selectedKeys: [], autoplayNext: true });
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    await importConfig(content);
    expect(useAppStore.getState().customAPIs[0].key).toBe('custom_test');
    expect(useAppStore.getState().autoplayNext).toBe(false);
    expect(useAppStore.getState().sourceHealth).toEqual({});
    expect(await db.history.get('custom_test_1')).toEqual(history('1', 1000, 300));
    expect((await db.progress.get('custom_test_1_2'))?.position).toBe(300);
    expect(await db.searchHistory.get('测试影片')).toEqual({ text: '测试影片', timestamp: 1000 });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!).enabled).toBe(false);
    expect(JSON.parse(localStorage.getItem(DOWNLOAD_KEY)!).proxy).toBe(true);
  });

  it('按时间合并，保留本机更新的进度、时间戳和未重复的记录', async () => {
    const backup = parseConfigBackup(await exportConfig());
    backup.history = [history('1', 1000, 100), history('2', 3000, 200)];
    backup.progress = [{ key: 'custom_test_1_2', position: 100, duration: 1200, updatedAt: 1000 }];
    backup.searchHistory = [{ text: '本机搜索', timestamp: 500 }, { text: '新搜索', timestamp: 3000 }];
    await db.history.bulkPut([history('1', 2000, 400), history('3', 1500, 200)]);
    await db.progress.put({ key: 'custom_test_1_2', position: 400, duration: 1200, updatedAt: 2000 });
    await db.searchHistory.put({ text: '本机搜索', timestamp: 2000 });
    await importConfig(JSON.stringify(backup));
    expect(await db.history.count()).toBe(3);
    expect((await db.history.get('custom_test_1'))?.playbackPosition).toBe(400);
    expect((await db.history.get('custom_test_2'))?.timestamp).toBe(3000);
    expect((await db.progress.get('custom_test_1_2'))?.position).toBe(400);
    expect((await db.searchHistory.get('本机搜索'))?.timestamp).toBe(2000);
  });

  it('损坏的末尾数据在任何写入前被拒绝', async () => {
    const backup = parseConfigBackup(await exportConfig());
    backup.settings.autoplayNext = false;
    backup.progress = [{ key: 'bad', position: -1, duration: 20, updatedAt: 1000 }];
    const previous = localStorage.getItem(PERSIST_KEY);
    await db.history.put(history('1', 1000, 100));
    await expect(importConfig(JSON.stringify(backup))).rejects.toThrow('逐集进度');
    expect(localStorage.getItem(PERSIST_KEY)).toBe(previous);
    expect(await db.history.count()).toBe(1);
    expect(useAppStore.getState().autoplayNext).toBe(true);
  });

  it('拒绝旧版、未知版本和缺失的设置字段', async () => {
    expect(() => parseConfigBackup('{"name":"LibreTV-Settings","cfgVer":"2.0.0"}')).toThrow('旧版配置不可导入');
    const backup = JSON.parse(await exportConfig());
    backup.version = 99;
    expect(() => parseConfigBackup(JSON.stringify(backup))).toThrow('不支持');
    backup.version = 1;
    delete backup.settings.customAPIs;
    expect(() => parseConfigBackup(JSON.stringify(backup))).toThrow('customAPIs');
  });

  it('写入偏好失败时回滚历史和已写入的设置', async () => {
    const backup = parseConfigBackup(await exportConfig());
    backup.history = [history('2', 2000, 200)];
    backup.settings.autoplayNext = false;
    await db.history.put(history('1', 1000, 100));
    const previous = localStorage.getItem(PERSIST_KEY);
    const originalSet = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === CACHE_KEY) throw new Error('存储空间不足');
      originalSet(key, value);
    });
    await expect(importConfig(JSON.stringify(backup))).rejects.toThrow('存储空间不足');
    expect(await db.history.toArray()).toEqual([history('1', 1000, 100)]);
    expect(localStorage.getItem(PERSIST_KEY)).toBe(previous);
    expect(useAppStore.getState().autoplayNext).toBe(true);
  });

  it('合并后只保留最近 100 条观看历史和 10 条搜索记录', async () => {
    const backup = parseConfigBackup(await exportConfig());
    backup.history = Array.from({ length: 110 }, (_, i) => history(String(i), i, 100));
    backup.searchHistory = Array.from({ length: 15 }, (_, i) => ({ text: `搜索${i}`, timestamp: i }));
    await importConfig(JSON.stringify(backup));
    expect(await db.history.count()).toBe(100);
    expect(await db.history.get('custom_test_0')).toBeUndefined();
    expect(await db.searchHistory.count()).toBe(10);
    expect(await db.searchHistory.get('搜索0')).toBeUndefined();
  });
});
