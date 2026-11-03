'use client';

import { Button, Flex, Layout, Result } from 'antd';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';

export default function NotFound() {
  return (
    <Layout style={{ minHeight: '100dvh' }}>
      <Header />
      <Layout.Content>
        <Flex align="center" justify="center" style={{ minHeight: '70dvh', padding: 16 }}>
          <Result
            status="404"
            title="页面不存在"
            subTitle="这个地址暂时没有内容，回到影院继续寻找好故事。"
            extra={
              <Button type="primary" href="/">
                返回影院
              </Button>
            }
          />
        </Flex>
      </Layout.Content>
      <SiteFooter />
    </Layout>
  );
}
