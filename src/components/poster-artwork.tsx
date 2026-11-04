'use client';

import { VideoCameraOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { SmartImage } from './smart-image';
import styles from './cinema.module.css';

export function PosterArtwork({ item, eager = false }: {
  item: { title: string; cover: string };
  eager?: boolean;
}) {
  const mode = useAppStore((s) => s.imageProxyMode);
  const customProxy = useAppStore((s) => s.customImageProxy);
  return <PosterImage key={`${item.cover}:${mode}:${customProxy}`} item={item} mode={mode} customProxy={customProxy} eager={eager} />;
}

function PosterImage({ item, mode, customProxy, eager }: {
  item: { title: string; cover: string };
  mode: 'direct' | 'proxy' | 'custom';
  customProxy: string;
  eager: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!item.cover || failed) {
    return <span className={styles.posterFallback}><VideoCameraOutlined aria-hidden /><span>{item.title}</span></span>;
  }
  return <SmartImage url={item.cover} mode={mode} customProxy={customProxy} alt={item.title}
    loading={eager ? 'eager' : 'lazy'} style={{ width: '100%', height: '100%' }} onExhausted={() => setFailed(true)} />;
}
