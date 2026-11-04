'use client';

import {
  PlaySquareOutlined, SearchOutlined, ClockCircleOutlined, DownloadOutlined,
  SettingOutlined, MenuOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Tooltip, AutoComplete, Flex, Layout, Grid, Typography, Form, Space } from 'antd';
import { AppDrawer as Drawer } from './app-drawer';
import { RecommendationNavigation } from './recommendation-navigation';
import { ThemeToggle } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { useSearchHistory } from './search-history';
import { useAuth } from './auth';
import styles from './cinema.module.css';

export const CINEMA_SIDEBAR_WIDTH = 184;

export function Header({
  showSearch = false,
  cinema = false,
  searchForm,
}: {
  showSearch?: boolean;
  cinema?: boolean;
  searchForm?: ReactNode;
}) {
  const screens = Grid.useBreakpoint();
  const desktop = !!screens.md;
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { checked, verified, openLogin } = useAuth();

  const navigation = (
    <div className={styles.sidebarInner}>
      <RecommendationNavigation onNavigate={() => setNavigationOpen(false)} />
    </div>
  );

  const search = searchForm ?? (showSearch ? <HeaderSearch /> : null);

  return (
    <>
      <Layout.Header className={styles.header} style={{
        position: 'sticky', top: 0, zIndex: 40, height: 'auto',
        paddingInline: desktop ? 24 : 12,
        background: 'var(--ant-color-bg-container)',
        borderBottom: '1px solid var(--ant-color-border-secondary)',
        lineHeight: 'normal',
      }}>
        <Flex align="center" gap={desktop ? 24 : 8} style={{
          height: desktop ? 72 : 64,
          ...(desktop && cinema && search ? {
            display: 'grid',
            gridTemplateColumns: 'minmax(184px, 1fr) minmax(0, 720px) minmax(184px, 1fr)',
          } : {}),
        }}>
          <Flex align="center" gap={desktop ? 28 : 8} style={{ minWidth: 0 }}>
          {!desktop && (
            <Button type="text" aria-label="打开分类" icon={<MenuOutlined />}
              onClick={() => setNavigationOpen(true)} />
          )}
          <Link href="/" aria-label="Meet you 首页"
            style={{ flexShrink: 0, width: cinema && desktop ? CINEMA_SIDEBAR_WIDTH - 24 : undefined }}>
            <Flex align="center" gap={10}>
              <span className={styles.brandIcon}><PlaySquareOutlined aria-hidden /></span>
              <Typography.Text className={`header-brand-text ${styles.brand}`} strong style={{ fontSize: 20 }}>Meet you</Typography.Text>
            </Flex>
          </Link>
          </Flex>
          {desktop && search && (
            <div style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: 720, marginInline: 'auto' }}>
              {search}
            </div>
          )}
          <Flex className={styles.tools} align="center" gap={4} style={{ marginInlineStart: 'auto' }}>
            <ThemeToggle />
            <Tooltip title="观看历史">
              <Button type="text" aria-label="观看历史" onClick={() => setHistoryOpen(true)}
                icon={<ClockCircleOutlined />} />
            </Tooltip>
            <Tooltip title="下载管理">
              <Button type="text" aria-label="下载管理" onClick={requestShowDownloadManager}
                icon={<DownloadOutlined />} />
            </Tooltip>
            <Tooltip title="设置">
              <Button type="text" aria-label="设置" onClick={() => setSettingsOpen(true)}
                icon={<SettingOutlined />} />
            </Tooltip>
            {checked && !verified && <Button size="small" onClick={openLogin}>访问验证</Button>}
          </Flex>
        </Flex>
        {!desktop && search && <div style={{ paddingBottom: 12 }}>{search}</div>}
      </Layout.Header>
      {cinema && desktop && (
        <Layout.Sider width={CINEMA_SIDEBAR_WIDTH} theme="light" aria-label="影片分类导航"
          style={{
            position: 'fixed', top: 72, bottom: 0, left: 0, zIndex: 30,
            background: 'var(--ant-color-bg-container)',
            borderInlineEnd: '1px solid var(--ant-color-border-secondary)',
            overflow: 'hidden',
          }}>
          {navigation}
        </Layout.Sider>
      )}
      <Drawer title="影片分类" placement="left" open={!desktop && navigationOpen}
        onClose={() => setNavigationOpen(false)} size={256}
        styles={{ section: { overflow: 'hidden' }, body: { padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}>
        {navigation}
      </Drawer>
      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

function HeaderSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const searchHistory = useSearchHistory(query);

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`);
    searchHistory.record(q);
  };

  return (
    <Form style={{ width: '100%' }} onFinish={() => submitSearch(query)}>
      <Space.Compact block size="large">
        <AutoComplete
          className="header-search-input"
          style={{ minWidth: 0, width: '100%', flex: '1 1 0%' }}
          value={query}
          options={searchHistory.options}
          open={searchHistory.open}
          onOpenChange={searchHistory.onOpenChange}
          onFocus={() => searchHistory.onOpenChange(true)}
          onChange={(value) => setQuery((value ?? '').slice(0, 100))}
          onSelect={(text) => { setQuery(text); submitSearch(text); }}
          popupRender={searchHistory.popupRender}
          defaultActiveFirstOption={false}
          allowClear
          prefix={<SearchOutlined aria-hidden />}
          aria-label="搜索影片"
          placeholder="搜索电影、剧集、动漫"
        />
        <Button className="header-search-button" type="primary" htmlType="submit" aria-label="搜索">
          搜索
        </Button>
      </Space.Compact>
    </Form>
  );
}
