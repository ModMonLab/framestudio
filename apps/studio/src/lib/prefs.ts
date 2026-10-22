/**
 * Per-browser preferences (FR-SET-01): UI density, rebindable shortcuts, onboarding state. Server-side settings
 * (worker, autosave, defaults) live in /api/settings; the theme lives in the ThemeProvider.
 */
import { useSyncExternalStore } from 'react';

export type Density = 'comfortable' | 'compact';

/** Actions whose shortcut can be rebound; the rest (Space, J/K/L, arrows, 1/2/3) are fixed transport keys. */
export const SHORTCUT_ACTIONS = {
  palette: { label: 'Command palette', default: 'Mod+K' },
  undo: { label: 'Undo', default: 'Mod+Z' },
  redo: { label: 'Redo', default: 'Mod+Shift+Z' },
  cut: { label: 'Cut', default: 'Mod+X' },
  copy: { label: 'Copy', default: 'Mod+C' },
  paste: { label: 'Paste', default: 'Mod+V' },
  duplicate: { label: 'Duplicate', default: 'Mod+D' },
  save: { label: 'Save now', default: 'Mod+S' },
  export: { label: 'Export', default: 'Mod+E' },
  settings: { label: 'Settings', default: 'Mod+,' },
} as const;
export type ShortcutAction = keyof typeof SHORTCUT_ACTIONS;

export interface Prefs {
  density: Density;
  shortcuts: Partial<Record<ShortcutAction, string>>;
  onboarded: boolean;
  tourDone: boolean;
}

const KEY = 'frame.prefs';
const DEFAULTS: Prefs = { density: 'comfortable', shortcuts: {}, onboarded: false, tourDone: false };
const listeners = new Set<() => void>();
let cache: Prefs | undefined;

export function readPrefs(): Prefs {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function setPrefs(patch: Partial<Prefs>): void {
  cache = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* preferences are a convenience; keep them for this session */
  }
  applyDensity(cache.density);
  for (const fn of listeners) fn();
}

export function usePrefs(): Prefs {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, readPrefs);
}

export function applyDensity(d: Density = readPrefs().density): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.density = d;
}

export function shortcutFor(a: ShortcutAction): string {
  return readPrefs().shortcuts[a] ?? SHORTCUT_ACTIONS[a].default;
}

/** "Mod+Shift+Z" from a key event (Mod is Ctrl, or ⌘ on macOS). */
export function comboOf(e: KeyboardEvent | React.KeyboardEvent): string {
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [(e.ctrlKey || e.metaKey) && 'Mod', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+');
}

export function matches(e: KeyboardEvent, a: ShortcutAction): boolean {
  return comboOf(e) === shortcutFor(a);
}

/** Shown in menus and tooltips: "Ctrl Shift Z" / "⌘ Shift Z". */
export function shortcutLabel(a: ShortcutAction): string {
  const mac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
  return shortcutFor(a).split('+').map((p) => (p === 'Mod' ? (mac ? '⌘' : 'Ctrl') : p)).join(' ');
}
