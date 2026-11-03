'use client';

import { Button, ConfigProvider, Flex, Layout, Result, Typography, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

/** Root errors cannot depend on the failed root layout or its providers. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: '#121312' }}>
        <ConfigProvider
          locale={zhCN}
          theme={{
            algorithm: theme.darkAlgorithm,
            token: { colorPrimary: '#d9b878', colorBgBase: '#121312', colorTextBase: '#eeede8' },
            components: { Button: { primaryColor: '#19170f' } },
          }}
        >
          <Layout style={{ minHeight: '100dvh' }}>
            <Flex
              vertical
              align="center"
              justify="center"
              style={{ minHeight: '100dvh', padding: 16 }}
            >
              <Result
                status="error"
                title="应用发生错误"
                subTitle="请刷新页面重试。"
                extra={
                  <Button type="primary" onClick={reset}>
                    刷新
                  </Button>
                }
              />
              {error.digest && (
                <Typography.Text type="secondary">错误编号：{error.digest}</Typography.Text>
              )}
            </Flex>
          </Layout>
        </ConfigProvider>
      </body>
    </html>
  );
}
