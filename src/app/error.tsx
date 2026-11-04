'use client';
import { Result, Button, Flex, Layout, Typography } from 'antd';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * 路由段级错误边界：捕获页面渲染/数据异常，避免落到 Next 默认英文白屏。
 * 刻意不放 Header——它依赖 zustand store，若异常源正是 store 会二次崩溃。
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Meet you] 页面渲染异常:', error);
  }, [error]);

  return (
    <Layout style={{ minHeight: '100dvh', background: 'var(--ant-color-bg-layout)' }}>
      <Flex
        style={{ paddingInline: 16, flex: '1 1 0%' }}

        align="center"
        justify="center"
        component="main"
      >
        <Result
          status="warning"
          subTitle={'页面出了点问题，请重试。若持续失败请返回首页。'}
          extra={<Button onClick={reset}>{'重试'}</Button>}
        />
      </Flex>
      <Layout.Footer style={{ textAlign: 'center', background: 'transparent' }}>
        <Typography.Paragraph
          type="secondary"
          style={{ margin: 0, textAlign: 'center', fontSize: 'var(--ant-font-size-sm)' }}
        >
          问题持续存在？ <Link href="/">返回首页</Link>
        </Typography.Paragraph>
      </Layout.Footer>
    </Layout>
  );
}
