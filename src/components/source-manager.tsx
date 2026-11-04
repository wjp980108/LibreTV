'use client';

import {
  LinkOutlined,
  SettingOutlined,
  DownloadOutlined,
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Button,
  Checkbox,
  Modal,
  Input,
  Select,
  Switch,
  Segmented,
  Upload,
  Empty,
  Space,
  Typography,
  Spin,
  Flex,
  Form,
  Progress,
  Layout,
  Tag,
  Card,
} from 'antd';
import type { DefaultOptionType } from 'antd/es/select';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { LiveSourceManager } from './live-source-manager';
import { AppDrawer as Drawer } from './app-drawer';
import { HealthBadge, TestBadge, useSourceTests, type TestState } from './settings-shared';
import {
  loadCacheSettings,
  saveCacheSettings,
  getCacheSummary,
  clearVideoCache,
  type CacheSummary,
} from '@/lib/video-cache';
import { useSourceProbe } from './use-source-probe';
import {
  allLiveSources,
  isSourceDisabled,
  keyBelongsToSubscription,
  resolveSource,
  subKeyPrefix,
  useAppStore,
} from '@/lib/store';
import type { SourceConfig } from '@/lib/types';
import { useToast } from './toast';
import { formatRelativeTime, hostnameOf, validateSourceUrl } from '@/lib/utils';
import { exportConfig, importConfig } from '@/lib/db';
import { PERSIST_KEY } from '@/lib/persist-storage';
import { copyToClipboard } from '@/lib/clipboard';
import { useAuth } from './auth';
import { api } from '@/lib/client-api';
import { AUTO_REFRESH_MAX_FAIL_STREAK, syncSourceSubscription } from '@/lib/subscription-sync';
import { describeParseStats } from '@/lib/tvbox-parser';

/**
 * 设置抽屉：顶部两级导航。
 * - 一级按性质分组：源管理 / 偏好设置 / 数据；
 * - 二级为该分组下的具体面板，每次只渲染一类内容，避免源很多时长距离滚动。
 * 选中位置记忆到 localStorage，再次打开回到上次所在面板。
 */

type PrimaryTab = 'sources' | 'prefs' | 'data';
type SecondaryTab = 'vod' | 'live' | 'subs' | 'playback' | 'image' | 'home' | 'io';

const PRIMARY_TABS: { id: PrimaryTab; label: string; icon: ReactNode }[] = [
  { id: 'sources', label: '源管理', icon: <LinkOutlined style={{ fontSize: 14 }} aria-hidden /> },
  {
    id: 'prefs',
    label: '偏好设置',
    icon: <SettingOutlined style={{ fontSize: 14 }} aria-hidden />,
  },
  { id: 'data', label: '数据', icon: <DownloadOutlined style={{ fontSize: 14 }} aria-hidden /> },
];

const SECONDARY_TABS: Record<PrimaryTab, { id: SecondaryTab; label: string }[]> = {
  sources: [
    { id: 'vod', label: '点播源' },
    { id: 'live', label: '直播源' },
    { id: 'subs', label: '数据源订阅' },
  ],
  prefs: [
    { id: 'playback', label: '播放与过滤' },
    { id: 'image', label: '封面图加载' },
    { id: 'home', label: '首页与内容' },
  ],
  data: [{ id: 'io', label: '配置导入导出' }],
};

const TAB_STORAGE_KEY = 'libretv-settings-tab';

export function SourceManagerDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [primary, setPrimary] = useState<PrimaryTab>('sources');
  const [secondary, setSecondary] = useState<Record<PrimaryTab, SecondaryTab>>({
    sources: 'vod',
    prefs: 'playback',
    data: 'io',
  });

  // 挂载后读取上次位置（不在渲染期读 localStorage，避免 SSR/hydration 不一致）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TAB_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        primary?: PrimaryTab;
        secondary?: Partial<Record<PrimaryTab, SecondaryTab>>;
      };
      // 旧版把「数据源订阅」放在「数据」下，现已迁至「源管理」：自动重定向到新位置
      const migratedSubs = saved.secondary?.data === 'subs';
      const targetPrimary = migratedSubs && saved.primary === 'data' ? 'sources' : saved.primary;
      if (targetPrimary && SECONDARY_TABS[targetPrimary]) setPrimary(targetPrimary);
      setSecondary((prev) => {
        const next = { ...prev };
        if (migratedSubs) next.sources = 'subs';
        for (const key of Object.keys(SECONDARY_TABS) as PrimaryTab[]) {
          const v = saved.secondary?.[key];
          if (v && SECONDARY_TABS[key].some((t) => t.id === v)) next[key] = v;
        }
        return next;
      });
    } catch {
      /* 本地记录损坏时忽略，回到默认面板 */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({ primary, secondary }));
    } catch {
      /* 隐私模式等无法写入时忽略 */
    }
  }, [primary, secondary]);

  const current = secondary[primary];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="设置"
      destroyOnHidden
      closable={{ placement: 'end' }}
      styles={{
        body: { display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
      }}
      size={448}
    >
      <Flex
        vertical
        gap={8}
        style={{
          borderBottomWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--ant-color-border-secondary)',
          paddingInline: 16,
          paddingBlock: 12,
          flexShrink: 0,
        }}
      >
        <Segmented<PrimaryTab>
          block
          options={PRIMARY_TABS.map((t) => ({
            value: t.id,
            label: t.label,
            icon: t.icon,
          }))}
          value={primary}
          onChange={setPrimary}
          aria-label="设置分类"
        />
        {/* 分组下只有一项时无需二级导航，直接展示该面板 */}
        {SECONDARY_TABS[primary].length > 1 && (
          <Segmented<SecondaryTab>
            block
            options={SECONDARY_TABS[primary].map((t) => ({ value: t.id, label: t.label }))}
            value={current}
            onChange={(id) => setSecondary((prev) => ({ ...prev, [primary]: id }))}
            aria-label="设置项"
          />
        )}
      </Flex>
      <Layout.Content
        style={{
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: 16,
          flex: '1 1 0%',
        }}
        key={current}
      >
        {current === 'vod' && <VodSourcesPanel />}
        {current === 'live' && <LiveSourceManager />}
        {current === 'playback' && <PlaybackPanel />}
        {current === 'image' && <ImagePanel />}
        {current === 'home' && <HomePanel />}
        {current === 'subs' && <SourceSubscriptions />}
        {current === 'io' && <ConfigIoPanel />}
      </Layout.Content>
    </Drawer>
  );
}

