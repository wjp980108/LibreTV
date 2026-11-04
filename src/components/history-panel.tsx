'use client';

import { SearchOutlined, VideoCameraOutlined, CloseOutlined } from '@ant-design/icons';
import {
  Input,
  Button,
  Modal,
  Spin,
  Empty,
  Space,
  Typography,
  Flex,
  Progress,
  Layout,
  Card,
} from 'antd';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Link from 'next/link';

import { SmartImage } from './smart-image';
import { AppDrawer as Drawer } from './app-drawer';
import {
  db,
  clearAllHistory,
  removeHistory,
  upsertHistory,
  MAX_HISTORY,
  type HistoryEntry,
} from '@/lib/db';
import { buildWatchUrl, formatRelativeTime, formatTime } from '@/lib/utils';
import { useToast } from './toast';
import { resolveSource, useAppStore } from '@/lib/store';

/**
 * 观看历史面板（IndexedDB 实时查询）。
 * 与旧版的区别：播放前按需重新拉取剧集详情，不再依赖历史记录里冗余存储的全集 URL。
 * 破坏性操作分级：清空全部走确认弹窗，删除单条支持撤销。
 */

/** 未搜索时列表默认展示的条数（DB 实存 MAX_HISTORY 条，其余靠搜索查阅） */
const VISIBLE_LIMIT = 50;

export function HistoryPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  // 全量读取（上限即 DB 淘汰上限）：默认只渲染最近若干条，搜索时覆盖更早的记录
  const history = useLiveQuery(
    () => db.history.orderBy('timestamp').reverse().limit(MAX_HISTORY).toArray(),
    [open],
  );
  const { toast } = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const [query, setQuery] = useState('');

  // 关闭后重置搜索词：下次打开回到完整列表，不残留上次的过滤状态
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const keyword = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const all = history ?? [];
    if (!keyword) return all.slice(0, VISIBLE_LIMIT);
    return all.filter((h) => h.title.toLowerCase().includes(keyword));
  }, [history, keyword]);

  const total = history?.length ?? 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="观看历史"
      destroyOnHidden
      closable={{ placement: 'end' }}
      styles={{
        body: { display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
      }}
      size={512}
    >
      <Flex
        vertical
        style={{
          borderBottomWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--ant-color-border-secondary)',
          paddingInline: 16,
          paddingBlock: 12,
          flexShrink: 0,
        }}
      >
        {total > 0 ? (
          <Flex align="center" gap={8}>
            <Input
              style={{ flex: '1 1 0%' }}

              allowClear
              prefix={<SearchOutlined style={{ fontSize: 16 }} aria-hidden />}
              placeholder="搜索观看历史…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索观看历史"
            />
            <Button
              style={{ flexShrink: 0 }}
              type="text"

              onClick={() => setConfirmClear(true)}
            >
              清空历史
            </Button>
          </Flex>
        ) : undefined}
      </Flex>
      <Layout.Content
        style={{
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: 16,
          flex: '1 1 0%',
        }}
      >
        {!history ? (
          <Spin description={undefined}>
            <Flex style={{ minHeight: 112 }} />
          </Spin>
        ) : total === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space orientation="vertical">
                <Typography.Text>{'暂无观看记录'}</Typography.Text>
              </Space>
            }
          ></Empty>
        ) : visible.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Space orientation="vertical">
                <Typography.Text>{`没有匹配「${query.trim()}」的观看记录`}</Typography.Text>
              </Space>
            }
          ></Empty>
        ) : (
          <>
            {!keyword && total > VISIBLE_LIMIT && (
              <Typography.Paragraph
                type="secondary"
                style={{
                  margin: 0,
                  fontSize: 'var(--ant-font-size-sm)',

                  marginBottom: 8,
                }}
              >
                共 {total} 条记录，仅显示最近 {VISIBLE_LIMIT} 条，可用上方搜索查找更早的记录
              </Typography.Paragraph>
            )}
            <Flex
              style={{ margin: 0, padding: 0, listStyle: 'none' }}
              vertical
              gap={8}
              component="ul"
            >
              {visible.map((item) => (
                <HistoryItem key={`${item.sourceKey}_${item.vodId}`} item={item} />
              ))}
            </Flex>
          </>
        )}

        {/* 重操作：清空不可撤销，先确认并说明数量 */}
        <Modal
          centered
          width={420}
          destroyOnHidden
          closable={false}
          cancelButtonProps={{ autoFocus: true }}
          open={confirmClear}
          okButtonProps={{ danger: true }}
          title="清空全部观看历史？"

          okText="清空"
          onCancel={() => setConfirmClear(false)}
          onOk={() => {
            void clearAllHistory().then(() => toast('观看历史已清空', 'success'));
            setConfirmClear(false);
          }}
        >
          {history ? `将删除 ${history.length} 条观看记录，此操作不可撤销。` : undefined}
        </Modal>
      </Layout.Content>
    </Drawer>
  );
}

