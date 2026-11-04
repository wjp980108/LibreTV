'use client';

import { Layout, Flex, Typography } from 'antd';

export function SiteFooter() {
  return (
    <Layout.Footer
      style={{
        padding: '20px 16px',
        borderTop: '1px solid var(--ant-color-border-secondary)',
        background: 'transparent',
      }}
    >
      <Flex align="center" justify="center" wrap gap={6}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Meet you · AGPL-3.0 License
        </Typography.Text>
      </Flex>
    </Layout.Footer>
  );
}
