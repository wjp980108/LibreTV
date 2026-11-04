'use client';

import type { ReactNode } from 'react';
import { Spin } from 'antd';
import { useTheme } from './theme';

/** Do not mount preference-dependent pages or their queries with placeholder settings. */
export function AppStartupBoundary({
  settingsReady,
  children,
}: {
  settingsReady: boolean;
  children: ReactNode;
}) {
  const { ready: themeReady } = useTheme();
  if (!settingsReady || !themeReady) return <AppStartup />;
  return children;
}

/** Uses the head script's theme class, independent of uninitialized component tokens. */
export function AppStartup() {
  return (
    <div className="app-startup" role="status" aria-live="polite">
      <Spin size="large" />
      <span>正在进入影院…</span>
      <noscript>请启用 JavaScript 以使用 Meet you。</noscript>
    </div>
  );
}