// —— 点播源面板 ——

type VodFilter = 'all' | 'enabled' | 'disabled' | 'sub' | 'manual';

// 与直播源面板保持同一组筛选项与顺序：先状态（已启用 / 已停用），后来源（来自订阅 / 手动添加）
const VOD_FILTERS: { id: VodFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'enabled', label: '已启用' },
  { id: 'disabled', label: '已停用' },
  { id: 'sub', label: '来自订阅' },
  { id: 'manual', label: '手动添加' },
];

function VodSourcesPanel() {
  const store = useAppStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<VodFilter>('all');
  const { tests, runTest } = useSourceTests();
  const { progress, probe, cancel, isProbing } = useSourceProbe();

  const envKeys = useMemo(() => new Set(store.envSources.map((s) => s.key)), [store.envSources]);
  const all = useMemo(
    () => [...store.envSources, ...store.customAPIs],
    [store.envSources, store.customAPIs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((s) => {
      const fromSub = s.key.startsWith('sub_');
      // 已启用 = 勾选中且当前未被自动停用（即真正在参与搜索的源）
      if (
        filter === 'enabled' &&
        !(store.selectedKeys.includes(s.key) && !isSourceDisabled(store, s.key))
      )
        return false;
      if (filter === 'disabled' && !isSourceDisabled(store, s.key)) return false;
      if (filter === 'sub' && !fromSub) return false;
      // 手动添加 = 既非订阅导入、也非部署者预置
      if (filter === 'manual' && (fromSub || envKeys.has(s.key))) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q);
    });
  }, [all, query, filter, store, envKeys]);

  const visibleKeys = filtered.map((s) => s.key);
  const allSelected =
    visibleKeys.length > 0 && visibleKeys.every((k) => store.selectedKeys.includes(k));

  const toggleAll = () => {
    if (allSelected) {
      store.setSelectedKeys(store.selectedKeys.filter((k) => !visibleKeys.includes(k)));
      return;
    }
    // 成人过滤开启时成人源不可勾选，与行内复选框保持一致
    const eligible = filtered.filter((s) => !(s.isAdult && store.yellowFilter)).map((s) => s.key);
    const skipped = filtered.length - eligible.length;
    store.setSelectedKeys([...new Set([...store.selectedKeys, ...eligible])]);
    if (skipped > 0)
      toast(`已启用 ${eligible.length} 个；${skipped} 个成人源因过滤开启被跳过`, 'info');
  };

  const runAll = async () => {
    if (isProbing) {
      cancel();
      return;
    }
    const result = await probe(filtered.map((s) => ({ key: s.key, url: s.url })));
    if (!result) return; // 被取消则无汇总
    toast(
      `测活完成：${result.ok}/${result.total} 个可用`,
      result.ok === result.total ? 'success' : 'info',
    );
  };

  /** 一键恢复被自动停用的源（仅「已停用」筛选下提供） */
  const restoreAll = () => {
    const keys = filtered.filter((s) => isSourceDisabled(store, s.key)).map((s) => s.key);
    if (keys.length === 0) return;
    keys.forEach((k) => useAppStore.getState().clearSourceHealth(k));
    toast(`已恢复 ${keys.length} 个源`, 'success');
  };

  const empty = store.envSources.length === 0 && store.customAPIs.length === 0;

  return (
    <Flex vertical component="section">
      <Flex align="center" justify="space-between" gap="small" style={{ marginBottom: 12 }}>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {'点播源'}
          </Typography.Title>
          <Typography.Text type="secondary" ellipsis>
            {empty
              ? undefined
              : `共 ${all.length} 个 · 已启用 ${all.filter((s) => store.selectedKeys.includes(s.key)).length}`}
          </Typography.Text>
        </Flex>
        {
          <Button type="primary" size="small" onClick={() => setEditing('__new__')}>
            <PlusOutlined style={{ fontSize: 14 }} aria-hidden />
            添加 API
          </Button>
        }
      </Flex>

      <SourceForm
        visible={editing === '__new__'}
        onCancel={() => setEditing(null)}
        onSubmit={(data) => {
          store.addCustomApi(data);
          setEditing(null);
        }}
      />

      {empty && editing !== '__new__' ? (
        <Empty
          description={
            <Space orientation="vertical">
              <Typography.Text>{'还没有添加任何点播源'}</Typography.Text>
              <Typography.Text type="secondary">
                {
                  '添加一个 Apple CMS 采集站 API 即可开始搜索影片；也可到「数据源订阅」一次导入点播源与直播源'
                }
              </Typography.Text>
            </Space>
          }
        >
          {
            <Button type="primary" size="small" onClick={() => setEditing('__new__')}>
              添加第一个点播源
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
              {VOD_FILTERS.map((f) => (
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
                显示 {filtered.length} 个
              </Typography.Text>
            </Flex>
            <Flex wrap align="center" gap={8}>
              <Button
                type="default"
                size="small"

                onClick={toggleAll}
                disabled={filtered.length === 0}
              >
                {allSelected ? '全部停用' : '全部启用'}
              </Button>
              <Button
                type="default"
                size="small"

                onClick={runAll}
                disabled={filtered.length === 0}
              >
                {isProbing ? '取消测活' : '批量测活'}
              </Button>
              {/* 查看「已停用」时提供一键恢复，省去逐个点击 */}
              {filter === 'disabled' && (
                <Button
                  type="default"
                  size="small"

                  onClick={restoreAll}
                  disabled={filtered.length === 0}
                >
                  全部恢复
                </Button>
              )}
            </Flex>
            {progress && (
              <Flex
                style={{ fontSize: '11px', color: 'var(--ant-color-text-secondary)' }}
                align="center"
                gap={8}
              >
                <Progress
                  style={{ flex: 1, minWidth: 0 }}
                  percent={Math.round((progress.done / progress.total) * 100)}
                  showInfo={false}
                  size="small"
                />
                <Typography.Text style={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {progress.done}/{progress.total} · 可用 {progress.ok}
                  {formatEta(progress.done, progress.total, progress.startedAt)}
                </Typography.Text>
                <Button
                  style={{ flexShrink: 0 }}
                  type="default"
                  size="small"

                  onClick={cancel}
                >
                  取消
                </Button>
              </Flex>
            )}
          </Flex>

          {filtered.length === 0 ? (
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
              {filtered.map((source) => (
                <VodSourceRow
                  key={source.key}
                  api={source}
                  isEnv={envKeys.has(source.key)}
                  editing={editing === source.key}
                  onEdit={setEditing}
                  onCancelEdit={() => setEditing(null)}
                  onUpdate={(data) => {
                    store.updateCustomApi(source.key, data);
                    setEditing(null);
                  }}
                  testState={tests[source.key]}
                  onTest={() =>
                    runTest(source.key, async () => {
                      const r = await api.testSource(source.url);
                      // 手动测试也写入健康度，与搜索 / 批量测活共用同一份模型（不再存在两套健康度）
                      useAppStore
                        .getState()
                        .recordSourceHealth([
                          { sourceKey: source.key, ok: r.ok, ms: r.ms, error: r.error, list: [] },
                        ]);
                      return r;
                    })
                  }
                />
              ))}
            </Flex>
          )}
        </>
      )}
    </Flex>
  );
}

function formatEta(done: number, total: number, startedAt: number): string {
  if (done <= 0 || done >= total) return '';
  const elapsed = Date.now() - startedAt;
  const remainSec = Math.max(0, Math.round(((elapsed / done) * (total - done)) / 1000));
  return remainSec > 0 ? ` · 约 ${remainSec}s` : '';
}

/** 单条点播源行：勾选 / 名称标签 / 健康度 / 探活 / 编辑删除（订阅源与预置源按来源限制操作） */
function VodSourceRow({
  api,
  isEnv,
  editing,
  onEdit,
  onCancelEdit,
  onUpdate,
  testState,
  onTest,
}: {
  api: SourceConfig;
  isEnv: boolean;
  editing: boolean;
  onEdit: (key: string) => void;
  onCancelEdit: () => void;
  onUpdate: (data: { name: string; url: string; detail?: string; isAdult?: boolean }) => void;
  testState?: TestState;
  onTest: () => void;
}) {
  const selected = useAppStore((s) => s.selectedKeys.includes(api.key));
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const toast = useToast().toast;
  const fromSubscription = api.key.startsWith('sub_');
  const adultBlocked = !!api.isAdult && yellowFilter;

  const remove = () => {
    const snapshot = useAppStore.getState().removeCustomApi(api.key);
    if (!snapshot) return;
    // 轻操作：不做确认弹窗，给 6 秒撤销窗口
    toast(`已移除「${api.name}」`, 'info', {
      action: {
        label: '撤销',
        onClick: () => {
          const ok = useAppStore.getState().restoreCustomApi(snapshot);
          toast(ok ? '已恢复' : '恢复失败：该源位置已被重新占用', ok ? 'success' : 'warning');
        },
      },
    });
  };

  if (editing) {
    return (
      <li>
        <Card size="small">
          <SourceForm visible initial={api} onCancel={onCancelEdit} onSubmit={onUpdate} />
        </Card>
      </li>
    );
  }

  return (
    <li>
      <Card size="small" style={{ ...(!selected ? { opacity: 0.7 } : {}) }}>
        <Flex align="center" gap={8}>
          <Checkbox
            style={{ height: 16, width: 16, flexShrink: 0 }}

            checked={selected}
            onChange={() => useAppStore.getState().toggleSourceSelected(api.key)}
            disabled={adultBlocked}
            title={adultBlocked ? '成人内容过滤开启中，需先关闭过滤才能启用此源' : undefined}
            aria-label={`选择 ${api.name}`}
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
              {api.name}
              {api.isAdult && (
                <Typography.Text
                  style={{
                    color: 'var(--ant-magenta-6)',
                    fontSize: 'var(--ant-font-size-sm)',
                    marginInlineStart: 4,
                  }}
                >
                  (18+)
                </Typography.Text>
              )}
              {isEnv && <Tag style={{ marginInlineStart: 6 }}>部署者预置</Tag>}
              {fromSubscription && (
                <Tag
                  color="gold"
                  style={{ marginInlineStart: 6 }}
                  title="来自数据源订阅，重新同步时此源的名称/地址会以订阅内容为准"
                >
                  订阅
                </Tag>
              )}
            </Flex>
            <Typography.Text
              type="secondary"
              ellipsis
              style={{
                fontSize: 'var(--ant-font-size-sm)',

                minWidth: 0,
              }}
            >
              {api.url}
            </Typography.Text>
          </Flex>
          <HealthBadge sourceKey={api.key} />
          <TestBadge
            state={testState}
            onTest={onTest}
            title="测试可用性（搜索耗时与结果量）"
            badgeWhenOk={({ ms }) => `✓ ${ms}ms`}
          />
          {!isEnv &&
            (fromSubscription ? (
              // 订阅源由远端列表管理：编辑会被下次同步覆盖、删除会复活，故置为禁用态并说明去处
              <>
                <Button
                  style={{ flexShrink: 0 }}
                  type="text"

                  disabled
                  aria-label="订阅源不可单独编辑"
                  title="该源来自订阅，修改会在下次同步时被覆盖；请修改远端订阅后重新同步"
                >
                  <EditOutlined style={{ fontSize: 16 }} aria-hidden />
                </Button>
                <Button
                  style={{ flexShrink: 0 }}
                  type="text"

                  disabled
                  aria-label="订阅源不可单独删除"
                  title="该源来自订阅，单独删除会在下次同步时恢复；请到「数据源订阅」删除整个订阅"
                >
                  <DeleteOutlined style={{ fontSize: 16 }} aria-hidden />
                </Button>
              </>
            ) : (
              <>
                <Button
                  style={{ flexShrink: 0 }}
                  type="text"

                  onClick={() => onEdit(api.key)}
                  aria-label="编辑"
                  title="编辑"
                >
                  <EditOutlined style={{ fontSize: 16 }} aria-hidden />
                </Button>
                <Button
                  style={{ flexShrink: 0 }}
                  type="text"

                  onClick={remove}
                  aria-label="删除"
                  title="移除（可在提示中撤销）"
                >
                  <DeleteOutlined style={{ fontSize: 16 }} aria-hidden />
                </Button>
              </>
            ))}
        </Flex>
      </Card>
    </li>
  );
}

// —— 偏好设置面板 ——

function PlaybackPanel() {
  const store = useAppStore();
  const { toast } = useToast();
  const [clearMarksOpen, setClearMarksOpen] = useState(false);
  const markCount = Object.keys(store.skipMarks).length;
  return (
    <Flex vertical component="section">
      <Flex align="center" justify="space-between" gap="small" style={{ marginBottom: 12 }}>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {'播放与过滤'}
          </Typography.Title>
        </Flex>
      </Flex>
      <Flex vertical gap={12}>
        <Form.Item
          layout="vertical"
          label={'广告切片过滤'}
          extra={
            '剔除播放列表中的广告分片段落（按分片 URL 特征、片头插入与长片间超短中插识别，不动 DISCONTINUITY 时间轴）'
          }
        >
          <Switch
            aria-label={'广告切片过滤'}
            checked={store.adFilter}
            onChange={(v) => store.updateSettings({ adFilter: v })}
          />
        </Form.Item>
        <Form.Item layout="vertical" label={'自动连播'} extra={'单集播放结束后自动播放下一集'}>
          <Switch
            aria-label={'自动连播'}
            checked={store.autoplayNext}
            onChange={(v) => store.updateSettings({ autoplayNext: v })}
          />
        </Form.Item>
        <Form.Item
          layout="vertical"
          label={'自动跳过片段'}
          extra={
            '命中片头/中段标记时跳到片段末尾，命中片尾标记时结束本集（是否连播下一集由「自动连播」决定）；关闭后三类都只显示跳过按钮（标记在播放页「跳过标记」中设置）'
          }
        >
          <Switch
            aria-label={'自动跳过片段'}
            checked={store.autoSkipSegments}
            onChange={(v) => store.updateSettings({ autoSkipSegments: v })}
          />
        </Form.Item>
      </Flex>

      {markCount > 0 && (
        <Flex
          style={{
            paddingTop: 12,
            marginTop: 12,
            borderTopWidth: 1,
            borderStyle: 'solid',
            borderColor: 'var(--ant-color-border-secondary)',
          }}
          align="center"
          justify="space-between"
          gap={12}
        >
          <Flex vertical style={{ minWidth: 0 }}>
            <Typography.Text style={{ fontSize: 'var(--ant-font-size)' }}>
              跳过片段标记
            </Typography.Text>
            <Typography.Text
              type="secondary"
              style={{
                fontSize: 'var(--ant-font-size-sm)',
              }}
            >
              已记录 {markCount} 部；在播放页「跳过标记」中设置，可逐剧关闭
            </Typography.Text>
          </Flex>
          <Button
            style={{ flexShrink: 0 }}
            type="default"
            size="small"

            onClick={() => setClearMarksOpen(true)}
          >
            清除全部
          </Button>
        </Flex>
      )}

      <Modal
        centered
        width={420}
        destroyOnHidden
        closable={false}
        cancelButtonProps={{ autoFocus: true }}
        open={clearMarksOpen}
        okButtonProps={{ danger: true }}
        title="清除全部跳过片段？"

        okText="清除全部"
        onCancel={() => setClearMarksOpen(false)}
        onOk={() => {
          store.clearAllSkipMarks();
          setClearMarksOpen(false);
          toast('已清除全部跳过片段标记', 'success');
        }}
      >{`将删除已记录的 ${markCount} 部剧的跳过片段，之后播放不再自动跳过；可重新在播放页标记。`}</Modal>

      <VideoCachePanel />
    </Flex>
  );
}

/** 片段缓存：开启/关闭 + 用量展示 + 清理（数据在浏览器本地，独立于配置导出） */
function VideoCachePanel() {
  const [enabled, setEnabled] = useState(() => loadCacheSettings().enabled);
  const [summary, setSummary] = useState<CacheSummary>({ segments: 0, bytes: 0, episodes: 0 });
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(() => {
    void getCacheSummary().then(setSummary);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <Flex
      style={{
        paddingTop: 12,
        marginTop: 12,
        borderTopWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--ant-color-border-secondary)',
      }}
      vertical
      gap={12}
    >
      <Form.Item
        layout="vertical"
        label={'片段本地缓存'}
        extra={
          '暂停或观看时把后续分片缓存到浏览器本地，二次播放与断网卡顿时直接命中（存储于本机，不计入配置导出）'
        }
      >
        <Switch
          aria-label={'片段本地缓存'}
          checked={enabled}
          onChange={(v) => {
            const next = saveCacheSettings({ enabled: v });
            setEnabled(next.enabled);
          }}
        />
      </Form.Item>
      <Flex
        style={{ fontSize: 'var(--ant-font-size-sm)', color: 'var(--ant-color-text-tertiary)' }}
        align="center"
        justify="space-between"
      >
        <Typography.Text>
          已缓存 {summary.segments} 个分片 · {formatBytes(summary.bytes)} · {summary.episodes} 集
        </Typography.Text>
        <Button
          type="text"
          htmlType="button"

          disabled={clearing || summary.segments === 0}
          onClick={async () => {
            setClearing(true);
            await clearVideoCache();
            refresh();
            setClearing(false);
          }}
        >
          清理缓存
        </Button>
      </Flex>
    </Flex>
  );
}

function ImagePanel() {
  const store = useAppStore();
  const mode = store.imageProxyMode;
  const description: Record<'direct' | 'proxy' | 'custom', string> = {
    direct: '原站直连；豆瓣封面自动换公共镜像，仍失败回退内置代理。最省服务器流量',
    proxy: '封面优先经本站服务器转发并伪装来源，失败自动回退公共镜像/直连。最稳定，消耗服务器流量',
    custom: '使用你填写的模板转发封面图',
  };
  return (
    <Flex vertical component="section">
      <Flex align="center" justify="space-between" gap="small" style={{ marginBottom: 12 }}>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {'封面图加载'}
          </Typography.Title>
        </Flex>
      </Flex>
      <Flex vertical gap={8}>
        <Form.Item layout="vertical" label={'加载方式'} extra={description[mode]}>
          <Select
            aria-label={'加载方式'}
            value={mode}
            onChange={(v) =>
              store.updateSettings({ imageProxyMode: v as 'direct' | 'proxy' | 'custom' })
            }
            options={[
              { value: 'direct', label: '直连优先', hint: '最省服务器流量' },
              { value: 'proxy', label: '内置代理', hint: '最稳定' },
              { value: 'custom', label: '自定义', hint: '自建转发模板' },
            ]}
            popupMatchSelectWidth={false}
            optionRender={(option) => (
              <Space orientation="vertical" size={0}>
                <Typography.Text>{option.label}</Typography.Text>
                {option.data.hint && (
                  <Typography.Text type="secondary">{option.data.hint}</Typography.Text>
                )}
              </Space>
            )}
          />
        </Form.Item>
        {mode === 'custom' && <CustomProxyInput />}
      </Flex>
    </Flex>
  );
}

/**
 * 自定义代理模板输入：本地即时回显 + 300ms 防抖写 store。
 * 直接每次按键写 store 会让全站封面 URL 重算并触发一轮图片重载（模板输入时缩略图持续闪烁）。
 */
function CustomProxyInput() {
  const value = useAppStore((s) => s.customImageProxy);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [draft, setDraft] = useState(value);

  // 外部值变化（如导入配置）时同步回显
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => updateSettings({ customImageProxy: draft }), 300);
    return () => clearTimeout(timer);
  }, [draft, value, updateSettings]);

  return (
    <Input
      style={{ width: '100%' }}
      aria-label="自定义代理模板"
      placeholder="代理模板，如 https://p.example.com/?url={url}"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}

function HomePanel() {
  const store = useAppStore();
  return (
    <Flex vertical component="section">
      <Flex align="center" justify="space-between" gap="small" style={{ marginBottom: 12 }}>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {'首页与内容过滤'}
          </Typography.Title>
        </Flex>
      </Flex>
      <Flex vertical gap={12}>
        <Form.Item layout="vertical" label={'成人内容过滤'} extra={'过滤“伦理片”等分类的结果'}>
          <Switch
            aria-label={'成人内容过滤'}
            checked={store.yellowFilter}
            onChange={(v) => store.updateSettings({ yellowFilter: v })}
          />
        </Form.Item>
        <Form.Item layout="vertical" label={'首页推荐'} extra={'在首页展示推荐内容'}>
          <Switch
            aria-label={'首页推荐'}
            checked={store.doubanEnabled}
            onChange={(v) => store.updateSettings({ doubanEnabled: v })}
          />
        </Form.Item>
        <Form.Item layout="vertical" label={'推荐数据源'} extra={undefined}>
          <Select
            aria-label={'推荐数据源'}
            value={store.recommendSource}
            onChange={(v) =>
              store.updateSettings({ recommendSource: v as 'douban' | 'bangumi' | 'hot-list' })
            }
            options={[
              { value: 'douban', label: '豆瓣', hint: '热门电影与剧集' },
              { value: 'bangumi', label: 'Bangumi', hint: '每日新番放送（免 key）' },
              { value: 'hot-list', label: '影视榜单', hint: '豆瓣周榜 / 百度热播' },
            ]}
            popupMatchSelectWidth={false}
            optionRender={(option) => (
              <Space orientation="vertical" size={0}>
                <Typography.Text>{option.label}</Typography.Text>
                {option.data.hint && (
                  <Typography.Text type="secondary">{option.data.hint}</Typography.Text>
                )}
              </Space>
            )}
          />
        </Form.Item>
      </Flex>
    </Flex>
  );
}

// —— 数据面板 ——

/**
 * 自动刷新周期选项。值统一用字符串（Dropdown 的 value 是 string），
 * `off` = 纯手动，保持这个功能对存量用户的默认无感。
 */
const REFRESH_OPTIONS: DefaultOptionType[] = [
  { value: 'off', label: '手动', hint: '只在点 ⟳ 时同步' },
  { value: '1', label: '每天', hint: '打开站点时检查' },
  { value: '3', label: '每 3 天' },
  { value: '7', label: '每 7 天' },
  { value: '14', label: '每 14 天' },
  { value: '30', label: '每 30 天' },
];

/**
 * 数据源订阅 / 分享：
 * - 订阅：填入远程订阅地址（LibreTV-SourceList JSON、TVBOX 配置 JSON 或接口目录 JSON，
 *   由服务端自动识别），一次拉取点播源与直播源，可随时重新同步；
 * - 自动刷新：每个订阅可单独设周期（默认手动），到期才在打开站点时静默同步；
 * - 分享：把当前点播源 + 直播源导出为同格式 JSON 文件，托管到任意位置即可被他人订阅。
 */
function SourceSubscriptions() {
  const store = useAppStore();
  const { toast } = useToast();
  const [subUrl, setSubUrl] = useState('');
  // 每个订阅独立的同步状态，允许多个订阅并行同步（此前单值状态会串台）
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const sync = async (url: string) => {
    setSyncing((prev) => new Set(prev).add(url));
    try {
      const { vodCount, liveCount, stats } = await syncSourceSubscription(url);
      // 如实说明跳过/截断情况，避免用户疑惑「配置里站点很多，为何只导入了个位数」
      const detail = describeParseStats(stats, { includeSamples: false });
      const formatLabel =
        stats?.format === 'tvbox'
          ? '（TVBOX 配置）'
          : stats?.format === 'source-catalog'
            ? '（接口源列表）'
            : '';
      toast(
        `已同步 ${vodCount} 个点播源、${liveCount} 个直播源${formatLabel}${detail ? `；${detail}` : ''}`,
        'success',
      );
      setSubUrl('');
    } catch (err) {
      toast(err instanceof Error ? err.message : '订阅同步失败', 'error');
    } finally {
      setSyncing((prev) => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  };

  const addAndSync = () => {
    const url = subUrl.trim();
    if (!validateSourceUrl(url)) {
      toast('订阅地址需以 http:// 或 https:// 开头', 'warning');
      return;
    }
    void sync(url);
  };

  // 发布状态：进行中 + 上一次的发布结果（链接、粘贴板来源与条数）
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{
    url: string;
    provider: string;
    sources: number;
    liveSources: number;
  } | null>(null);

  /**
   * 发布当前「已勾选启用」的源：只把真正在参与搜索的源发出去
   * （未勾选的、以及被自动停用的都排除）。注意这与「导出数据源」的全量语义不同。
   */
  const publish = async () => {
    const seen = new Set<string>();
    const sources = store.selectedKeys
      .map((key) => resolveSource(store, key))
      .filter(
        (s): s is SourceConfig =>
          !!s && validateSourceUrl(s.url) && !isSourceDisabled(store, s.key),
      )
      .filter((s) => {
        const key = s.url.replace(/\/+$/, '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(({ name, url }) => ({ name, url }));

    const liveSeen = new Set<string>();
    const liveSources = allLiveSources(store)
      .filter((s) => store.liveSelectedUrls.includes(s.url))
      .filter((s) => {
        if (liveSeen.has(s.url)) return false;
        liveSeen.add(s.url);
        return true;
      })
      .map(({ name, url, epg }) => ({ name: name || hostnameOf(url), url, epg }));

    if (sources.length === 0 && liveSources.length === 0) {
      toast('没有已勾选启用的源可发布', 'warning');
      return;
    }

    setPublishing(true);
    try {
      const result = await api.publishSourceList({
        name: 'LibreTV-SourceList',
        sources,
        liveSources,
      });
      setPublished(result);
      toast(
        `已发布 ${result.sources} 个点播源、${result.liveSources} 个直播源到 ${result.provider}`,
        'success',
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : '发布失败', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const copyPublished = () => {
    if (!published) return;
    copyToClipboard(published.url).then((ok) =>
      ok ? toast('订阅链接已复制', 'success') : toast('复制失败，请手动选中复制', 'warning'),
    );
  };

  const exportSources = () => {
    const all = [...store.envSources, ...store.customAPIs];
    const seen = new Set<string>();
    const sources = all
      .filter((s) => {
        const u = s.url.replace(/\/+$/, '');
        if (seen.has(u)) return false;
        seen.add(u);
        return true;
      })
      .map(({ name, url, detail, isAdult }) => ({ name, url, detail, isAdult }));

    // 直播源：预置 + 手动 + 订阅导入，按 URL 去重
    const liveSeen = new Set<string>();
    const liveSources = [...store.liveEnvSources, ...store.liveSubscriptions]
      .filter((s) => {
        if (liveSeen.has(s.url)) return false;
        liveSeen.add(s.url);
        return true;
      })
      .map(({ name, url, epg }) => ({ name: name || hostnameOf(url), url, epg }));

    const payload = {
      name: 'LibreTV-SourceList',
      version: 2,
      exportedAt: Date.now(),
      sources,
      liveSources,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Meet-you-SourceList_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(
      `已导出 ${sources.length} 个点播源、${liveSources.length} 个直播源，托管后即可被他人订阅`,
      'success',
    );
  };

  const deleteImpact = (url: string) => {
    const prefix = subKeyPrefix(url);
    return {
      vod: store.customAPIs.filter((a) => keyBelongsToSubscription(a.key, prefix)).length,
      live: store.liveSubscriptions.filter((s) => s.fromSubscriptions.includes(url)).length,
    };
  };

  return (
    <Flex vertical component="section">
      <Flex align="center" justify="space-between" gap="small" style={{ marginBottom: 12 }}>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {'数据源订阅 / 分享'}
          </Typography.Title>
        </Flex>
        {
          <Flex style={{ flexShrink: 0 }} align="center" gap={6}>
            <Button
              type="default"
              size="small"

              onClick={exportSources}
              disabled={
                store.customAPIs.length +
                  store.envSources.length +
                  store.liveSubscriptions.length +
                  store.liveEnvSources.length ===
                0
              }
            >
              导出数据源
            </Button>
            <Button
              type="default"
              size="small"

              onClick={() => void publish()}
              disabled={publishing}
              title="把当前已勾选启用的源上传到公开粘贴板，生成可直接订阅的链接"
            >
              {publishing ? '发布中…' : '发布为链接'}
            </Button>
          </Flex>
        }
      </Flex>

      {/* 发布结果：链接公开可读、粘贴板也可能随时清理，这些风险直接写在这里而不是只在 toast 里闪一下 */}
      {published && (
        <Card
          size="small"
          style={{
            marginBottom: 12,
            borderColor: 'var(--ant-color-border-secondary)',
            backgroundColor: 'color-mix(in srgb, var(--ant-color-fill-tertiary) 60%, transparent)',
          }}
          styles={{ body: { padding: 10 } }}
        >
          <Flex vertical>
            <Flex align="center" gap={6}>
              <Input
                style={{
                  minWidth: 0,
                  paddingBlock: 6,
                  fontSize: 'var(--ant-font-size-sm)',
                  flex: '1 1 0%',
                }}
                readOnly
                value={published.url}

                aria-label="已发布的订阅地址"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                style={{ flexShrink: 0 }}
                type="default"
                size="small"

                onClick={copyPublished}
              >
                复制
              </Button>
              <Button
                style={{ flexShrink: 0 }}
                type="default"
                size="small"

                onClick={() => {
                  setSubUrl(published.url);
                  void sync(published.url);
                }}
              >
                直接订阅
              </Button>
            </Flex>
            <Typography.Paragraph
              type="secondary"
              style={{
                margin: 0,
                marginTop: 6,
                fontSize: '11px',

                lineHeight: 1.625,
              }}
            >
              已发布到 {published.provider}（{published.sources} 个点播源、{published.liveSources}{' '}
              个直播源）。 链接内容公开可读，粘贴板也可能随时清理——长期使用建议自行托管。
            </Typography.Paragraph>
          </Flex>
        </Card>
      )}

      <Flex style={{ marginBottom: 8 }} gap={8}>
        <Input
          style={{ minWidth: 0, flex: '1 1 0%' }}

          placeholder="订阅地址（源列表或 TVBOX 配置的 JSON URL）"
          value={subUrl}
          onChange={(e) => setSubUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addAndSync();
          }}
        />
        <Button
          style={{ flexShrink: 0 }}
          type="primary"
          size="small"

          disabled={!subUrl.trim() || syncing.size > 0}
          onClick={addAndSync}
        >
          {syncing.size > 0 ? '同步中…' : '订阅'}
        </Button>
      </Flex>
      {store.subscriptions.length === 0 ? (
        <Typography.Paragraph
          type="secondary"
          style={{ margin: 0, fontSize: 'var(--ant-font-size-sm)' }}
        >
          一份订阅可同时下发点播源与直播源，支持源列表与 TVBOX
          配置（仅导入可直接使用的接口，Spider 类站点自动跳过）； 「导出数据源」生成的 JSON
          托管到任意 URL 即可分享给他人订阅。
        </Typography.Paragraph>
      ) : (
        <Flex style={{ margin: 0, padding: 0, listStyle: 'none' }} vertical gap={8} component="ul">
          {store.subscriptions.map((sub) => {
            const vodCount = store.customAPIs.filter((a) =>
              keyBelongsToSubscription(a.key, subKeyPrefix(sub.url)),
            ).length;
            const liveCount = store.liveSubscriptions.filter((s) =>
              s.fromSubscriptions.includes(sub.url),
            ).length;
            const isSyncing = syncing.has(sub.url);
            // 自动刷新状态：暂停（连续失败触顶）> 距下次刷新 > 未设周期不提示
            const paused = Boolean(
              sub.refreshDays && (sub.failStreak ?? 0) >= AUTO_REFRESH_MAX_FAIL_STREAK,
            );
            const nextAt =
              sub.refreshDays && sub.lastSync
                ? sub.lastSync + sub.refreshDays * 86_400_000
                : undefined;
            const remainingMs = nextAt ? nextAt - Date.now() : 0;
            return (
              <li key={sub.url}>
                <Card size="small" style={{ ...(sub.enabled === false ? { opacity: 0.7 } : {}) }}>
                  <Flex align="center" gap={8}>
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
                        {sub.name || hostnameOf(sub.url)}
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
                        {sub.url}
                        {sub.lastSync && ` · 同步于 ${formatRelativeTime(sub.lastSync)}`}
                      </Flex>
                      <Flex style={{ marginTop: 4 }} align="center" gap={4} wrap>
                        <Tag color="gold">点播 {vodCount}</Tag>
                        <Tag color="gold">直播 {liveCount}</Tag>
                        {sub.enabled === false && <Tag color="warning">已停用</Tag>}
                        {sub.lastStatus === 'error' ? (
                          <Tag color="error" title={sub.lastError}>
                            上次同步失败
                          </Tag>
                        ) : sub.lastStatus === 'ok' && sub.lastCounts ? (
                          <Tag color="success">
                            上次导入 {sub.lastCounts.vod} 点播 / {sub.lastCounts.live} 直播
                          </Tag>
                        ) : null}
                      </Flex>
                      {sub.lastStatus === 'error' && sub.lastError && (
                        <Typography.Paragraph
                          type="danger"
                          style={{
                            margin: 0,
                            fontSize: '11px',

                            marginTop: 4,
                            wordBreak: 'break-all',
                          }}
                        >
                          {sub.lastError}
                        </Typography.Paragraph>
                      )}
                      {/* 自动刷新：默认「手动」，显式设了周期才会在打开站点时静默刷新 */}
                      <Flex
                        style={{
                          marginTop: 6,
                          fontSize: '11px',
                          color: 'var(--ant-color-text-tertiary)',
                        }}
                        align="center"
                        gap={6}
                        wrap
                      >
                        <ClockCircleOutlined style={{ fontSize: 12, flexShrink: 0 }} aria-hidden />
                        <Typography.Text>自动刷新</Typography.Text>
                        <Select
                          popupMatchSelectWidth={false}
                          value={sub.refreshDays ? String(sub.refreshDays) : 'off'}
                          onChange={(v) =>
                            store.setSubscriptionRefreshDays(
                              sub.url,
                              v === 'off' ? undefined : Number(v),
                            )
                          }
                          options={REFRESH_OPTIONS}
                          aria-label="自动刷新周期"
                        />
                        {paused ? (
                          <Typography.Text type="warning" style={{}}>
                            已暂停：连续失败 {sub.failStreak} 次，手动同步成功即恢复
                          </Typography.Text>
                        ) : remainingMs > 0 ? (
                          <Typography.Text>
                            约 {Math.max(1, Math.ceil(remainingMs / 86_400_000))} 天后刷新
                          </Typography.Text>
                        ) : sub.refreshDays ? (
                          <Typography.Text>下次打开站点时刷新</Typography.Text>
                        ) : null}
                      </Flex>
                    </Flex>
                    <Switch
                      checked={sub.enabled !== false}
                      onChange={(v) => store.setSubscriptionEnabled(sub.url, v)}
                      aria-label={sub.enabled === false ? '启用该订阅' : '停用该订阅'}
                      title={
                        sub.enabled === false
                          ? '当前已停用（其源不参与搜索），点击启用'
                          : '停用后该订阅下的源暂不参与搜索；已导入的数据与各源勾选状态都保留'
                      }
                    />
                    <Button
                      style={{ flexShrink: 0 }}
                      type="text"

                      disabled={isSyncing}
                      onClick={() => sync(sub.url)}
                      aria-label="重新同步"
                      title="重新同步（以远端列表为准，整体替换该订阅名下的点播源与直播源）"
                    >
                      {isSyncing ? (
                        <Spin size="small" />
                      ) : (
                        <ReloadOutlined style={{ fontSize: 16 }} aria-hidden />
                      )}
                    </Button>
                    <Button
                      style={{ flexShrink: 0 }}
                      type="text"

                      onClick={() => setPendingDelete(sub.url)}
                      aria-label="删除订阅"
                      title="删除订阅及其导入的点播源与直播源（保留收藏的频道）"
                    >
                      <DeleteOutlined style={{ fontSize: 16 }} aria-hidden />
                    </Button>
                  </Flex>
                </Card>
              </li>
            );
          })}
        </Flex>
      )}

      {/* 重操作：删除订阅会级联移除其导入的源，先确认并说明影响面 */}
      <Modal
        centered
        width={420}
        destroyOnHidden
        closable={false}
        cancelButtonProps={{ autoFocus: true }}
        open={pendingDelete !== null}
        okButtonProps={{ danger: true }}
        title="删除该订阅？"

        okText="删除订阅"
        onCancel={() => setPendingDelete(null)}
        onOk={() => {
          const url = pendingDelete;
          if (url) useAppStore.getState().removeSubscription(url);
          setPendingDelete(null);
          toast('订阅已删除', 'success');
        }}
      >
        {pendingDelete
          ? (() => {
              const impact = deleteImpact(pendingDelete);
              const parts: string[] = [];
              if (impact.vod > 0) parts.push(`${impact.vod} 个点播源`);
              if (impact.live > 0) parts.push(`${impact.live} 个直播源`);
              return parts.length > 0
                ? `将同时删除该订阅导入的 ${parts.join(' 与 ')}；你收藏的频道会保留。`
                : '该订阅当前未导入任何源，删除后不影响其他数据。';
            })()
          : undefined}
      </Modal>
    </Flex>
  );
}

/** 配置导入导出（导出受登录门控；导入前先解析预览再确认，避免误覆盖） */
function ConfigIoPanel() {
  const { toast } = useToast();
  const { verified, openLogin } = useAuth();
  const [pending, setPending] = useState<{ file: File; summary: string } | null>(null);

  const doExport = async () => {
    if (verified === false) {
      openLogin();
      return;
    }
    try {
      const json = await exportConfig();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Meet-you-Settings_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('配置已导出', 'success');
    } catch {
      toast('导出失败', 'error');
    }
  };

  const pickImport = async (file: File) => {
    try {
      const summary = summarizeConfig(await file.text());
      setPending({ file, summary });
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      await importConfig(await pending.file.text());
      setPending(null);
      toast('配置导入成功，即将刷新页面', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      toast(err instanceof Error ? err.message : '导入失败', 'error');
    }
  };

  return (
    <Flex vertical component="section">
      <Flex align="center" justify="space-between" gap="small" style={{ marginBottom: 12 }}>
        <Flex vertical style={{ minWidth: 0 }}>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {'配置导入导出'}
          </Typography.Title>
          <Typography.Text type="secondary" ellipsis>
            {'导出/导入包含数据源、订阅与偏好设置的整机配置'}
          </Typography.Text>
        </Flex>
      </Flex>
      <Flex gap={8}>
        <Button style={{ flex: '1 1 0%' }} type="default" onClick={doExport}>
          导出配置
        </Button>
        <Upload
          style={{ flex: '1 1 0%' }}

          showUploadList={false}
          accept=".json,application/json"
          beforeUpload={(file) => {
            void pickImport(file);
            return false;
          }}
        >
          <Button block>导入配置</Button>
        </Upload>
      </Flex>

      {/* 重操作：导入会覆盖全部配置，先确认并展示将导入的内容概要 */}
      <Modal
        centered
        width={420}
        destroyOnHidden
        closable={false}
        cancelButtonProps={{ autoFocus: true }}
        open={pending !== null}
        okButtonProps={{ danger: true }}
        title="导入配置并覆盖当前数据？"

        okText="导入并覆盖"
        onCancel={() => setPending(null)}
        onOk={confirmImport}
      >
        {pending
          ? `${pending.summary}。导入后将立即刷新页面，当前设备上的配置与观看历史会被覆盖。`
          : undefined}
      </Modal>
    </Flex>
  );
}

/** 解析配置文件概要（宽松，仅用于导入前预览） */
function summarizeConfig(text: string): string {
  let cfg: { name?: string; data?: Record<string, unknown> };
  try {
    cfg = JSON.parse(text) as { name?: string; data?: Record<string, unknown> };
  } catch {
    throw new Error('文件不是合法的 JSON');
  }
  if (cfg.name !== 'LibreTV-Settings') throw new Error('配置文件格式不正确');

  const parts: string[] = [];
  const settingsRaw = cfg.data?.[PERSIST_KEY];
  if (typeof settingsRaw === 'string') {
    try {
      const state = (JSON.parse(settingsRaw) as { state?: Record<string, unknown> }).state ?? {};
      const vod = Array.isArray(state.customAPIs) ? state.customAPIs.length : 0;
      const live = Array.isArray(state.liveSubscriptions) ? state.liveSubscriptions.length : 0;
      const subs = Array.isArray(state.subscriptions) ? state.subscriptions.length : 0;
      parts.push(`${vod} 个点播源`, `${live} 个直播源`, `${subs} 个订阅`);
    } catch {
      /* 设置片段损坏时忽略该部分统计 */
    }
  }
  const historyRaw = cfg.data?.['viewingHistory'];
  if (typeof historyRaw === 'string') {
    try {
      const h = JSON.parse(historyRaw);
      if (Array.isArray(h)) parts.push(`${h.length} 条观看历史`);
    } catch {
      /* 忽略 */
    }
  }
  return parts.length > 0 ? `该文件包含 ${parts.join('、')}` : '该文件未包含可导入的数据';
}

function SourceForm({
  visible,
  initial,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  initial?: { key: string; name: string; url: string; detail?: string; isAdult?: boolean };
  onCancel: () => void;
  onSubmit: (data: { name: string; url: string; detail?: string; isAdult?: boolean }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [detail, setDetail] = useState(initial?.detail ?? '');
  const [isAdult, setIsAdult] = useState(initial?.isAdult ?? false);
  const { toast } = useToast();

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setUrl(initial?.url ?? '');
      setDetail(initial?.detail ?? '');
      setIsAdult(initial?.isAdult ?? false);
    }
  }, [visible, initial]);

  if (!visible) return null;

  const submit = () => {
    const n = name.trim();
    const u = url.trim().replace(/\/+$/, '');
    if (!n || !u) {
      toast('请输入 API 名称和链接', 'warning');
      return;
    }
    if (!validateSourceUrl(u)) {
      toast('API 链接需以 http:// 或 https:// 开头', 'warning');
      return;
    }
    onSubmit({ name: n, url: u, detail: detail.trim() || undefined, isAdult });
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
          aria-label="点播源名称"
          placeholder="名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          style={{ width: '100%' }}
          aria-label="API 地址"
          placeholder="API 地址，如 https://example.com/api.php/provide/vod"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          style={{ width: '100%' }}
          aria-label="详情页地址（可选）"
          placeholder="详情页地址（可选），如 https://example.com"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
        <Checkbox
          style={{ fontSize: 'var(--ant-font-size-sm)', color: 'var(--ant-color-text-secondary)' }}
          checked={isAdult}
          onChange={(e) => setIsAdult(e.target.checked)}
        >
          标记为成人内容源（受成人过滤控制）
        </Checkbox>
        <Flex gap={8} justify="flex-end">
          <Button type="default" size="small" onClick={onCancel}>
            取消
          </Button>
          <Button type="primary" size="small" onClick={submit}>
            {initial ? '更新' : '添加'}
          </Button>
        </Flex>
      </Flex>
    </Card>
  );
}
