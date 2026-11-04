'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import type { DoubanItem } from '@/lib/types';
import { PosterArtwork } from './poster-artwork';
import styles from './cinema.module.css';

export function CinemaHero({ items = [], onPick }: {
  items?: DoubanItem[];
  onPick?: (title: string) => void;
}) {
  const featured = items.slice(0, 3);
  return (
    <section className={styles.hero} aria-label="遇见好故事">
      <div className={styles.heroCopy}>
        <span className={styles.heroEyebrow}><span /> MEET YOU · 遇见好故事</span>
        <h1>把时间留给<br />喜欢的故事。</h1>
        <p>暂别日常，在光影里与另一个世界相遇。</p>
        {featured[0] && onPick ? (
          <button type="button" className={styles.heroFeature} onClick={() => onPick(featured[0].title)}>
            <span>从这部开始</span>
            <strong>{featured[0].title}</strong>
            <ArrowRightOutlined aria-hidden />
          </button>
        ) : <span className={styles.heroFootnote}>一部电影，一段属于自己的时光。</span>}
      </div>
      <div className={styles.heroPosters}>
        {featured.length > 0 && onPick ? featured.map((item) => (
          <button key={item.id} type="button" className={styles.heroPoster}
            aria-label={`发现 ${item.title}`} onClick={() => onPick(item.title)}>
            <PosterArtwork item={item} eager />
          </button>
        )) : <div className={styles.emptyFrames} aria-hidden><span /><span /><span /></div>}
      </div>
      <span className={styles.heroEdition} aria-hidden>A LITTLE ESCAPE, JUST FOR YOU.</span>
    </section>
  );
}
