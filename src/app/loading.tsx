'use client';

import { Flex, Spin, Typography } from 'antd';

export default function Loading() {
  return (
    <Flex
      vertical
      gap={16}
      align="center"
      justify="center"
      style={{ minHeight: '100dvh' }}
      role="status"
    >
      <Spin size="large" />
      <Typography.Text type="secondary">正在进入影院…</Typography.Text>
    </Flex>
  );
}
