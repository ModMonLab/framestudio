import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { tokensCss } from '@frame/design-tokens';

export type ThemeChoice = 'dark' | 'light' | 'system';

const ThemeContext = createContext<{ theme: ThemeChoice; resolved: 'dark' | 'light'; setTheme: (t: ThemeChoice) => void }>({ theme: 'dark', resolved: 'dark', setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

let injected = false;
/** Injects token CSS variables once (Design System §11: one source of truth). */
export function injectTokens(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const style = document.createElement('style');
  style.dataset.frameTokens = '';
  style.textContent = tokensCss();
  document.head.prepend(style);
}

/** Applies the theme to the root element; the choice persists per user (Design System §3). */
export function ThemeProvider({ children, initial, storageKey = 'frame.theme' }: { children: ReactNode; initial?: ThemeChoice; storageKey?: string }) {
  injectTokens();
  const [theme, setThemeState] = useState<ThemeChoice>(() => {
    if (initial) return initial;
    try {
      return (localStorage.getItem(storageKey) as ThemeChoice | null) ?? 'dark';
    } catch {
      return 'dark';
    }
  });
  const [systemDark, setSystemDark] = useState(() => typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia('(prefers-color-scheme: dark)');
    const h = () => setSystemDark(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);
  const setTheme = (t: ThemeChoice) => {
    setThemeState(t);
    try {
      localStorage.setItem(storageKey, t);
    } catch {
      /* storage unavailable */
    }
  };
  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}
