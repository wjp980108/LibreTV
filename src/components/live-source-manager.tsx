'use client';

import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { Button, Checkbox, Input, Empty, Space, Typography, Flex, Tag, Card } from 'antd';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { api } from '@/lib/client-api';
import { formatRelativeTime, hostnameOf, validateSourceUrl } from '@/lib/utils';
import { TestBadge, useSourceTests } from './settings-shared';

/**
 * 直播源管理（嵌入设置抽屉）：M3U 订阅的添加 / 探活 / 移除 / 导出，
 * 以及部署者预置源展示。工具条、徽章、空态与撤销语义与点播源面板保持一致。
 */

type LiveFilter = 'all' | 'enabled' | 'disabled' | 'sub' | 'manual';

// 与点播源面板保持同一组筛选项与顺序：先状态（已启用 / 已停用），后来源（来自订阅 / 手动添加）
const LIVE_FILTERS: { id: LiveFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'enabled', label: '已启用' },
  { id: 'disabled', label: '已停用' },
  { id: 'sub', label: '来自订阅' },
  { id: 'manual', label: '手动添加' },
];

interface LiveRow {
  url: string;
  label: string;
  epgUrl?: string;
  preset: boolean;
  lastSync?: number;
  fromSubscriptions: string[];
}

export function LiveSourceManager() {
  const store = useAppStore();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  /** 正在编辑的手动源 URL（与「添加」共用同一表单） */
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LiveFilter>('all');
  const { tests, runTest } = useSourceTests();

  const rows = useMemo<LiveRow[]>(() => {
    const preset: LiveRow[] = store.liveEnvSources.map((s) => ({
      url: s.url,
      label: s.name || hostnameOf(s.url),
      epgUrl: s.epg,
      preset: true,
      fromSubscriptions: [],
    }));
    const subs: LiveRow[] = store.liveSubscriptions.map((s) => ({
      url: s.url,
      label: s.name || hostnameOf(s.url),
      epgUrl: s.epg,
      preset: false,
      lastSync: s.lastSync,
      fromSubscriptions: s.fromSubscriptions,
    }));
    const all = [...preset, ...subs];
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === 'enabled' && !store.liveSelectedUrls.includes(r.url)) return false;
      if (filter === 'disabled' && store.liveSelectedUrls.includes(r.url)) return false;
      if (filter === 'sub' && r.fromSubscriptions.length === 0) return false;
      if (filter === 'manual' && !(r.fromSubscriptions.length === 0 && !r.preset)) return false;
      if (!q) return true;
      return r.label.toLowerCase().includes(q) || r.url.toLowerCase().includes(q);
    });
  }, [store.liveEnvSources, store.liveSubscriptions, store.liveSelectedUrls, query, filter]);

  // 编辑中的手动源（与「添加」共用同一表单）
  const editingSource = editing
    ? store.liveSubscriptions.find((s) => s.url === editing)
    : undefined;

  const exportM3u = (url: string) => {
    window.open(api.liveExportUrl(url), '_blank', 'noopener');
  };

  const allEnabled = rows.length > 0 && rows.every((r) => store.liveSelectedUrls.includes(r.url));
  const toggleAll = () => {
    // 只翻转状态与目标不一致的源，一次批量 set 完成（逐条 toggle 会触发 O(n) 次持久化）
    const targets = rows
      .filter((r) => store.liveSelectedUrls.includes(r.url) === allEnabled)
      .map((r) => r.url);
    if (targets.length > 0) useAppStore.getState().toggleLiveSelectedMany(targets);
  };

  const removeWithUndo = (row: LiveRow) => {
    const snapshot = useAppStore.getState().removeLiveSubscription(row.url);
    if (!snapshot) return;
    // 正在编辑的条目被移除时收起表单，避免表单悬空
    if (editing === row.url) setEditing(null);
    toast(`已移除「${row.label}」`, 'info', {
      action: {
        label: '撤销',
        onClick: () => {
          useAppStore.getState().restoreLiveSubscription(snapshot);
          toast('已恢复', 'success');
        },
      },
    });
  };

  const empty = store.liveEnvSources.length === 0 && store.liveSubscriptions.length === 0;

  return (
    <Flex vertical component="section">
      <Flex align="center" justify="space-between" gap="small" style={{ marginBottom: 12 }}>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {'直播源'}
          </Typography.Title>
          <Typography.Text type="secondary" ellipsis>
            {empty
              ? 'M3U 订阅 · /live 页面播放'
              : `共 ${store.liveEnvSources.length + store.liveSubscriptions.length} 个 · 已启用 ${store.liveSelectedUrls.length}`}
          </Typography.Text>
        </Flex>
        {
          <Button type="primary" size="small" onClick={() => setAdding(true)}>
            <PlusOutlined style={{ fontSize: 14 }} aria-hidden />
            添加直播源
          </Button>
        }
      </Flex>

      {/* 与点播源一致：由「+ 添加 / 编辑」按钮展开同一表单，而非常驻占位 */}
      <LiveSourceForm
        visible={adding || editingSource !== undefined}
        initial={editingSource}
        onCancel={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSubmit={(data) => {
          if (editing) {
            // 编辑模式：只更新名称与 EPG（地址不可改）
            store.updateLiveSubscription(editing, { name: data.name, epg: data.epg });
          } else {
            store.addLiveSubscription(data.url, data.name, data.epg);
            void runTest(data.url, () => api.liveTest(data.url));
          }
          setAdding(false);
          setEditing(null);
        }}
      />

      {empty && !adding && editingSource === undefined ? (
        <Empty
          description={
            <Space orientation="vertical">
              <Typography.Text>{'还没有添加任何直播源'}</Typography.Text>
              <Typography.Text type="secondary">
                {
                  '添加 M3U 地址后即可在「直播」页按分组浏览与播放频道；也可在「数据源订阅」中一次导入点播源与直播源；部署者还可通过 DEFAULT_LIVE_SOURCES 环境变量预置。'
                }
              </Typography.Text>
            </Space>
          }
        >
          {
            <Button type="primary" size="small" onClick={() => setAdding(true)}>
              添加第一个直播源
            </Button>
          }
        </Empty>
      ) : (
        <>
          <Flex style={{ marginBottom: 12 }} vertical gap={8}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ fontSize: 16 }} aria-hidden />}
              aria-label={'搜索名称或地址'}
              placeholder={'搜索名称或地址'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Flex wrap align="center" gap={4}>
              {LIVE_FILTERS.map((f) => (
                <Tag.CheckableTag
                  key={f.id}

                  onChange={() => setFilter(f.id)}
                  checked={filter === f.id}
                >
                  {f.label}
                </Tag.CheckableTag>
              ))}
              <Typography.Text
                type="secondary"
                style={{
                  marginInlineStart: 'auto',
                  fontSize: '11px',
                }}
              >
                显示 {rows.length} 个
              </Typography.Text>
            </Flex>
            <Button
              type="default"
              size="small"

              onClick={toggleAll}
              disabled={rows.length === 0}
            >
              {allEnabled ? '全部停用' : '全部启用'}
            </Button>
          </Flex>

          {rows.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space orientation="vertical">
                  <Typography.Text>{'没有符合条件的源'}</Typography.Text>
                </Space>
              }
            ></Empty>
          ) : (
            <Flex
              style={{ margin: 0, padding: 0, listStyle: 'none' }}
              vertical
              gap={8}
              component="ul"
            >
              {rows.map((row) => {
                const enabled = store.liveSelectedUrls.includes(row.url);
                const fromSubscription = row.fromSubscriptions.length > 0;
                return (
                  <li key={row.url}>
                    <Card size="small" style={{ ...(!enabled ? { opacity: 0.7 } : {}) }}>
                      <Flex align="center" gap={8}>
                        <Checkbox
                          style={{ height: 16, width: 16, flexShrink: 0 }}

                          checked={enabled}
                          onChange={() => useAppStore.getState().toggleLiveSelected(row.url)}
                          aria-label={enabled ? `停用 ${row.label}` : `启用 ${row.label}`}
                          title={enabled ? '已启用，取消勾选可停用' : '已停用，勾选后生效'}
                        />
                        <Flex vertical style={{ minWidth: 0, flex: '1 1 0%' }}>
                          <Flex
                            vertical
                            style={{
                              fontSize: 'var(--ant-font-size)',
                              fontWeight: 500,
                              color: 'var(--ant-color-text)',
                              minWidth: 0,
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {row.label}
                            {row.preset && <Tag style={{ marginInlineStart: 6 }}>部署者预置</Tag>}
                            {fromSubscription && (
                              <Tag
                                color="gold"
                                style={{ marginInlineStart: 6 }}
                                title={`来自 ${row.fromSubscriptions.length} 个数据源订阅；删除单个订阅不影响此源，仅当不再被任何订阅引用时才会移除`}
                              >
                                订阅
                              </Tag>
                            )}
                          </Flex>
                          <Flex
                            vertical
                            style={{
                              fontSize: 'var(--ant-font-size-sm)',
                              color: 'var(--ant-color-text-tertiary)',
                              minWidth: 0,
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {row.url}
                            {row.epgUrl && ' · 已配置节目单'}
                            {row.lastSync && ` · 同步于 ${formatRelativeTime(row.lastSync)}`}
                          </Flex>
                        </Flex>
                        <TestBadge
                          state={tests[row.url]}
                          onTest={() => runTest(row.url, () => api.liveTest(row.url))}
                          title="拉取解析并测速（频道数量与耗时）"
                          badgeWhenOk={({ count }) => `✓ ${count ?? 0} 频道`}
                        />
                        <Button
                          style={{ flexShrink: 0 }}
                          type="text"

                          onClick={() => exportM3u(row.url)}
                          aria-label="导出 M3U"
                          title="导出为标准 M3U 文件"
                        >
                          <DownloadOutlined style={{ fontSize: 16 }} aria-hidden />
                        </Button>
                        {row.preset ? null : fromSubscription ? (
                          <>
                            {/* 订阅源由远端列表管理：编辑会被下次同步覆盖、删除会复活，故置为禁用态并指路 */}
                            <Button
                              style={{ flexShrink: 0 }}
                              type="text"

                              disabled
                              aria-label="订阅源不可单独编辑"
                              title="该源来自数据源订阅，修改会在下次同步时被覆盖；请修改远端订阅内容后重新同步"
                            >
                              <EditOutlined style={{ fontSize: 16 }} aria-hidden />
                            </Button>
                            <Button
                              style={{ flexShrink: 0 }}
                              type="text"

                              disabled
                              aria-label="订阅源不可单独删除"
                              title="该源来自数据源订阅；请到「数据源订阅」中删除整个订阅"
                            >
                              <DeleteOutlined style={{ fontSize: 16 }} aria-hidden />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              style={{ flexShrink: 0 }}
                              type="text"

                              onClick={() => setEditing(row.url)}
                              aria-label="编辑"
                              title="编辑名称与节目单地址"
                            >
                              <EditOutlined style={{ fontSize: 16 }} aria-hidden />
                            </Button>
                            <Button
                              style={{ flexShrink: 0 }}
                              type="text"

                              onClick={() => removeWithUndo(row)}
                              aria-label="删除直播源"
                              title="移除（可在提示中撤销）"
                            >
                              <DeleteOutlined style={{ fontSize: 16 }} aria-hidden />
                            </Button>
                          </>
                        )}
                      </Flex>
                    </Card>
                  </li>
                );
              })}
            </Flex>
          )}
        </>
      )}
    </Flex>
  );
}