function HistoryItem({ item }: { item: HistoryEntry }) {
  // 精确订阅：整份 useAppStore() 会让每条历史在任意 store 变化（搜索健康度、测活写回等）时重渲染
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const { toast } = useToast();
  const [imgFailed, setImgFailed] = useState(false);
  const source = resolveSource({ customAPIs, envSources }, item.sourceKey);

  const hasPercent =
    item.playbackPosition > 10 && item.duration > 0 && item.playbackPosition < item.duration * 0.95;
  const percent = hasPercent ? Math.round((item.playbackPosition / item.duration) * 100) : 0;

  const href = buildWatchUrl({
    sourceKey: item.sourceKey,
    vodId: item.vodId,
    index: item.episodeIndex,
    title: item.title,
    sourceUrl: source?.url,
    detail: source?.detail,
  });

  const remove = () => {
    void removeHistory(item.sourceKey, item.vodId).then(() => {
      // 轻操作：给撤销窗口，恢复时写回原记录
      toast('已删除该记录', 'info', {
        action: {
          label: '撤销',
          onClick: () => {
            void upsertHistory({
              sourceKey: item.sourceKey,
              sourceUrl: item.sourceUrl,
              vodId: item.vodId,
              title: item.title,
              pic: item.pic,
              episodeIndex: item.episodeIndex,
              totalEpisodes: item.totalEpisodes,
              playbackPosition: item.playbackPosition,
              duration: item.duration,
              timestamp: item.timestamp,
            }).then(() => toast('已恢复', 'success'));
          },
        },
      });
    });
  };

  return (
    <li>
      <Card
        size="small"
        hoverable
        styles={{ body: { padding: 0 } }}
        style={{ position: 'relative' }}
      >
        <Link
          href={href}
          onClick={() => {
            // 点击即同步一次时间戳，置顶最近观看
            upsertHistory({ ...item, timestamp: Date.now() }).catch(() => {});
          }}
          style={{
            display: 'block',
            backgroundColor: 'var(--ant-color-bg-container)',
            borderRadius: 'var(--ant-border-radius-lg)',
            padding: 12,
            paddingInlineEnd: 40,
          }}
        >
          <Flex align="center" gap={12}>
            {item.pic && !imgFailed ? (
              <SmartImage
                url={item.pic}
                mode={imageProxyMode}
                customProxy={customImageProxy}
                alt=""
                style={{
                  width: 40,
                  height: 56,
                  objectFit: 'cover',
                  borderRadius: 'var(--ant-border-radius-sm)',
                  backgroundColor: 'var(--ant-color-fill-tertiary)',
                }}
                onExhausted={() => setImgFailed(true)}
              />
            ) : (
              <Flex
                style={{
                  width: 40,
                  height: 56,
                  borderRadius: 'var(--ant-border-radius-sm)',
                  backgroundColor: 'var(--ant-color-fill-tertiary)',
                  flexShrink: 0,
                }}

                align="center"
                justify="center"
              >
                <VideoCameraOutlined
                  style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 16 }}
                  aria-hidden
                />
              </Flex>
            )}
            <Flex vertical style={{ minWidth: 0, flex: '1 1 0%' }}>
              <Typography.Text
                ellipsis
                style={{
                  fontSize: 'var(--ant-font-size)',
                  fontWeight: 500,

                  minWidth: 0,
                }}
              >
                {item.title}
              </Typography.Text>
              <Flex
                style={{
                  fontSize: 'var(--ant-font-size-sm)',
                  color: 'var(--ant-color-text-tertiary)',
                  marginTop: 2,
                }}
                align="center"
                gap={6}
                wrap
              >
                {item.totalEpisodes > 0 && (
                  <Typography.Text>
                    第 {item.episodeIndex + 1}/{item.totalEpisodes} 集
                  </Typography.Text>
                )}
                {hasPercent && (
                  <Typography.Text>· {formatTime(item.playbackPosition)}</Typography.Text>
                )}
                <Typography.Text>· {formatRelativeTime(item.timestamp)}</Typography.Text>
              </Flex>
              {hasPercent && <Progress percent={percent} showInfo={false} size="small" />}
            </Flex>
          </Flex>
        </Link>
        <Button
          type="text"
          style={{ position: 'absolute', right: 8, top: 8 }}
          aria-label="删除记录"
          title="删除记录（可在提示中撤销）"
          onClick={remove}
        >
          <CloseOutlined style={{ fontSize: 16 }} aria-hidden />
        </Button>
      </Card>
    </li>
  );
}
