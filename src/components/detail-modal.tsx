'use client';

import { ArrowDownOutlined } from '@ant-design/icons';
import { Button, Modal, Spin, Result, Empty, Space, Typography, Flex, Row, Col, Grid } from 'antd';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client-api';
import type { SearchResultItem, VideoDetail } from '@/lib/types';
import { buildWatchUrl } from '@/lib/utils';
import { formatRemarks } from '@/lib/remarks';
import { SmartImage } from './smart-image';
import { useAppStore, resolveSource } from '@/lib/store';
import { useToast } from './toast';
import { addSearchHistory } from '@/lib/db';
import { copyToClipboard } from '@/lib/clipboard';

/**
 * 详情弹窗：剧集列表 + 排序 + 复制链接。
 * 剧集点击 → /watch 路由（URL 携带定位参数，可分享、可后退）。
 */

export function DetailModal({
  item,
  onClose,
}: {
  item: SearchResultItem | null;
  onClose: () => void;
}) {
  const screens = Grid.useBreakpoint();
  const store = useAppStore();
  const router = useRouter();
  const { toast } = useToast();
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reversed, setReversed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => setPosterFailed(false),
    [item?.pic, store.imageProxyMode, store.customImageProxy],
  );

  useEffect(() => {
    if (!item) {
      setDetail(null);
      setError('');
      return;
    }
    const source = resolveSource(store, item.sourceKey, {
      url: item.sourceUrl,
      name: item.sourceName,
    });
    if (!source) {
      setError('点播源配置不存在（可能已被删除），请在设置中重新添加');
      return;
    }
    setLoading(true);
    setError('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    api
      .detail(item.vodId, source, controller.signal)
      .then((d) => setDetail(d))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : '获取详情失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  if (!item) return null;

  const episodes = detail ? (reversed ? [...detail.episodes].reverse() : detail.episodes) : [];
  const info = detail?.videoInfo;

  const play = (index: number) => {
    if (!detail || !detail.episodes[index]) return;
    addSearchHistory(item.name).catch(() => {});
    router.push(
      buildWatchUrl({
        sourceKey: item.sourceKey,
        vodId: item.vodId,
        index,
        title: item.name,
        sourceUrl: item.sourceUrl,
      }),
    );
  };

  const copyLinks = async () => {
    if (!detail) return;
    const ok = await copyToClipboard(detail.episodes.join('\n'));
    if (ok) toast('播放链接已复制', 'success');
    else toast('复制失败，请检查浏览器权限', 'error');
  };

  // 备注与卡片同源，同样归一化，避免同一部剧在两处显示不同文案
  const remarks = formatRemarks(info?.remarks);
  const metaRows = [
    info?.typeName && ['类型', info.typeName],
    info?.year && ['年份', info.year],
    info?.area && ['地区', info.area],
    info?.director && ['导演', info.director],
    info?.actor && ['主演', info.actor],
    remarks && ['备注', remarks],
  ].filter(Boolean) as [string, string][];

  return (
    <Modal
      open={Boolean(item)}
      title={
        <>
          <Typography.Text>{item.name}</Typography.Text>
          <Typography.Text
            type="secondary"
            style={{
              fontSize: 'var(--ant-font-size-sm)',
              fontWeight: 400,
            }}
          >
            {item.sourceName}
          </Typography.Text>
        </>
      }
      onCancel={onClose}
      width={768}
      footer={null}
      destroyOnHidden
      styles={{
        body: { maxHeight: 'calc(100dvh - 180px)', overflowY: 'auto', overflowX: 'hidden' },
      }}
    >
      <Flex vertical style={{ padding: 20, paddingTop: 16 }}>
        {loading && (
          <Spin description={'正在获取剧集信息...'}>
            <Flex style={{ minHeight: 112 }} />
          </Spin>
        )}

        {!loading && error && <Result status="warning" subTitle={error || '获取失败'} />}

        {!loading && !error && detail && (
          <>
            <Flex style={{ marginBottom: 16 }} vertical={!screens.sm} gap={16}>
              {item?.pic && !posterFailed && (
                <SmartImage
                  style={{
                    width: 96,
                    aspectRatio: '2/3',
                    objectFit: 'cover',
                    borderRadius: 'var(--ant-border-radius-lg)',
                    backgroundColor: 'var(--ant-color-fill-tertiary)',
                    alignSelf: 'center',
                    ...(screens.sm ? { width: 128 } : {}),
                    ...(screens.sm ? { alignSelf: 'flex-start' } : {}),
                    flexShrink: 0,
                  }}
                  url={item.pic}
                  mode={store.imageProxyMode}
                  customProxy={store.customImageProxy}
                  alt={item.name}

                  loading="eager"
                  onExhausted={() => setPosterFailed(true)}
                />
              )}
              <Flex style={{ minWidth: 0 }} vertical gap={12}>
                {metaRows.length > 0 && (
                  <Row style={{ fontSize: 'var(--ant-font-size)' }} gutter={[24, 6]}>
                    {metaRows.map(([k, v]) => (
                      <Col key={k} xs={{ flex: '0 0 100%' }} sm={{ flex: '0 0 50%' }}>
                        <Typography.Text ellipsis style={{ minWidth: 0 }} title={`${k}: ${v}`}>
                          <Typography.Text type="secondary" style={{}}>
                            {k}:
                          </Typography.Text>{' '}
                          <Typography.Text style={{}}>{v}</Typography.Text>
                        </Typography.Text>
                      </Col>
                    ))}
                  </Row>
                )}
                {info?.desc && (
                  <Typography.Paragraph
                    type="secondary"
                    ellipsis={{ rows: 3 }}
                    style={{
                      margin: 0,
                      fontSize: 'var(--ant-font-size)',

                      lineHeight: 1.625,
                    }}
                  >
                    {info.desc}
                  </Typography.Paragraph>
                )}
              </Flex>
            </Flex>

            {episodes.length > 0 ? (
              <>
                <Flex
                  style={{ marginBottom: 12 }}
                  wrap
                  align="center"
                  justify="space-between"
                  gap={8}
                >
                  <Flex align="center" gap={8}>
                    <Button
                      type="default"
                      size="small"

                      onClick={() => setReversed((v) => !v)}
                      aria-label={reversed ? '切换为正序排列' : '切换为倒序排列'}
                      title="调整剧集列表的排列顺序"
                    >
                      <ArrowDownOutlined
                        style={{
                          fontSize: 14,
                          ...(reversed ? { transform: 'rotate(180deg)' } : {}),
                        }}
                        aria-hidden
                      />
                      {reversed ? '正序排列' : '倒序排列'}
                    </Button>
                    <Typography.Text
                      type="secondary"
                      style={{
                        fontSize: 'var(--ant-font-size)',
                      }}
                    >
                      共 {episodes.length} 集
                    </Typography.Text>
                  </Flex>
                  <Button type="primary" size="small" onClick={copyLinks}>
                    复制链接
                  </Button>
                </Flex>
                <Row
                  style={{ maxHeight: '40vh', overflowY: 'auto', paddingInlineEnd: 4 }}
                  gutter={[8, 8]}
                >
                  {episodes.map((_, i) => {
                    const realIndex = reversed ? detail.episodes.length - 1 - i : i;
                    return (
                      <Col
                        key={realIndex}
                        xs={{ flex: '0 0 33.333333333333336%' }}
                        sm={{ flex: '0 0 20%' }}
                        md={{ flex: '0 0 14.285714285714286%' }}
                      >
                        <Button
                          type="default"
                          size="small"
                          block
                          style={{ textAlign: 'center' }}
                          onClick={() => play(realIndex)}
                        >
                          {realIndex + 1}
                        </Button>
                      </Col>
                    );
                  })}
                </Row>
              </>
            ) : (
              <Empty
                description={
                  <Space orientation="vertical">
                    <Typography.Text>{'未找到播放资源'}</Typography.Text>
                    <Typography.Text type="secondary">
                      {'该视频可能暂时无法播放，请尝试其他视频'}
                    </Typography.Text>
                  </Space>
                }
              ></Empty>
            )}
          </>
        )}
      </Flex>
    </Modal>
  );
}
