'use client';

import { Button, Empty, Space, Typography, Spin, Result, Flex, Progress, Card, Tag } from 'antd';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import type { EpgProgram } from '@/lib/types';

/**
 * EPG 节目单面板：当前节目（含播放进度条）+ 接下来节目列表 + 简介展开。
 * 仅在频道带 tvg-id 且来源订阅配置了 EPG 地址时查询；无数据优雅降级。
 */

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function LiveEpgPanel({ epgUrl, tvgId }: { epgUrl?: string; tvgId?: string }) {
  const [now, setNow] = useState(() => Date.now());
  const [expandedDesc, setExpandedDesc] = useState(false);

  // 30s 心跳刷新进度
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const enabled = Boolean(epgUrl && tvgId);
  const epgQuery = useQuery({
    queryKey: ['liveEpg', epgUrl, tvgId],
    queryFn: ({ signal }) => api.liveEpg(epgUrl!, tvgId!, false, signal),
    enabled,
    staleTime: 10 * 60_000,
  });

  if (!enabled) {
    return (
      <Empty
        style={{ paddingBlock: 16 }}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space orientation="vertical">
            <Typography.Text>
              {'该频道未配置节目单数据（需来源订阅提供 EPG 地址且频道带 tvg-id）'}
            </Typography.Text>
          </Space>
        }
      ></Empty>
    );
  }

  if (epgQuery.isLoading) {
    return (
      <Flex style={{ paddingBlock: 24 }} align="center" justify="center">
        <Spin size="small" />
      </Flex>
    );
  }

  if (epgQuery.isError) {
    return (
      <Result
        status="warning"
        subTitle={'节目单加载失败'}
        style={{ paddingBlock: 16 }}
        extra={<Button onClick={() => epgQuery.refetch()}>{'重试'}</Button>}
      />
    );
  }

  const data = epgQuery.data;
  const current = data?.current;
  const upcoming: EpgProgram[] = (data?.programs ?? []).filter((p) => p.start > now).slice(0, 5);

  const progress = current
    ? Math.min(100, Math.max(0, ((now - current.start) / (current.stop - current.start)) * 100))
    : 0;

  return (
    <Flex vertical gap={12}>
      {current ? (
        <Card size="small" style={{ marginTop: 12 }}>
          <Flex style={{ marginBottom: 6 }} align="center" gap={8}>
            <Tag color="error">正在播出</Tag>
            <Typography.Text type="secondary" style={{ fontSize: '10px' }}>
              {fmtTime(current.start)} - {fmtTime(current.stop)}
            </Typography.Text>
          </Flex>
          <Button
            type="text"
            style={{ width: '100%', textAlign: 'left' }}
            aria-expanded={expandedDesc}
            onClick={() => setExpandedDesc((v) => !v)}
          >
            {current.title}
          </Button>
          {current.desc && expandedDesc && (
            <Typography.Paragraph
              type="secondary"
              style={{
                margin: 0,
                fontSize: 'var(--ant-font-size-sm)',

                marginTop: 6,
                lineHeight: 1.625,
              }}
            >
              {current.desc}
            </Typography.Paragraph>
          )}
          {/* 已播进度条 */}
          <Progress percent={Math.round(progress)} showInfo={false} size="small" />
          <Flex
            style={{ fontSize: '10px', color: 'var(--ant-color-text-tertiary)', marginTop: 4 }}
            justify="space-between"
          >
            <Typography.Text>{fmtTime(current.start)}</Typography.Text>
            <Typography.Text>{Math.round(progress)}%</Typography.Text>
            <Typography.Text>{fmtTime(current.stop)}</Typography.Text>
          </Flex>
        </Card>
      ) : (
        <Typography.Paragraph
          type="secondary"
          style={{
            margin: 0,
            fontSize: 'var(--ant-font-size-sm)',

            textAlign: 'center',
            paddingBlock: 8,
          }}
        >
          当前时段暂无节目数据
        </Typography.Paragraph>
      )}

      {upcoming.length > 0 && (
        <Flex vertical>
          <Typography.Title
            level={4}
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size-sm)',
              fontWeight: 600,

              marginBottom: 6,
            }}
          >
            接下来
          </Typography.Title>
          <Flex
            style={{ margin: 0, padding: 0, listStyle: 'none' }}
            vertical
            gap={4}
            component="ul"
          >
            {upcoming.map((p) => (
              <Flex
                role="listitem"
                align="center"
                gap={8}
                component="li"
                key={`${p.start}-${p.title}`}
                style={{
                  fontSize: 'var(--ant-font-size-sm)',
                  paddingInline: 8,
                  paddingBlock: 6,
                  borderRadius: 'var(--ant-border-radius)',
                  color: 'var(--ant-color-text-secondary)',
                }}
                title={p.desc || p.title}
              >
                <Typography.Text
                  type="secondary"
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    flexShrink: 0,
                  }}
                >
                  {fmtTime(p.start)}
                </Typography.Text>
                <Typography.Text ellipsis style={{ minWidth: 0 }}>
                  {p.title}
                </Typography.Text>
              </Flex>
            ))}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}
