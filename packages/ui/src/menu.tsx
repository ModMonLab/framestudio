import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Popover, type Placement } from './overlay.js';

export type MenuEntry =
  | {
      kind?: 'item';
      id: string;
      label: string;
      shortcut?: string;
      icon?: ReactNode;
      checked?: boolean;
      disabled?: boolean;
      /** Explains why the item is unavailable (UI-06). */
      disabledReason?: string;
      onSelect?: () => void;
      submenu?: MenuEntry[];
    }
  | { kind: 'separator'; id: string }
  | { kind: 'label'; id: string; label: string };

export interface MenuListProps {
  items: MenuEntry[];
  onClose: () => void;
  label?: string;
  autoFocus?: boolean;
}

/** Keyboard-navigable menu list (↑/↓/Home/End, Enter, → opens submenus, type-ahead). */
export function MenuList({ items, onClose, label, autoFocus = true }: MenuListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<string | null>(null);
  const actionable = items.map((it, i) => ((it.kind ?? 'item') === 'item' && !(it as { disabled?: boolean }).disabled ? i : -1)).filter((i) => i >= 0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (autoFocus && actionable.length) {
      setActive(actionable[0]!);
      buttons.current[actionable[0]!]?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const move = (dir: 1 | -1 | 'home' | 'end') => {
    if (!actionable.length) return;
    let idx = actionable.indexOf(active);
    if (dir === 'home') idx = 0;
    else if (dir === 'end') idx = actionable.length - 1;
    else idx = (idx + dir + actionable.length) % actionable.length;
    const next = actionable[idx]!;
    setActive(next);
    buttons.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); move('home'); }
    else if (e.key === 'End') { e.preventDefault(); move('end'); }
    else if (e.key === 'ArrowRight') {
      const it = items[active];
      if (it && (it.kind ?? 'item') === 'item' && (it as { submenu?: MenuEntry[] }).submenu) { e.preventDefault(); setSub(it.id); }
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const ch = e.key.toLowerCase();
      const start = actionable.indexOf(active);
      for (let k = 1; k <= actionable.length; k++) {
        const i = actionable[(start + k) % actionable.length]!;
        const it = items[i] as { label?: string };
        if (it.label?.toLowerCase().startsWith(ch)) { setActive(i); buttons.current[i]?.focus(); break; }
      }
    }
  };
  return (
    <div ref={ref} role="menu" aria-label={label} onKeyDown={onKey}>
      {items.map((it, i) => {
        if (it.kind === 'separator') return <div key={it.id} role="separator" className="fr-menu-sep" />;
        if (it.kind === 'label') return <div key={it.id} className="fr-menu-label">{it.label}</div>;
        const subRef = { current: buttons.current[i] ?? null };
        return (
          <div key={it.id}>
            <button
              ref={(el) => { buttons.current[i] = el; }}
              type="button"
              role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
              aria-checked={it.checked}
              aria-haspopup={it.submenu ? 'menu' : undefined}
              aria-expanded={it.submenu ? sub === it.id : undefined}
              aria-disabled={it.disabled || undefined}
              title={it.disabled ? it.disabledReason : undefined}
              disabled={it.disabled}
              tabIndex={active === i ? 0 : -1}
              data-active={active === i}
              className="fr-menu-item"
              onPointerEnter={() => { setActive(i); if (it.submenu) setSub(it.id); else setSub(null); }}
              onClick={() => {
                if (it.submenu) { setSub(it.id); return; }
                it.onSelect?.();
                onClose();
              }}
            >
              {it.checked !== undefined && <span className="fr-check">{it.checked ? <Check size={14} aria-hidden /> : null}</span>}
              {it.icon && <span className="fr-row__icon" aria-hidden>{it.icon}</span>}
              <span>{it.label}</span>
              {it.shortcut && <span className="fr-shortcut fr-mono">{it.shortcut}</span>}
              {it.disabled && it.disabledReason && <span className="fr-sr">{it.disabledReason}</span>}
              {it.submenu && <ChevronRight size={14} style={{ marginLeft: 'auto' }} aria-hidden />}
            </button>
            {it.submenu && sub === it.id && (
              <Popover anchor={subRef} open onClose={() => setSub(null)} placement="right-start" role="presentation">
                <MenuList items={it.submenu} onClose={onClose} label={it.label} />
              </Popover>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface MenuButtonProps {
  label: string;
  items: MenuEntry[];
  trigger: (props: { ref: React.RefObject<HTMLButtonElement | null>; open: boolean; toggle: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean }) => ReactNode;
  placement?: Placement;
}

/** A trigger that opens a menu popover. */
export function MenuButton({ label, items, trigger, placement }: MenuButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    ref.current?.focus();
  }, []);
  return (
    <>
      {trigger({ ref, open, toggle: () => setOpen((o) => !o), 'aria-haspopup': 'menu', 'aria-expanded': open })}
      <Popover anchor={ref} open={open} onClose={close} placement={placement} role="presentation">
        <MenuList items={items} onClose={close} label={label} />
      </Popover>
    </>
  );
}

export interface MenuBarMenu {
  id: string;
  label: string;
  items: MenuEntry[];
}

/** Text menus (File, Edit, View…): open on click, then follow hover while one is open (Design System §6). */
export function MenuBar({ menus, label = 'Menu' }: { menus: MenuBarMenu[]; label?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const close = useCallback(() => setOpen(null), []);
  return (
    <nav aria-label={label} className="fr-menubar" role="menubar">
      {menus.map((m, i) => {
        const anchor = { current: refs.current[m.id] ?? null };
        return (
          <span key={m.id}>
            <button
              ref={(el) => { refs.current[m.id] = el; }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              className="fr-menu-trigger"
              onClick={() => setOpen(open === m.id ? null : m.id)}
              onPointerEnter={() => { if (open && open !== m.id) setOpen(m.id); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') refs.current[menus[(i + 1) % menus.length]!.id]?.focus();
                if (e.key === 'ArrowLeft') refs.current[menus[(i - 1 + menus.length) % menus.length]!.id]?.focus();
                if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(m.id); }
              }}
            >
              {m.label}
            </button>
            <Popover anchor={anchor} open={open === m.id} onClose={close} role="presentation">
              <MenuList items={m.items} onClose={close} label={m.label} />
            </Popover>
          </span>
        );
      })}
    </nav>
  );
}
