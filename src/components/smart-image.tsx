'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { Image } from 'antd';
import { buildImageCandidates } from '@/lib/utils';

interface SmartImageProps {
  /** 原始图片地址（未经代理加工，降级链由本组件按加载方式生成） */
  url?: string;
  mode: 'direct' | 'proxy' | 'custom';
  customProxy?: string;
  alt: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  /** 候选链耗尽后回调，调用方切换占位图等兜底 UI */
  onExhausted?: () => void;
}

/**
 * 带降级链的封面图组件：direct 模式按 buildImageCandidates 的顺序加载，
 * onError 逐级回退（豆瓣图：直连 → 公共镜像 → 内置代理）；
 * 全部失败后触发 onExhausted 并停止渲染，由调用方展示占位图。
 * referrerPolicy=no-referrer：不向图床暴露来源页，规避部分站点的 Referer 校验。
 */
export function SmartImage({
  url,
  mode,
  customProxy = '',
  alt,
  style,
  loading = 'lazy',
  onExhausted,
}: SmartImageProps) {
  const candidates = buildImageCandidates(url, mode, customProxy);
  const [idx, setIdx] = useState(0);

  // 地址或加载方式变化时重置降级进度
  useEffect(() => setIdx(0), [url, mode, customProxy]);
  useEffect(() => {
    if (idx >= candidates.length) onExhausted?.();
    // 候选数组随 url/mode 变化，length 是充分的稳定信号
  }, [idx, candidates.length, onExhausted]);

  const src = candidates[idx];
  if (!src) return null;
  return (
    <Image
      preview={false}
      src={src}
      alt={alt}
      styles={{
        root: { display: 'block', ...style },
        image: {
          width: '100%',
          height: '100%',
          objectFit: style?.objectFit ?? 'cover',
        },
      }}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
