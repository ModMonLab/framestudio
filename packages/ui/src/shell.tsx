import type { ReactNode } from 'react';
import { FrameMark } from './icons.js';

/** 48 px application bar: brand, menus, breadcrumb and save state | centre tabs | status and actions (Design System §6). */
export function AppBar({ left, center, right, productName = 'Frame' }: { left?: ReactNode; center?: ReactNode; right?: ReactNode; productName?: string }) {
  return (
    <header className="fr-appbar">
      <div className="fr-appbar__brand">
        <span className="fr-mark" aria-hidden><FrameMark /></span>
        <span className="fr-appbar__name">{productName}</span>
      </div>
      {left}
      <div className="fr-appbar__center">{center}</div>
      {right}
    </header>
  );
}

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="fr-crumbs">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} style={{ display: 'contents' }}>
            {last ? (
              <span className="fr-crumbs__current" aria-current="page">{c.label}</span>
            ) : (
              <>
                <button type="button" className="fr-crumbs__item" onClick={c.onClick}>{c.label}</button>
                <span className="fr-faint" aria-hidden>/</span>
              </>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export interface RailItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export function Rail({ items, value, onChange, label = 'Panels' }: { items: RailItem[]; value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <nav aria-label={label} className="fr-rail">
      {items.map((it) => (
        <button key={it.id} type="button" className="fr-rail__btn" aria-pressed={it.id === value} aria-label={it.label} onClick={() => onChange(it.id)}>
          {it.icon}
          <span className="fr-rail__label" aria-hidden>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function VSep() {
  return <span className="fr-vsep" aria-hidden style={{ margin: '0 6px', height: 22 }} />;
}
