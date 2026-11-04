'use client';

import { Button, Tooltip } from 'antd';
import { DesktopOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { readThemeChoice, THEME_STORAGE_KEY, type ThemeChoice } from '@/lib/theme-preference';

/**
 * 主题上下文：light / dark / system，持久化到 localStorage，默认 dark。
 * html 上的 .dark 类由 layout 中的内联脚本先行设置（避免首屏闪烁），此处负责后续切换。
 */

export type { ThemeChoice } from '@/lib/theme-preference';

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: 'light' | 'dark';
  ready: boolean;
  setTheme: (t: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  resolved: 'dark',
  ready: false,
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(choice: ThemeChoice): 'light' | 'dark' {
  const resolved = choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>('dark');
  const [resolved, setResolved] = useState<'light' | 'dark'>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readThemeChoice();
    setThemeState(stored);
    setResolved(apply(stored));
    setReady(true);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const current = readThemeChoice();
      if (current === 'system') {
        setResolved(apply('system'));
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: ThemeChoice) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // Theme switching remains available when persistence is blocked.
    }
    setThemeState(t);
    setResolved(apply(t));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, ready, setTheme }}>{children}</ThemeContext.Provider>
  );
}

/** 亮暗切换按钮：在 light → dark → system 三态间循环 */
export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const next: ThemeChoice = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const label =
    theme === 'system'
      ? `跟随系统（当前${resolved === 'dark' ? '深色' : '浅色'}）`
      : theme === 'dark'
        ? '深色'
        : '浅色';
  const nextLabel = next === 'light' ? '浅色' : next === 'dark' ? '深色' : '跟随系统';

  return (
    <Tooltip title={`主题：${label}，点击切换为${nextLabel}`}>
      <Button
        type="text"
        aria-label={`切换主题，当前 ${label}`}
        onClick={() => setTheme(next)}
        icon={
          theme === 'system' ? (
            <DesktopOutlined />
          ) : resolved === 'dark' ? (
            <MoonOutlined />
          ) : (
            <SunOutlined />
          )
        }
      />
    </Tooltip>
  );
}
