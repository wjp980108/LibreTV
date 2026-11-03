'use client';

import {
  PlaySquareOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  SettingOutlined,
  HomeOutlined,
  VideoCameraOutlined,
  DesktopOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Button,
  Tooltip,
  AutoComplete,
  Menu,
  Flex,
  Layout,
  Grid,
  Typography,
  Badge,
  Form,
} from 'antd';
import { ThemeToggle } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';

import { useSearchHistory } from './search-history';
import { useAuth } from './auth';

export function Header({
  showSearch = false,
  cinema = false,
}: {
  showSearch?: boolean;
  cinema?: boolean;
}) {
  const screens = Grid.useBreakpoint();
  const desktop = !!screens.md;
  const sidebarWidth = screens.xl ? 214 : 180;
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchHistory = useSearchHistory(query);
  const { checked, verified, openLogin } = useAuth();

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    searchHistory.record(q);
  };
  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  return (
    <>
      <Layout.Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          height: desktop ? 80 : 64,
          paddingInline: desktop ? 32 : 16,
          background: 'color-mix(in srgb, var(--ant-color-bg-layout) 96%, transparent)',
          borderBottom: '1px solid var(--ant-color-border-secondary)',
          backdropFilter: 'blur(18px)',
          lineHeight: 'normal',
        }}
      >
        <Flex
          align="center"
          gap={desktop ? 28 : 8}
          style={{ height: '100%', maxWidth: 1600, marginInline: 'auto' }}
        >
          <Link href="/" aria-label="LibreTV 首页">
            <Flex align="center" gap={8}>
              <PlaySquareOutlined
                style={{ fontSize: 34, color: 'var(--ant-color-primary)' }}
                aria-hidden
              />
              <Flex vertical gap={2}>
                <Typography.Text strong style={{ fontSize: 22, lineHeight: 1.1 }}>
                  Libre
                  <Typography.Text style={{ color: 'var(--ant-color-primary)' }}>
                    TV
                  </Typography.Text>
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 7, letterSpacing: 2 }}>
                  PERSONAL CINEMA
                </Typography.Text>
              </Flex>
            </Flex>
          </Link>
          {screens.sm && (
            <Menu
              mode="horizontal"

              selectedKeys={[pathname]}
              style={{
                background: 'transparent',
                borderBottom: 0,
                minWidth: 170,
                lineHeight: desktop ? '80px' : '64px',
              }}
              items={[
                { key: '/', label: <Link href="/">我的影院</Link> },
                { key: '/live', label: <Link href="/live">电视直播</Link> },
              ]}
            />
          )}
          {showSearch && desktop && (
            <Form style={{ flex: 1, maxWidth: 420 }} onFinish={() => submitSearch(query)}>
              <AutoComplete
                style={{ minWidth: 0, width: '100%', flex: '1 1 0%' }}
                value={query}
                options={searchHistory.options}
                open={searchHistory.open}
                onOpenChange={searchHistory.onOpenChange}
                onFocus={() => searchHistory.onOpenChange(true)}
                onChange={(value) => setQuery((value ?? '').slice(0, 100))}
                onSelect={pickHistory}
                popupRender={searchHistory.popupRender}
                defaultActiveFirstOption={false}
                allowClear
                prefix={<SearchOutlined style={{ fontSize: 16 }} aria-hidden />}
                aria-label="搜索影片"
                placeholder="搜索电影、剧集，发现好故事…"
              />
            </Form>
          )}
          <Flex align="center" gap={desktop ? 4 : 0} style={{ marginInlineStart: 'auto' }}>
            {screens.xl && (
              <Badge
                color="#9cae80"
                text={
                  <Typography.Text type="secondary" style={{ fontSize: 11, marginRight: 16 }}>
                    私人放映室
                  </Typography.Text>
                }
              />
            )}
            <ThemeToggle />
            <Tooltip title={'观看历史'}>
              <Button
                type="text"
                aria-label={'观看历史'}
                onClick={() => setHistoryOpen(true)}
                icon={<ClockCircleOutlined style={{ fontSize: 18 }} aria-hidden />}
              />
            </Tooltip>
            <Tooltip title={'下载管理'}>
              <Button
                type="text"
                aria-label={'下载管理'}
                onClick={requestShowDownloadManager}
                icon={<DownloadOutlined style={{ fontSize: 18 }} aria-hidden />}
              />
            </Tooltip>
            <Tooltip title={'设置'}>
              <Button
                type="text"
                aria-label={'设置'}
                onClick={() => setSettingsOpen(true)}
                icon={<SettingOutlined style={{ fontSize: 18 }} aria-hidden />}
              />
            </Tooltip>
            {!cinema && desktop && (
              <Link
                href="/about"
                style={{
                  fontSize: 'var(--ant-font-size)',
                  color: 'var(--ant-color-text-secondary)',
                }}
              >
                关于
              </Link>
            )}
            {checked && !verified && (
              <Button size="small" onClick={openLogin}>
                访问验证
              </Button>
            )}
          </Flex>
        </Flex>
      </Layout.Header>
      {cinema && !desktop && (
        <Menu
          mode="horizontal"
          selectedKeys={['home']}
          style={{
            position: 'sticky',
            top: 64,
            zIndex: 30,
            background: 'var(--ant-color-bg-layout)',
          }}
          items={[
            {
              key: 'home',
              label: <Link href="/">影院首页</Link>,
              icon: <HomeOutlined style={{ fontSize: 18 }} aria-hidden />,
            },
            {
              key: 'discover',
              label: <Link href="/#discover">探索片库</Link>,
              icon: <VideoCameraOutlined style={{ fontSize: 18 }} aria-hidden />,
            },
            {
              key: 'live',
              label: <Link href="/live">电视直播</Link>,
              icon: <DesktopOutlined style={{ fontSize: 18 }} aria-hidden />,
            },
          ]}
        />
      )}
      {cinema && desktop && (
        <Layout.Sider
          width={sidebarWidth}
          collapsed={!desktop}
          collapsedWidth={0}
          trigger={null}
          aria-label="影院导航"
          style={{
            position: 'fixed',
            top: 80,
            bottom: 0,
            left: 0,
            zIndex: 30,
            background: 'var(--ant-color-bg-layout)',
            borderInlineEnd: '1px solid var(--ant-color-border-secondary)',
            overflowY: 'auto',
          }}
        >
          <Flex
            vertical
            justify="space-between"
            style={{ height: '100%', padding: '28px 12px 20px' }}
          >
            <Menu
              mode="inline"
              selectedKeys={['home']}
              style={{ background: 'transparent', borderInlineEnd: 0 }}
              items={[
                {
                  type: 'group',
                  label: '发现',
                  children: [
                    {
                      key: 'home',
                      icon: <HomeOutlined style={{ fontSize: 18 }} aria-hidden />,
                      label: <Link href="/">影院首页</Link>,
                    },
                    {
                      key: 'discover',
                      icon: <VideoCameraOutlined style={{ fontSize: 18 }} aria-hidden />,
                      label: <Link href="/#discover">探索片库</Link>,
                    },
                    {
                      key: 'live',
                      icon: <DesktopOutlined style={{ fontSize: 18 }} aria-hidden />,
                      label: <Link href="/live">电视直播</Link>,
                    },
                  ],
                },
                {
                  type: 'group',
                  label: '我的空间',
                  children: [
                    {
                      key: 'continue',
                      icon: <PlayCircleOutlined style={{ fontSize: 18 }} aria-hidden />,
                      label: <Link href="/#continue-watching">继续观看</Link>,
                    },
                    {
                      key: 'history',
                      icon: <ClockCircleOutlined style={{ fontSize: 18 }} aria-hidden />,
                      label: '观看历史',
                      onClick: () => setHistoryOpen(true),
                    },
                    {
                      key: 'downloads',
                      icon: <DownloadOutlined style={{ fontSize: 18 }} aria-hidden />,
                      label: '下载管理',
                      onClick: requestShowDownloadManager,
                    },
                  ],
                },
              ]}
            />
            <Flex vertical gap={24} style={{ paddingTop: 32 }}>
              <Menu
                mode="inline"
                selectable={false}
                style={{ background: 'transparent', borderInlineEnd: 0 }}
                items={[
                  {
                    key: 'settings',
                    icon: <SettingOutlined style={{ fontSize: 18 }} aria-hidden />,
                    label: '影院设置',
                    onClick: () => setSettingsOpen(true),
                  },
                  {
                    key: 'about',
                    icon: <InfoCircleOutlined style={{ fontSize: 18 }} aria-hidden />,
                    label: <Link href="/about">关于 LibreTV</Link>,
                  },
                ]}
              />
            </Flex>
          </Flex>
        </Layout.Sider>
      )}
      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}
