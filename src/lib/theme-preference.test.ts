import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readThemeChoice, THEME_BOOTSTRAP_SCRIPT, THEME_STORAGE_KEY } from './theme-preference';

afterEach(() => vi.unstubAllGlobals());

function firstPaintTheme(storage: Storage, systemDark: boolean) {
  const toggle = vi.fn();
  runInNewContext(THEME_BOOTSTRAP_SCRIPT, {
    localStorage: storage,
    window: { matchMedia: () => ({ matches: systemDark }) },
    document: { documentElement: { classList: { toggle } } },
  });
  return toggle.mock.calls[0];
}

describe('theme initialization before hydration', () => {
  it.each([
    ['light', true, 'light', false],
    ['dark', false, 'dark', true],
    ['system', true, 'system', true],
    ['system', false, 'system', false],
    [null, false, 'dark', true],
    ['invalid-theme', false, 'dark', true],
  ] as const)('keeps first paint and React consistent for %s (system dark: %s)', (stored, systemDark, choice, dark) => {
    const storage = { getItem: vi.fn(() => stored) } as unknown as Storage;
    vi.stubGlobal('localStorage', storage);

    expect(readThemeChoice()).toBe(choice);
    expect(firstPaintTheme(storage, systemDark)).toEqual(['dark', dark]);
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
  });

  it('starts with a consistent fallback when browser storage is blocked', () => {
    const storage = {
      getItem: () => { throw new Error('Storage access denied'); },
    } as unknown as Storage;
    vi.stubGlobal('localStorage', storage);

    expect(readThemeChoice()).toBe('dark');
    expect(firstPaintTheme(storage, false)).toEqual(['dark', true]);
  });
});
