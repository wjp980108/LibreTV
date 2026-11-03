'use client';

import { Flex, Layout, Typography } from 'antd';
import { Header } from '@/components/header';
import { SiteFooter } from '@/components/site-footer';

export default function AboutPage() {
  return (
    <Layout style={{ minHeight: '100dvh', background: 'var(--ant-color-bg-layout)' }}>
      <Header />
      <Flex
        style={{
          maxWidth: 672,
          width: '100%',
          marginInline: 'auto',
          paddingInline: 16,
          paddingBlock: 40,
          flex: '1 1 0%',
        }}

        vertical
        gap={32}
        component="main"
      >
        <Flex vertical component="section">
          <Typography.Title
            level={1}
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size-heading-4)',
              fontWeight: 700,

              marginBottom: 12,
            }}
          >
            关于 LibreTV
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size)',

              lineHeight: 1.625,
            }}
          >
            LibreTV 是一个免费的在线视频搜索与观看平台。输入片名即可在多个点播源中聚合搜索，
            无需注册、无内嵌广告、不存储任何视频文件。所有播放内容均来自第三方公开接口。
          </Typography.Paragraph>
        </Flex>

        <Flex vertical component="section">
          <Typography.Title
            level={2}
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size)',
              fontWeight: 600,

              marginBottom: 10,
            }}
          >
            快捷键
          </Typography.Title>
          <Flex
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              fontSize: 'var(--ant-font-size)',
              color: 'var(--ant-color-text-secondary)',
              listStyleType: 'disc',
              listStylePosition: 'inside',
            }}
            vertical
            gap={6}
            component="ul"
          >
            <li>
              <Typography.Text code style={{ color: 'var(--ant-color-primary)' }}>
                空格
              </Typography.Text>{' '}
              播放 / 暂停
            </li>
            <li>
              <Typography.Text code style={{ color: 'var(--ant-color-primary)' }}>
                ←
              </Typography.Text>{' '}
              /{' '}
              <Typography.Text code style={{ color: 'var(--ant-color-primary)' }}>
                →
              </Typography.Text>{' '}
              快退 / 快进 5 秒
            </li>
            <li>
              <Typography.Text code style={{ color: 'var(--ant-color-primary)' }}>
                ↑
              </Typography.Text>{' '}
              /{' '}
              <Typography.Text code style={{ color: 'var(--ant-color-primary)' }}>
                ↓
              </Typography.Text>{' '}
              音量调节
            </li>
            <li>
              <Typography.Text code style={{ color: 'var(--ant-color-primary)' }}>
                F
              </Typography.Text>{' '}
              切换全屏
            </li>
            <li>
              <Typography.Text code style={{ color: 'var(--ant-color-primary)' }}>
                Alt + ←/→
              </Typography.Text>{' '}
              上一集 / 下一集
            </li>
            <li>移动端长按视频可 3 倍速播放</li>
          </Flex>
        </Flex>

        <Flex vertical component="section">
          <Typography.Title
            level={2}
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size)',
              fontWeight: 600,

              marginBottom: 10,
            }}
          >
            隐私与数据
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size)',

              lineHeight: 1.625,
            }}
          >
            你的搜索历史、观看进度等数据仅保存在本设备浏览器中（IndexedDB），不会上传到服务器。
            聚合搜索请求由服务端代理转发，第三方数据源不会看到你的 IP 地址。
          </Typography.Paragraph>
        </Flex>

        <Flex vertical component="section">
          <Typography.Title
            level={2}
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size)',
              fontWeight: 600,

              marginBottom: 10,
            }}
          >
            免责声明
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{
              margin: 0,
              fontSize: 'var(--ant-font-size)',

              lineHeight: 1.625,
            }}
          >
            本项目不存储、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力。
            请尊重版权，所有内容的合法性由对应数据源负责。
          </Typography.Paragraph>
        </Flex>
      </Flex>
      <SiteFooter />
    </Layout>
  );
}