/** 直播源表单：与点播源一致，由「+ 添加 / 编辑」按钮展开；编辑时地址只读、提交后自动探活（仅新增） */
function LiveSourceForm({
  visible,
  initial,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  /** 编辑模式：仅允许改名称与 EPG，地址只读 */
  initial?: { url: string; name?: string; epg?: string };
  onCancel: () => void;
  onSubmit: (data: { url: string; name?: string; epg?: string }) => void;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [epg, setEpg] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    if (visible) {
      setUrl(initial?.url ?? '');
      setName(initial?.name ?? '');
      setEpg(initial?.epg ?? '');
    }
  }, [visible, initial]);

  if (!visible) return null;

  const submit = () => {
    if (initial) {
      onSubmit({ url: initial.url, name: name.trim() || undefined, epg: epg.trim() || undefined });
      return;
    }
    const u = url.trim();
    if (!validateSourceUrl(u)) {
      toast('订阅地址需以 http:// 或 https:// 开头', 'warning');
      return;
    }
    onSubmit({ url: u, name: name.trim() || undefined, epg: epg.trim() || undefined });
  };

  return (
    <Card
      size="small"
      style={{
        borderColor: 'var(--ant-color-border-secondary)',
        backgroundColor: 'var(--ant-color-fill-tertiary)',
        marginBottom: 8,
      }}
      styles={{ body: { padding: 12 } }}
    >
      <Flex vertical gap={8}>
        <Input
          style={{ width: '100%' }}
          aria-label="M3U 订阅地址"
          placeholder="M3U 订阅地址，如 https://example.com/list.m3u"
          value={url}
          maxLength={500}
          disabled={!!initial}
          title={initial ? '地址不可修改；如需更换请删除后重新添加' : undefined}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          style={{ width: '100%' }}
          aria-label="直播源名称（可选）"
          placeholder="名称（可选），如 我的频道列表"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          style={{ width: '100%' }}
          aria-label="EPG 节目单地址（可选）"
          placeholder="EPG 节目单地址（可选，XMLTV xml/xml.gz）"
          value={epg}
          maxLength={500}
          onChange={(e) => setEpg(e.target.value)}
        />
        <Flex gap={8} justify="flex-end">
          <Button type="default" size="small" onClick={onCancel}>
            取消
          </Button>
          <Button type="primary" size="small" onClick={submit}>
            添加
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}
