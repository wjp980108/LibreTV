'use client';

import { Layout, Flex, Typography, Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth';

/** 上游仓库最新 tag（即最新版本号），用于页脚的更新检测 */
const UPSTREAM_TAGS_API = 'https://api.github.com/repos/LibreSpark/LibreTV/tags?per_page=1';

/** 页脚版本号的更新检测结果；null 表示无需检测（本地 dev 构建） */
type UpstreamUpdate = { status: 'checking' | 'latest' | 'newer'; latest?: string };

/** 点分版本号比较：a 大于 b 返回正数 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 检测上游是否有更新的版本；检测失败或本地构建（dev）时静默返回 null */
function useUpstreamUpdate(current: string | null): UpstreamUpdate | null {
  const [state, setState] = useState<UpstreamUpdate | null>({ status: 'checking' });
  useEffect(() => {
    if (!current || current === 'dev') {
      setState(null);
      return;
    }
    // 按当前版本隔离缓存到 sessionStorage：一次会话最多请求一次 GitHub API
    const cacheKey = `upstream-latest-tag:${current}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      setState(
        compareVersions(cached, current) > 0
          ? { status: 'newer', latest: cached }
          : { status: 'latest' },
      );
      return;
    }
    let alive = true;
    fetch(UPSTREAM_TAGS_API)
      .then((r) => (r.ok ? r.json() : []))
      .then((tags: { name?: string }[]) => {
        const name = tags[0]?.name?.replace(/^v/, '');
        if (!name || !alive) return;
        try {
          sessionStorage.setItem(cacheKey, name);
        } catch {
          /* 隐私模式等场景下缓存不可写，忽略即可 */
        }
        setState(
          compareVersions(name, current) > 0
            ? { status: 'newer', latest: name }
            : { status: 'latest' },
        );
      })
      .catch(() => {
        /* 网络受限 / 触发 GitHub 限流时静默跳过 */
        if (alive) setState(null);
      });
    return () => {
      alive = false;
    };
  }, [current]);
  return state;
}

/** 全站统一页脚：仓库链接 + 版本号（悬停显示上游更新检测结果） */
export function SiteFooter() {
  const { version } = useAuth();
  const upstreamUpdate = useUpstreamUpdate(version);
  const tip =
    upstreamUpdate?.status === 'newer'
      ? `发现新版本 v${upstreamUpdate.latest}`
      : upstreamUpdate?.status === 'latest'
        ? '已是最新版本'
        : upstreamUpdate
          ? '正在检测更新…'
          : undefined;
  return (
    <Layout.Footer
      style={{
        padding: '20px 16px',
        borderTop: '1px solid var(--ant-color-border-secondary)',
        background: 'transparent',
      }}
    >
      <Flex align="center" justify="center" wrap gap={6}>
        <Tooltip title={tip}>
          <Typography.Link
            href="https://github.com/LibreSpark/LibreTV"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12 }}
          >
            LibreTV{version ? ` v${version}` : ''}
          </Typography.Link>
        </Tooltip>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          · AGPL-3.0 License
        </Typography.Text>
      </Flex>
    </Layout.Footer>
  );
}
