export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'libretv-theme';

/** Invalid or inaccessible preferences use the same default as the first-paint script. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage may be unavailable in private browsing; the application still starts.
  }
  return 'dark';
}

/** Runs in the head, before the startup screen or any Ant Design content can paint. */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){var t='dark';try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark'||s==='system')t=s;}catch(e){}var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);})()`;
