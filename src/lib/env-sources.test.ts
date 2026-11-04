import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnvSources } from './env-sources';
import defaultSources from './default-sources.json';

afterEach(() => vi.unstubAllEnvs());

describe('项目默认点播源', () => {
  it('未配置时加载项目默认源，key 和地址唯一', () => {
    vi.stubEnv('DEFAULT_SOURCES', '');
    const sources = getEnvSources();
    expect(sources).toEqual(defaultSources);
    expect(sources.length).toBeGreaterThan(0);
    expect(new Set(sources.map((source) => source.key)).size).toBe(sources.length);
    expect(new Set(sources.map((source) => source.url)).size).toBe(sources.length);
  });

  it('部署配置覆盖项目默认源，空数组可禁用', () => {
    vi.stubEnv('DEFAULT_SOURCES', JSON.stringify([{ name: '自建源', url: 'https://example.com/vod/' }]));
    expect(getEnvSources()).toEqual([
      { key: 'env_0', name: '自建源', url: 'https://example.com/vod', isAdult: false },
    ]);
    vi.stubEnv('DEFAULT_SOURCES', '[]');
    expect(getEnvSources()).toEqual([]);
  });
});
