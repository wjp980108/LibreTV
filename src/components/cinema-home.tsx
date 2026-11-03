'use client';

import { SearchOutlined, ArrowRightOutlined, ClockCircleOutlined } from '@ant-design/icons';
import Link from 'next/link';
import {
  Button,
  Progress,
  Skeleton,
  Card,
  Flex,
  Row,
  Col,
  Grid,
  Typography,
  Empty,
  Image,
} from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { buildWatchUrl, formatTime } from '@/lib/utils';
import { resolveSource, useAppStore } from '@/lib/store';
import { SmartImage } from './smart-image';

export function CinemaHero({ onSearch }: { onSearch: () => void }) {
  const screens = Grid.useBreakpoint();
  return (
    <Card
      style={{
        borderColor: '#d1c29b28',
        background: '#202820',
        color: '#f3f0e5',
      }}
      className="cinema-hero relative isolate overflow-hidden"
      aria-label="欢迎来到私人影院"
      styles={{ body: { padding: screens.md ? '38px 44px 56px' : '28px 24px 56px' } }}
    >
      <Image
        preview={false}
        src="/cinema-landscape.svg"
        alt=""
        styles={{
          root: { position: 'absolute', inset: 0, zIndex: -2, width: '100%', height: '100%' },
          image: {
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 47%',
          },
        }}
      />
      <Flex vertical align="flex-start" gap={20}>
        <Typography.Text className="text-[10px] tracking-[2px]" style={{ color: '#c5c8b4' }}>
          THE ART OF SLOWING DOWN
        </Typography.Text>
        <Typography.Title
          level={2}
          className="m-0 text-[clamp(28px,2.6vw,42px)] leading-[1.45] font-medium tracking-[4px]"
          style={{
            color: '#f3f0e5',
            fontFamily: "'Noto Serif SC', 'Songti SC', SimSun, serif",
          }}
        >
          世界很大，
          <br />
          这一刻属于你。
        </Typography.Title>
        <Typography.Paragraph className="m-0 text-xs" style={{ color: '#b8bdb0' }}>
          关掉喧嚣，让故事开场。
          <br />
          在自己的节奏里，遇见下一部好电影。
        </Typography.Paragraph>
        <Flex align="center" gap={16} wrap>
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined style={{ fontSize: 18 }} aria-hidden />}
            onClick={onSearch}
          >
            寻找一部好片
          </Button>
          <Button type="link" href="#discover" style={{ color: '#e0e1d5' }}>
            随心探索 <ArrowRightOutlined style={{ fontSize: 16 }} aria-hidden />
          </Button>
        </Flex>
      </Flex>
      <Typography.Text
        className="absolute bottom-[18px] left-6 text-[9px] tracking-[1.5px]"
        style={{ color: '#9fa794' }}
      >
        A LITTLE ESCAPE, JUST FOR YOU.
      </Typography.Text>
      {screens.lg && (
        <Typography.Text
          className="absolute right-6 bottom-[18px] text-[9px] tracking-[1.4px]"
          style={{ color: '#bbc2ad' }}
          aria-hidden="true"
        >
          01 / PRIVATE SCREENING
        </Typography.Text>
      )}
    </Card>
  );
}

export function ContinueWatching() {
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().limit(4).toArray());
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const imageProxyMode = useAppStore((s) => s.imageProxyMode);
  const customImageProxy = useAppStore((s) => s.customImageProxy);
  return (
    <Flex
      component="section"
      vertical
      gap={16}
      id="continue-watching"
      style={{ scrollMarginTop: 100 }}
      aria-labelledby="continue-title"
    >
      <Flex justify="space-between" align="center" gap={12}>
        <Flex vertical gap={4}>
          <Typography.Text
            style={{ fontSize: 10, letterSpacing: 1.8, fontWeight: 500 }}
            type="secondary"
          >
            PICK UP WHERE YOU LEFT OFF
          </Typography.Text>
          <Typography.Title level={4} id="continue-title" style={{ margin: 0 }}>
            继续观看
          </Typography.Title>
        </Flex>
        <ClockCircleOutlined style={{ fontSize: 18 }} aria-hidden />
      </Flex>
      {!history ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : history.length === 0 ? (
        <Card size="small" styles={{ body: { padding: 16 } }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <Flex vertical gap={4}>
                <Typography.Text>你的下一段故事，从这里开始</Typography.Text>
                <Typography.Text type="secondary">
                  播放过的影片会出现在这里，随时回来，接着看。
                </Typography.Text>
              </Flex>
            }
          >
            <Button href="#discover" type="link">
              去探索 <ArrowRightOutlined style={{ fontSize: 18 }} aria-hidden />
            </Button>
          </Empty>
        </Card>
      ) : (
        <Row gutter={[14, 14]}>
          {history.map((item) => {
            const source = resolveSource({ customAPIs, envSources }, item.sourceKey);
            const percent =
              item.duration > 0
                ? Math.min(
                    100,
                    Math.max(0, Math.round((item.playbackPosition / item.duration) * 100)),
                  )
                : 0;
            return (
              <Col key={item.id} xs={24} sm={12} xl={6}>
                <Link
                  href={buildWatchUrl({
                    sourceKey: item.sourceKey,
                    vodId: item.vodId,
                    index: item.episodeIndex,
                    title: item.title,
                    sourceUrl: source?.url ?? item.sourceUrl,
                    detail: source?.detail,
                  })}
                >
                  <Card
                    hoverable
                    size="small"
                    styles={{ body: { padding: 0, overflow: 'hidden' } }}
                  >
                    <Flex align="center" gap={12}>
                      <Flex
                        align="center"
                        justify="center"
                        style={{
                          width: 66,
                          height: 94,
                          flexShrink: 0,
                          position: 'relative',
                          background: 'var(--ant-color-fill-tertiary)',
                        }}
                      >
                        <SmartImage
                          url={item.pic}
                          mode={imageProxyMode}
                          customProxy={customImageProxy}
                          alt={item.title}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </Flex>
                      <Flex vertical gap={4} style={{ minWidth: 0, flex: 1, paddingInlineEnd: 12 }}>
                        <Typography.Text ellipsis strong>
                          {item.title}
                        </Typography.Text>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          第 {item.episodeIndex + 1} 集 · 已观看 {formatTime(item.playbackPosition)}
                        </Typography.Text>
                        <Progress percent={percent} showInfo={false} size="small" />
                      </Flex>
                    </Flex>
                  </Card>
                </Link>
              </Col>
            );
          })}
        </Row>
      )}
    </Flex>
  );
}
