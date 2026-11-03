'use client';

import { CloseOutlined } from '@ant-design/icons';
import { Button, Checkbox, Drawer, Grid, Flex, Layout, Typography, Badge, Card } from 'antd';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  SEGMENT_COLORS,
  SEGMENT_LABELS,
  validateSegment,
  type SkipSegment,
  type SkipSegmentType,
} from '@/lib/skip-marks';
import { formatTime } from '@/lib/utils';
import { useToast } from './toast';

/**
 * 播放页的「跳过标记」抽屉。
 *
 * 采集站不提供片头片尾元数据，边界只能由用户在看的时候标记一次，
 * 之后同剧各集与同名资源自动套用。片段按位置归类：opening（片头）、
 * middle（中段）、ending（片尾）。抽屉负责「记录/试跳/微调/删除」，
 * 真正的跳过判定在 player-shell.tsx，存储与校验在 lib/skip-marks.ts。
 *
 * 交互约定：
 * - 抽屉是非模态的：不遮光、不锁滚动、不挡点击。标记的前提是"看着画面记边界"，
 *   模态遮罩会把正在播的视频压暗并吃掉点击，反而没法边看边标；
 * - 手机上（<lg）退化成底部半屏抽屉，并把记录按钮放在 footer 常驻，避免盖住画面、
 *   也避免列表变长后要滚到底才能记一笔；
 * - 记录/试跳前先暂停：点击到读取之间视频还在走，容易偏 1–2 秒；
 * - 顶部常驻「当前 12:34 / 45:00」，试跳与微调都有参照；
 * - 中段两步态的起点由播放页持有（pendingStart），与 Shift+S/E 共用同一份状态；
 * - 全局「自动跳过片段」在这里只读展示（层级不同，避免和「本剧跳过」并排成两个 checkbox）。
 */

interface PlayerClock {
  currentTime: number;
  duration: number;
  seek(seconds: number): void;
  pause(): void;
  isPaused(): boolean;
}

const SEGMENT_TYPES: SkipSegmentType[] = ['opening', 'middle', 'ending'];

const round1 = (v: number) => Math.round(v * 10) / 10;

