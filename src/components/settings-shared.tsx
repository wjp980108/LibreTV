'use client';

import { ThunderboltOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { Button, Tag, Space, Tooltip } from 'antd';

import { useCallback, useState } from 'react';
import { formatDisableTtl } from '@/lib/utils';
import { isInDisabledSubscription, useAppStore } from '@/lib/store';
import { useToast } from './toast';

/** Shared source-probe state and health presentation. Generic controls are imported from antd at their call sites. */

/** 探活结果（点播 / 直播共用同一结构） */
export type TestState =
  | { status: 'loading' }
  | { status: 'done'; ok: boolean; ms?: number; count?: number; error?: string };

/** 探活结果状态管理：替代两条源列表各自维护一份 tests 的实现 */
export function useSourceTests() {
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const runTest = useCallback(
    async (
      key: string,
      run: () => Promise<{ ok: boolean; ms?: number; count?: number; error?: string }>,
    ) => {
      setTests((prev) => ({ ...prev, [key]: { status: 'loading' } }));
      try {
        const r = await run();
        setTests((prev) => ({
          ...prev,
          [key]: r.ok
            ? { status: 'done', ok: true, ms: r.ms, count: r.count }
            : { status: 'done', ok: false, error: r.error },
        }));
      } catch (err) {
        setTests((prev) => ({
          ...prev,
          [key]: {
            status: 'done',
            ok: false,
            error: err instanceof Error ? err.message : '测试失败',
          },
        }));
      }
    },
    [],
  );
  return { tests, runTest };
}

/** Source probe results retain their business meaning; Ant Design renders all controls. */
export function TestBadge({
  state,
  onTest,
  title,
  badgeWhenOk,
}: {
  state?: TestState;
  onTest: () => void;
  title: string;
  badgeWhenOk: (result: { ms?: number; count?: number }) => string;
}) {
  return (
    <Space style={{ flexShrink: 0 }} size={4}>
      {state?.status === 'done' && (
        <Tooltip title={state.ok ? `${state.ms ?? '-'}ms` : state.error}>
          <Tag color={state.ok ? 'success' : 'error'}>
            {state.ok
              ? badgeWhenOk({ ms: state.ms, count: state.count })
              : state.error?.slice(0, 12) || '失败'}
          </Tag>
        </Tooltip>
      )}
      <Tooltip title={title}>
        <Button
          type="text"
          size="small"
          aria-label={title}
          loading={state?.status === 'loading'}
          onClick={onTest}
          icon={<ThunderboltOutlined style={{ fontSize: 16 }} aria-hidden />}
        />
      </Tooltip>
    </Space>
  );
}

/** Search health, subscription status and the source recovery action are business state. */
export function HealthBadge({ sourceKey }: { sourceKey: string }) {
  const entry = useAppStore((state) => state.sourceHealth[sourceKey]);
  const inDisabledSub = useAppStore((state) => isInDisabledSubscription(state, sourceKey));
  const { toast } = useToast();
  if (inDisabledSub)
    return (
      <Tooltip title="所属订阅已被停用，该源暂不参与搜索；到「数据源订阅」重新启用即可">
        <Tag color="warning">订阅已停用</Tag>
      </Tooltip>
    );
  if (!entry) return null;
  const permanent = entry.permanent === true;
  const disabled = permanent || (!!entry.disabledUntil && entry.disabledUntil > Date.now());
  if (disabled) {
    const remaining = formatDisableTtl((entry.disabledUntil ?? 0) - Date.now());
    return (
      <Space style={{ flexShrink: 0 }} size={4}>
        <Tooltip
          title={
            permanent
              ? `已第 ${entry.disableCount} 次被自动停用，暂停参与搜索；点「恢复」重新启用`
              : `连续 ${entry.failStreak} 次超时/失败，${remaining}后自动恢复`
          }
        >
          <Tag
            color={permanent ? 'error' : 'warning'}
            icon={<ClockCircleOutlined style={{ fontSize: 12 }} aria-hidden />}
          >
            {permanent ? '已停用' : remaining}
          </Tag>
        </Tooltip>
        <Tooltip title="清除健康度记录，立即恢复参与搜索">
          <Button
            type="link"
            size="small"
            aria-label="恢复此源"
            onClick={() => {
              useAppStore.getState().clearSourceHealth(sourceKey);
              toast('已恢复，下次搜索重新参与', 'success');
            }}
          >
            恢复
          </Button>
        </Tooltip>
      </Space>
    );
  }
  return (
    <Tooltip title={entry.ok ? `上次搜索 ${entry.ms}ms` : entry.error}>
      <Tag color={entry.ok ? 'success' : entry.timedOut ? 'warning' : 'error'}>
        {entry.ok ? `✓ ${entry.ms}ms` : `连续 ${entry.failStreak} 次失败`}
      </Tag>
    </Tooltip>
  );
}
