'use client';

import { App, ConfigProvider, theme } from 'antd';
import { StyleProvider } from '@ant-design/cssinjs';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { useTheme } from './theme';

/** Ant Design owns the shared design tokens, component styles and portal theme. */
export function AntdProvider({ children }: { children: ReactNode }) {
  const { resolved } = useTheme();
  const dark = resolved === 'dark';
  return (
    <StyleProvider layer>
      <ConfigProvider
        locale={zhCN}
        theme={{
          cssVar: { key: 'libretv' },
          algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        }}
      >
        <App message={{ maxCount: 4 }} notification={{ maxCount: 4 }}>
          <ThemeStyles />
          {children}
        </App>
      </ConfigProvider>
    </StyleProvider>
  );
}

/** Native scroll areas share Ant Design's tokens without replacing component scrollbars. */
function ThemeStyles() {
  const { token } = theme.useToken();
  return (
    <style>{`:root {
      --app-scrollbar-thumb: ${token.colorFill};
      --app-scrollbar-hover: ${token.colorTextQuaternary};
      --app-color-bg-container: ${token.colorBgContainer};
    }`}</style>
  );
}
