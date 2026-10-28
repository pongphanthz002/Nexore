'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '@/config/storage.keys';
import { THEME_COLORS } from '@/config/theme';

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle('dark', isDark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDark ? THEME_COLORS.dark : THEME_COLORS.light);
}

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (isDark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  // The init script already set the class; read it back after hydration.
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));

    // Keep other tabs / the installed PWA in step.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEYS.THEME) return;
      const next = e.newValue === 'dark';
      applyTheme(next);
      setIsDark(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: boolean) => {
    applyTheme(next);
    setIsDark(next);
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, next ? 'dark' : 'light');
    } catch {
      // Private mode / blocked storage: theme still applies for this visit.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(!document.documentElement.classList.contains('dark'));
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
