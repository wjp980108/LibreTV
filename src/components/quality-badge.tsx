'use client';

import type { CSSProperties } from 'react';
import { Button, Spin, Tag, Tooltip } from 'antd';
import { describeQualityBadge } from '@/lib/quality';
import type { QualityEntry } from '@/lib/types';

/** Business quality states are rendered with Ant Design Tag, Tooltip and Button. */
export function QualityBadge({
  entry,
  loading,
  onRetry,
  showReason,
  style,
}: {
  entry?: QualityEntry;
  loading?: boolean;
  onRetry?: () => void;
  showReason?: boolean;
  style?: CSSProperties;
}) {
  const view = describeQualityBadge(entry, loading);
  if (!view) return null;
  const label =
    view.kind === 'failed'
      ? (view.label ?? '未测到')
      : view.kind === 'unknown'
        ? '未知'
        : view.label;
  if (view.kind === 'failed' && view.retryable && onRetry)
    return (
      <Tooltip title={view.title}>
        <Button
          color="orange"
          variant="text"
          size="small"
          style={style}
          aria-label={`本次没测到画质${view.reason ? `（${view.reason}）` : ''}，点击重试`}
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            onRetry();
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {label}
          {showReason && view.reason && ` · ${view.reason}`}
        </Button>
      </Tooltip>
    );
  return (
    <Tooltip title={view.title}>
      <Tag
        style={style}
        color={
          view.kind === 'failed'
            ? 'warning'
            : view.kind === 'value' && (entry?.height ?? 0) >= 1080
              ? 'gold'
              : undefined
        }
        icon={view.kind === 'loading' ? <Spin size="small" /> : undefined}
        aria-label={view.kind === 'loading' ? '正在探测画质' : undefined}
      >
        {view.kind === 'loading' ? '…' : label}
        {showReason && view.reason && ` · ${view.reason}`}
      </Tag>
    </Tooltip>
  );
}
