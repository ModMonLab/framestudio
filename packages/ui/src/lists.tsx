import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface RadioItem<T extends string> {
  value: T;
  label: string;
  meta?: ReactNode;
  disabled?: boolean;
  reason?: string;
}

/** Bordered single-choice list, 32 px rows (Design System §5.3). */
export function RadioList<T extends string>({ items, value, onChange, label }: { items: RadioItem<T>[]; value: T | undefined; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    let j = i;
    for (let k = 0; k < items.length; k++) {
      j = (j + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      if (!items[j]!.disabled) break;
    }
    onChange(items[j]!.value);
    refs.current[j]?.focus();
  };
  const selectedIdx = Math.max(0, items.findIndex((x) => x.value === value));
  return (
    <div className="fr-radiolist" role="radiogroup" aria-label={label}>
      {items.map((it, i) => (
        <button
          key={it.value}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={it.value === value}
          tabIndex={i === selectedIdx ? 0 : -1}
          disabled={it.disabled}
          title={it.disabled ? it.reason : undefined}
          className="fr-radiolist__row"
          onClick={() => onChange(it.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          <span className="fr-radio" aria-hidden />
          <span className="fr-radiolist__label">{it.label}</span>
          {(it.meta || (it.disabled && it.reason)) && <span className="fr-row__meta">{it.disabled && it.reason ? it.reason : it.meta}</span>}
        </button>
      ))}
    </div>
  );
}

export interface AssetRowProps {
  name: string;
  meta?: string;
  thumbnail?: ReactNode;
  selected?: boolean;
  disabledReason?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}

/** Two-line asset row with a 30 px real thumbnail (Design System §5.3). Incompatible items stay visible with the reason (P11). */
export function AssetRow({ name, meta, thumbnail, selected, disabledReason, onClick, onDoubleClick, draggable, onDragStart }: AssetRowProps) {
  return (
    <button
      type="button"
      className="fr-asset-row"
      aria-pressed={selected ?? false}
      aria-disabled={disabledReason ? true : undefined}
      title={disabledReason}
      onClick={disabledReason ? undefined : onClick}
      onDoubleClick={disabledReason ? undefined : onDoubleClick}
      draggable={draggable && !disabledReason}
      onDragStart={onDragStart}
    >
      <span className="fr-thumb" aria-hidden>{thumbnail}</span>
      <span className="fr-asset-row__text">
        <span className="fr-asset-row__name">{name}</span>
        {(meta || disabledReason) && <span className="fr-asset-row__meta">{disabledReason ?? meta}</span>}
      </span>
    </button>
  );
}

export interface Tile<T extends string> {
  value: T;
  label: string;
  preview: ReactNode;
  disabled?: boolean;
  reason?: string;
}

/** Visual choice grid: 3 columns (2 on narrow), real rendered previews, 2 px accent when selected. */
export function TileGrid<T extends string>({ tiles, value, onChange, label, columns = 3 }: { tiles: Tile<T>[]; value: T | undefined; onChange: (v: T) => void; label: string; columns?: 2 | 3 }) {
  return (
    <div className={`fr-tiles ${columns === 2 ? 'fr-tiles--2' : ''}`} role="radiogroup" aria-label={label}>
      {tiles.map((tl) => (
        <button key={tl.value} type="button" role="radio" aria-checked={tl.value === value} className="fr-tile" disabled={tl.disabled} title={tl.disabled ? tl.reason : tl.label} onClick={() => onChange(tl.value)}>
          <span className="fr-tile__preview" aria-hidden>{tl.preview}</span>
          <span className="fr-tile__label">{tl.label}</span>
        </button>
      ))}
    </div>
  );
}
