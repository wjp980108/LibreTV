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
          token: {
            colorPrimary: dark ? '#d9b878' : '#896326',
            colorInfo: dark ? '#d9b878' : '#896326',
            colorBgBase: dark ? '#121312' : '#faf9f6',
            colorBgLayout: dark ? '#121312' : '#f8f7f4',
            colorBgContainer: dark ? '#191b18' : '#fffefb',
            colorBgElevated: dark ? '#1d1f1c' : '#fffefb',
            colorBorderSecondary: dark ? '#2f312a' : '#e1ded5',
            colorTextBase: dark ? '#eeede8' : '#272923',
            borderRadius: 8,
            fontFamily: 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          },
          components: {
            Button: {
              primaryColor: dark ? '#19170f' : '#ffffff',
              defaultShadow: 'none',
              primaryShadow: 'none',
            },
            Segmented: { trackBg: dark ? '#1d1f1c' : '#eeece6' },
          },
        }}
      >
        <App message={{ maxCount: 4 }} notification={{ maxCount: 4 }}>
          {children}
        </App>
      </ConfigProvider>
    </StyleProvider>
  );
}