export function SkipMarkPanel({
  open,
  onClose,
  markKey,
  pendingStart,
  onPendingStart,
  getPlayerClock,
  mobileMaxHeight,
}: {
  open: boolean;
  onClose: () => void;
  /** 已归一化的标记键（watch 页按剧名计算） */
  markKey: string;
  /** 中段两步态起点（页面层持有） */
  pendingStart: number | null;
  onPendingStart: (start: number | null) => void;
  /** 读取播放器当前时间/时长/跳转；播放器未就绪时返回 null */
  getPlayerClock: () => PlayerClock | null;
  /**
   * 小屏抽屉的最大高度（px，由播放页按播放器底边算出）：
   * 视口矮、播放器占比大时靠它保证抽屉不压住画面；未传则用默认 60vh。
   */
  mobileMaxHeight?: number;
}) {
  const screens = Grid.useBreakpoint();
  const mark = useAppStore((s) => s.skipMarks[markKey]);
  const setSkipMark = useAppStore((s) => s.setSkipMark);
  const setSkipMarkEnabled = useAppStore((s) => s.setSkipMarkEnabled);
  const autoSkipSegments = useAppStore((s) => s.autoSkipSegments);
  const { toast } = useToast();

  const segments = (mark?.segments ?? []).slice().sort((a, b) => a.start - b.start);
  const enabled = mark ? mark.enabled !== false : false;

  // 当前进度：抽屉打开时每秒刷新一次；用 ref 拿最新的取数函数，避免每秒重置定时器
  const clockFnRef = useRef(getPlayerClock);
  clockFnRef.current = getPlayerClock;
  const [clock, setClock] = useState({ current: 0, duration: 0, paused: true });
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const c = clockFnRef.current();
      setClock({
        current: c?.currentTime ?? 0,
        duration: c?.duration ?? 0,
        paused: c ? c.isPaused() : true,
      });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [open]);

  const write = (next: SkipSegment[]) => setSkipMark(markKey, next);

  // 记录/试跳前统一「先暂停再取时间」：暂停后 currentTime 才是用户看到的画面位置
  const pauseAndSnap = (): { t: number; duration: number } | null => {
    const c = getPlayerClock();
    if (!c) {
      toast('播放器尚未就绪，请稍后再试', 'warning');
      return null;
    }
    if (!c.isPaused()) c.pause();
    setClock({ current: c.currentTime, duration: c.duration, paused: true });
    return { t: round1(c.currentTime), duration: c.duration };
  };

  /** 记录一条片段；成功返回 true（失败时保留两步态，用户可以改位置重试） */
  const tryRecord = (segment: SkipSegment, label: string, duration: number): boolean => {
    const error = validateSegment(segment, duration, segments);
    if (error) {
      toast(error, 'error');
      return false;
    }
    write([...segments, segment]);
    const effect = autoSkipSegments
      ? segment.type === 'ending'
        ? '，越过起点后自动结束本集'
        : '，命中时将自动跳过'
      : segment.type === 'ending'
        ? '，命中时显示「跳过片尾」按钮'
        : '，命中时显示跳过按钮';
    const at =
      segment.type === 'ending'
        ? formatTime(segment.start)
        : segment.type === 'middle'
          ? `${formatTime(segment.start)} → ${formatTime(segment.end)}`
          : formatTime(segment.end);
    toast(`已记录${label} ${at}${effect}`, 'success');
    return true;
  };

  const recordAt = (type: 'opening' | 'ending') => {
    const snap = pauseAndSnap();
    if (!snap) return;
    if (snap.t <= 0) {
      toast(
        type === 'opening' ? '请先播放到片头结束的位置' : '请先播放到片尾开始的位置',
        'warning',
      );
      return;
    }
    if (type === 'opening') tryRecord({ type, start: 0, end: snap.t }, '片头结束', snap.duration);
    else tryRecord({ type, start: snap.t, end: -1 }, '片尾开始', snap.duration);
  };

  const markMiddleStart = () => {
    const snap = pauseAndSnap();
    if (!snap) return;
    if (snap.t <= 0) {
      toast('请先播放到片段起点', 'warning');
      return;
    }
    onPendingStart(snap.t);
    toast(`已暂停并记录起点 ${formatTime(snap.t)}，播放到终点后点「标记中段终点」`, 'info');
  };

  const markMiddleEnd = () => {
    if (pendingStart === null) return;
    const snap = pauseAndSnap();
    if (!snap) return;
    if (snap.t <= pendingStart) {
      toast('终点需晚于起点', 'warning');
      return;
    }
    if (
      tryRecord({ type: 'middle', start: pendingStart, end: snap.t }, '中段片段', snap.duration)
    ) {
      onPendingStart(null);
    }
  };

  const remove = (index: number) => {
    const seg = segments[index];
    if (!seg) return;
    const wasDisabled = mark?.enabled === false;
    write(segments.filter((_, i) => i !== index));
    // 删除可撤销：误删后不必再拖回原位置重标
    toast(`已删除${SEGMENT_LABELS[seg.type]}片段`, 'info', {
      action: {
        label: '撤销',
        onClick: () => {
          setSkipMark(markKey, segments);
          if (wasDisabled) setSkipMarkEnabled(markKey, false);
        },
      },
    });
  };

  const nudge = (index: number, delta: number) => {
    const seg = segments[index];
    if (!seg) return;
    const changed: SkipSegment =
      seg.type === 'ending'
        ? { ...seg, start: round1(seg.start + delta) }
        : seg.type === 'opening'
          ? { ...seg, end: round1(seg.end + delta) }
          : { ...seg, start: round1(seg.start + delta), end: round1(seg.end + delta) };
    const clockNow = getPlayerClock();
    const others = segments.filter((_, i) => i !== index);
    const error = validateSegment(changed, clockNow?.duration ?? 0, others);
    if (error) {
      toast(error, 'error');
      return;
    }
    write(segments.map((s, i) => (i === index ? changed : s)));
  };

  /** 试跳：跳到后保持暂停，让用户先确认画面（终点落在片段末尾前 1s） */
  const jump = (seg: SkipSegment, to: 'start' | 'end') => {
    const c = getPlayerClock();
    if (!c) {
      toast('播放器尚未就绪，请稍后再试', 'warning');
      return;
    }
    c.pause();
    c.seek(to === 'start' ? seg.start : Math.max(0, seg.end - 1));
    setClock({
      current: to === 'start' ? seg.start : Math.max(0, seg.end - 1),
      duration: c.duration,
      paused: true,
    });
  };

  /** 当前播放位置落在哪个片段里：列表里高亮出来，方便核对边界 */
  const currentKey = segments.find((s) => {
    if (clock.current < s.start) return false;
    if (s.type === 'ending') return true;
    return clock.current < s.end;
  });

  return (
    // 桌面端宽度收窄到 320px：播放页右侧剧集栏是 300px，抽屉正好盖住它而不压到视频；
    // 记录区放进 footer 常驻底部：手机上侧栏只占下半屏，滚到列表末尾再点按钮太别扭
    <Drawer
      open={open}
      onClose={onClose}
      title="跳过标记"
      footer={
        <Flex vertical>
          <Typography.Paragraph
            type="secondary"
            style={{ margin: 0, marginBottom: 6, fontSize: '11px' }}
          >
            记录（会先暂停在当前画面）
          </Typography.Paragraph>
          <Flex wrap align="center" gap={6}>
            <Button
              type="default"
              size="small"
              htmlType="button"

              title="把当前画面记为片头结束位置"
              onClick={() => recordAt('opening')}
            >
              记为片头结束
            </Button>
            <Button
              type="default"
              size="small"
              htmlType="button"

              title="把当前画面记为片尾开始位置"
              onClick={() => recordAt('ending')}
            >
              记为片尾开始
            </Button>
            {pendingStart === null ? (
              <Button
                type="default"
                size="small"
                htmlType="button"

                onClick={markMiddleStart}
              >
                标记中段起点
              </Button>
            ) : (
              <>
                <Button
                  type="default"
                  size="small"
                  htmlType="button"

                  onClick={markMiddleEnd}
                >
                  标记中段终点（自 {formatTime(pendingStart)}）
                </Button>
                <Button
                  type="default"
                  size="small"
                  htmlType="button"

                  title="放弃这个起点"
                  onClick={() => onPendingStart(null)}
                >
                  取消
                </Button>
              </>
            )}
          </Flex>
        </Flex>
      }
      destroyOnHidden
      closable={{ placement: 'end' }}
      styles={{
        body: { display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
        section: { pointerEvents: 'auto' },
      }}
      mask={false}
      autoFocus={false}
      focusable={{ trap: false, focusTriggerAfterClose: false }}
      placement={screens.lg ? 'right' : 'bottom'}
      size={screens.lg ? 320 : mobileMaxHeight ? Math.min(mobileMaxHeight, 520) : '60vh'}
      rootStyle={{ pointerEvents: 'none' }}
    >
      <Layout.Content
        style={{
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          padding: 16,
          flex: '1 1 0%',
        }}
      >
        {/* 当前进度 + 本剧开关：本剧作用域放最上，全局开关在底部只读展示，避免两个层级并排 */}
        <Flex align="flex-start" justify="space-between" gap={8}>
          <Flex vertical>
            <Typography.Paragraph
              type="secondary"
              style={{ margin: 0, fontSize: 'var(--ant-font-size-sm)' }}
            >
              当前{' '}
              <Typography.Text
                style={{
                  fontFamily: 'var(--ant-font-family-code)',
                }}
              >
                {formatTime(clock.current)}
              </Typography.Text>
              <Typography.Text type="secondary" style={{}}>
                {' '}
                / {formatTime(clock.duration)}
              </Typography.Text>
              {clock.paused && (
                <Typography.Text type="secondary" style={{ marginInlineStart: 4 }}>
                  · 已暂停
                </Typography.Text>
              )}
            </Typography.Paragraph>
            <Typography.Paragraph
              type="secondary"
              style={{ margin: 0, marginTop: 4, fontSize: '11px' }}
            >
              已标记 {segments.length} 段 · 按剧名对本剧各集与同名资源生效
            </Typography.Paragraph>
          </Flex>
          <Checkbox
            style={{
              fontSize: 'var(--ant-font-size-sm)',
              ...(mark
                ? { cursor: 'pointer', color: 'var(--ant-color-text-secondary)' }
                : { cursor: 'not-allowed', color: 'var(--ant-color-text-tertiary)' }),
              flexShrink: 0,
            }}

            title={mark ? '关闭后保留标记但完全不生效' : '还没有可开关的标记'}
            checked={enabled}
            disabled={!mark}
            onChange={(e) => setSkipMarkEnabled(markKey, e.target.checked)}
          >
            本剧跳过
          </Checkbox>
        </Flex>

        {segments.length === 0 ? (
          <Typography.Paragraph
            type="secondary"
            style={{
              margin: 0,
              marginTop: 12,
              borderRadius: 'var(--ant-border-radius-lg)',
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: 'var(--ant-color-border-secondary)',
              paddingInline: 12,
              paddingBlock: 12,
              fontSize: 'var(--ant-font-size-sm)',
              lineHeight: 1.625,
            }}
          >
            尚未标记跳过片段。播放到目标位置后，用下方按钮记录，或使用快捷键： Shift+I 片头结束 /
            Shift+O 片尾开始 / Shift+S · Shift+E 中段区间。
          </Typography.Paragraph>
        ) : (
          <Flex
            style={{ margin: 0, padding: 0, listStyle: 'none', marginTop: 12 }}
            vertical
            gap={8}
            component="ul"
          >
            {segments.map((seg, i) => {
              const isCurrent = currentKey === seg;
              // 中段可以有多条：按时间顺序编号（中段1 / 中段2…），否则两行 [中段] 分不清
              const sameTypeCount = segments.filter((s) => s.type === seg.type).length;
              const label =
                seg.type === 'middle' && sameTypeCount > 1
                  ? `${SEGMENT_LABELS.middle}${segments.slice(0, i).filter((s) => s.type === 'middle').length + 1}`
                  : SEGMENT_LABELS[seg.type];
              return (
                <li key={`${seg.type}:${seg.start}`}>
                  <Card
                    size="small"
                    style={{
                      position: 'relative',
                      ...(isCurrent
                        ? {
                            borderColor:
                              'color-mix(in srgb, var(--ant-color-primary) 60%, transparent)',
                            backgroundColor:
                              'color-mix(in srgb, var(--ant-color-fill-tertiary) 60%, transparent)',
                          }
                        : {
                            borderColor:
                              'color-mix(in srgb, var(--ant-color-border-secondary) 70%, transparent)',
                          }),
                    }}
                    styles={{
                      body: {
                        padding: 12,
                        background: isCurrent ? 'var(--ant-color-primary-bg)' : undefined,
                      },
                    }}
                  >
                    <Flex align="center" justify="space-between" gap={8}>
                      <Flex
                        style={{ minWidth: 0, fontSize: 'var(--ant-font-size-sm)' }}
                        align="center"
                        gap={6}
                        component="span"
                      >
                        <Badge color={SEGMENT_COLORS[seg.type]} />
                        <Typography.Text type="secondary" style={{}}>
                          [{label}]
                        </Typography.Text>
                        <Typography.Text
                          type="secondary"
                          style={{
                            fontFamily: 'var(--ant-font-family-code)',
                          }}
                        >
                          {formatTime(seg.start)} →{' '}
                          {seg.type === 'ending' ? '结尾' : formatTime(seg.end)}
                        </Typography.Text>
                      </Flex>
                      {isCurrent && (
                        <Typography.Text
                          style={{
                            fontSize: '10px',
                            color: 'var(--ant-color-primary)',
                            flexShrink: 0,
                          }}
                        >
                          当前
                        </Typography.Text>
                      )}
                    </Flex>
                    <Flex style={{ marginTop: 6 }} wrap align="center" gap={4}>
                      <Button
                        type="default"
                        size="small"
                        htmlType="button"

                        title="跳到片段起点，验证起点是否准确"
                        onClick={() => jump(seg, 'start')}
                      >
                        起点
                      </Button>
                      {seg.type !== 'ending' && (
                        <Button
                          type="default"
                          size="small"
                          htmlType="button"

                          title="跳到终点前 1 秒，验证是否会切掉正片或漏掉一段"
                          onClick={() => jump(seg, 'end')}
                        >
                          终点
                        </Button>
                      )}
                      <Button
                        type="default"
                        size="small"
                        htmlType="button"

                        title="边界提前 1 秒"
                        onClick={() => nudge(i, -1)}
                      >
                        -1s
                      </Button>
                      <Button
                        type="default"
                        size="small"
                        htmlType="button"

                        title="边界推后 1 秒"
                        onClick={() => nudge(i, 1)}
                      >
                        +1s
                      </Button>
                    </Flex>
                    {/* 删除放在右上角：条目多时「删」混在操作行里容易和 ±1s 混淆 */}
                    <Button
                      type="text"
                      htmlType="button"
                      style={{ position: 'absolute', right: 2, top: 2 }}
                      title="删除（可在提示中撤销）"
                      aria-label={`删除${label}片段`}
                      onClick={() => remove(i)}
                    >
                      <CloseOutlined style={{ fontSize: 14 }} aria-hidden />
                    </Button>
                  </Card>
                </li>
              );
            })}
          </Flex>
        )}

        {/* 全局开关：只读展示（层级与本剧开关不同，改起来去设置里更不容易误解） */}
        <Card
          size="small"
          style={{
            marginTop: 12,
            borderColor: 'var(--ant-color-border-secondary)',
            backgroundColor: 'var(--ant-color-bg-container)',
          }}
          styles={{ body: { padding: 0, paddingInline: 12, paddingBlock: 10 } }}
        >
          <Flex vertical>
            <Flex align="center" justify="space-between" gap={8}>
              <Typography.Text
                type="secondary"
                style={{
                  fontSize: 'var(--ant-font-size-sm)',
                }}
              >
                全局 · 自动跳过片段
              </Typography.Text>
              <Typography.Text
                style={{
                  fontSize: 'var(--ant-font-size-sm)',
                  fontWeight: 500,
                  ...(autoSkipSegments
                    ? { color: 'var(--ant-color-primary)' }
                    : { color: 'var(--ant-color-text-secondary)' }),
                }}
              >
                {autoSkipSegments ? '已开启' : '已关闭'}
              </Typography.Text>
            </Flex>
            <Typography.Paragraph
              type="secondary"
              style={{ margin: 0, marginTop: 4, fontSize: '11px', lineHeight: 1.625 }}
            >
              {autoSkipSegments
                ? '命中片头/中段自动跳段，片尾结束本集（是否连播看「自动连播」）。'
                : '命中片段只显示按钮，不自动跳。'}
              影响所有剧，在「设置 → 偏好设置」修改。
            </Typography.Paragraph>
          </Flex>
        </Card>

        <Flex
          wrap
          align="center"
          style={{
            marginTop: 12,
            fontSize: '11px',
            color: 'var(--ant-color-text-secondary)',
            columnGap: 12,
            rowGap: 4,
          }}
        >
          <Typography.Text>进度条色带：</Typography.Text>
          {SEGMENT_TYPES.map((t) => (
            <Flex
              key={t}
              align="center"
              gap={4}
              component="span"
              style={{ display: 'inline-flex' }}
            >
              <Badge color={SEGMENT_COLORS[t]} />
              {SEGMENT_LABELS[t]}
            </Flex>
          ))}
          <Typography.Text style={{ width: '100%' }}>
            跳过时播放器顶部会出现「撤销」，可回退刚跳过的那一次。
          </Typography.Text>
        </Flex>
      </Layout.Content>
    </Drawer>
  );
}
