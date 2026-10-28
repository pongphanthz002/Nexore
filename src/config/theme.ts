import { STORAGE_KEYS } from './storage.keys';

/** Status-bar / browser chrome colour per theme (the soft-UI surface, --surface in globals.css). */
export const THEME_COLORS = { light: '#e8ebf0', dark: '#262a33' } as const;

/**
 * Runs in <head> before the first paint so a saved dark theme never flashes light.
 * The app's theme is its own setting: the phone's dark mode is ignored, so pages
 * written only for light mode stay readable. Keep in sync with applyTheme in
 * src/contexts/ThemeContext.tsx.
 */
export const themeInitScript = `(function(){try{var d=localStorage.getItem('${STORAGE_KEYS.THEME}')==='dark';document.documentElement.classList.toggle('dark',d);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',d?'${THEME_COLORS.dark}':'${THEME_COLORS.light}');}catch(_){}})();`;
