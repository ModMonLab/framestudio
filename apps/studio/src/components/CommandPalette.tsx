/**
 * Command palette (FR-ONB-03, Design System §5.4): Ctrl/⌘ K searches commands, assets, layers, scenes, settings and
 * help, and shows shortcuts. Screens register sources; `type:` narrows to one group (e.g. `type:scene cafe`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, t as tt } from '@frame/ui';
import { HELP_TOPICS } from '../help/topics.js';
import { matches } from '../lib/prefs.js';

export type PaletteGroup = 'Commands' | 'Scenes' | 'Layers' | 'Assets' | 'Settings' | 'Help';
export interface PaletteItem {
  id: string;
  label: string;
  group: PaletteGroup;
  detail?: string;
  shortcut?: string;
  disabled?: string;
  run: () => void;
}
/** A source returns items for a query; async sources (the library) resolve later. */
export type PaletteSource = (q: string) => PaletteItem[] | Promise<PaletteItem[]>;

const sources = new Set<PaletteSource>();
const listeners = new Set<() => void>();

export function usePaletteSource(src: PaletteSource): void {
  const ref = useRef(src);
  ref.current = src;
  useEffect(() => {
    const fn: PaletteSource = (q) => ref.current(q);
    sources.add(fn);
    return () => void sources.delete(fn);
  }, []);
}

export function openPalette(): void {
  for (const fn of listeners) fn();
}

const ORDER: PaletteGroup[] = ['Commands', 'Scenes', 'Layers', 'Assets', 'Settings', 'Help'];
const TYPE_ALIASES: Record<string, PaletteGroup> = { command: 'Commands', commands: 'Commands', scene: 'Scenes', scenes: 'Scenes', layer: 'Layers', layers: 'Layers', asset: 'Assets', assets: 'Assets', setting: 'Settings', settings: 'Settings', help: 'Help' };

const global: PaletteSource = () => [
  { id: 'settings', label: 'Open settings', group: 'Settings', detail: 'Theme, density, worker, shortcuts, storage', run: () => (location.hash = '#/settings') },
  { id: 'settings-theme', label: 'Theme and density', group: 'Settings', run: () => (location.hash = '#/settings') },
  { id: 'settings-worker', label: 'Voice worker connection', group: 'Settings', run: () => (location.hash = '#/settings') },
  { id: 'settings-keys', label: 'Keyboard shortcuts', group: 'Settings', run: () => (location.hash = '#/settings') },
  { id: 'home', label: 'Go to projects', group: 'Commands', run: () => (location.hash = '#/') },
  ...HELP_TOPICS.map((t) => ({ id: `help-${t.id}`, label: t.title, group: 'Help' as const, run: () => (location.hash = `#/help/${t.id}`) })),
];

export function PaletteHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    listeners.add(show);
    const onKey = (e: KeyboardEvent) => {
      if (matches(e, 'palette')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      listeners.delete(show);
      removeEventListener('keydown', onKey);
    };
  }, []);
  return open ? <Palette onClose={() => setOpen(false)} /> : null;
}

function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const { group, text } = useMemo(() => {
    const m = /(?:^|\s)type:(\w+)/i.exec(q);
    return { group: m ? TYPE_ALIASES[m[1]!.toLowerCase()] : undefined, text: q.replace(/(?:^|\s)type:\w+/i, '').trim().toLowerCase() };
  }, [q]);
  useEffect(() => {
    let live = true;
    const all = [global, ...sources];
    const sync: PaletteItem[] = [];
    const pending: Promise<PaletteItem[]>[] = [];
    for (const s of all) {
      const r = s(text);
      if (Array.isArray(r)) sync.push(...r);
      else pending.push(r.catch(() => []));
    }
    const filter = (list: PaletteItem[]) => list.filter((i) => (!group || i.group === group) && (!text || i.group === 'Assets' || `${i.label} ${i.detail ?? ''} ${i.group}`.toLowerCase().includes(text)));
    setItems(filter(sync));
    setActive(0);
    void Promise.all(pending).then((rs) => live && setItems((cur) => [...cur, ...filter(rs.flat())]));
    return () => {
      live = false;
    };
  }, [group, text]);
  const sorted = useMemo(() => [...items].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group)).slice(0, 60), [items]);
  const run = (i: PaletteItem | undefined) => {
    if (!i || i.disabled) return;
    onClose();
    i.run();
  };
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <Dialog title={tt('Command palette')} open onClose={onClose}>
      <div className="st-palette">
        <label className="fr-field">
          <span className="fr-field__icon" aria-hidden><Search size={14} /></span>
          <input autoFocus role="combobox" aria-expanded="true" aria-controls="st-palette-list" aria-activedescendant={sorted[active] ? `pal-${sorted[active]!.id}` : undefined} aria-label={tt('Search commands, scenes, layers, assets, settings and help')} placeholder={tt('Search… (type:scene, type:asset, …)')} value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(sorted.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter') { e.preventDefault(); run(sorted[active]); }
            }} />
        </label>
        <ul id="st-palette-list" role="listbox" aria-label={tt('Results')} ref={listRef} className="st-palette-list">
          {sorted.length === 0 && <li className="fr-faint st-palette-empty" role="presentation">{tt('No matches')}</li>}
          {sorted.map((i, n) => (
            <li key={`${i.group}-${i.id}`} id={`pal-${i.id}`} role="option" aria-selected={n === active} aria-disabled={!!i.disabled || undefined} title={i.disabled} className="st-palette-item" onMouseEnter={() => setActive(n)} onClick={() => run(i)}>
              <span className="st-palette-group">{i.group}</span>
              <span className="st-palette-label">{i.label}{i.detail && <span className="st-palette-detail"> · {i.detail}</span>}</span>
              {i.shortcut && <kbd className="fr-mono st-palette-detail">{i.shortcut}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
