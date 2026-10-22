import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Pipette, Plus, Search, X } from 'lucide-react';
import { t } from './i18n.js';
import { Popover } from './overlay.js';

/** Edit phases: drags and scrubs send 'preview' updates and one 'commit', so they are one undo step (Design System §8). */
export type EditPhase = 'preview' | 'commit';

/* ------------------------------------------------------------------ text field */

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'prefix'> {
  value: string;
  onChange: (v: string) => void;
  icon?: ReactNode;
  clearable?: boolean;
  invalid?: boolean;
  label?: string;
}

export function TextField({ value, onChange, icon, clearable, invalid, className, label, disabled, ...rest }: TextFieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className={`fr-field ${invalid ? 'fr-field--invalid' : ''} ${disabled ? 'fr-field--disabled' : ''} ${className ?? ''}`}>
      {icon && <span className="fr-field__icon" aria-hidden>{icon}</span>}
      <input ref={ref} type="text" value={value} aria-label={label ?? rest.placeholder} aria-invalid={invalid || undefined} disabled={disabled} onChange={(e) => onChange(e.target.value)} {...rest} />
      {clearable && value && !disabled && (
        <button type="button" className="fr-field__clear" aria-label={t('common.clear')} onClick={() => { onChange(''); ref.current?.focus(); }}>
          <X size={13} aria-hidden />
        </button>
      )}
    </label>
  );
}

export function SearchField(props: Omit<TextFieldProps, 'icon' | 'clearable'>) {
  return (
    <TextField
      icon={<Search size={14} />}
      clearable
      {...props}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && props.value) {
          e.stopPropagation();
          props.onChange('');
        }
        props.onKeyDown?.(e);
      }}
    />
  );
}

export function TextArea({ value, onChange, label, rows = 3, placeholder, disabled }: { value: string; onChange: (v: string) => void; label: string; rows?: number; placeholder?: string; disabled?: boolean }) {
  return (
    <label className={`fr-field fr-textarea ${disabled ? 'fr-field--disabled' : ''}`}>
      <textarea value={value} rows={rows} aria-label={label} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/* ------------------------------------------------------------------ number field */

/** Evaluates "+10", "*2", "-3", "/2" relative to the current value, or a plain arithmetic expression. */
export function evalNumberExpression(input: string, current: number): number | undefined {
  const s = input.trim().replace(/,/g, '.').replace(/[a-z°%×\s]+$/i, '');
  if (!s) return undefined;
  // Leading +, * or / applies the operation to the current value ("+10", "*2", "/4"). A leading minus is a negative number.
  const rel = s.match(/^([+*/])\s*(\d*\.?\d+)$/);
  if (rel) {
    const n = Number(rel[2]);
    if (rel[1] === '+') return current + n;
    if (rel[1] === '*') return current * n;
    return n === 0 ? undefined : current / n;
  }
  if (!/^[-+*/().\d\s]+$/.test(s)) return undefined;
  // Tiny recursive-descent evaluator (no eval).
  let i = 0;
  const src = s.replace(/\s+/g, '');
  const num = (): number => {
    if (src[i] === '(') { i++; const v = expr(); i++; return v; }
    if (src[i] === '-') { i++; return -num(); }
    if (src[i] === '+') { i++; return num(); }
    const m = src.slice(i).match(/^\d*\.?\d+/);
    if (!m) throw new Error('bad');
    i += m[0].length;
    return Number(m[0]);
  };
  const term = (): number => {
    let v = num();
    while (src[i] === '*' || src[i] === '/') { const op = src[i++]; const r = num(); v = op === '*' ? v * r : v / r; }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (src[i] === '+' || src[i] === '-') { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  try {
    const v = expr();
    return i === src.length && Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export interface NumberFieldProps {
  value: number;
  onChange: (v: number, phase: EditPhase) => void;
  prefix?: string;
  label: string;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  unit?: string;
  disabled?: boolean;
}

/** Monospace value with an inside prefix; arrow nudge (Shift ×10), label scrubbing and expressions (Design System §6). */
export function NumberField({ value, onChange, prefix, label, step = 1, min = -Infinity, max = Infinity, precision = 2, unit, disabled }: NumberFieldProps) {
  const fmt = (v: number) => `${Number(v.toFixed(precision))}${unit ?? ''}`;
  const [text, setText] = useState(fmt(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const commitText = () => {
    const v = evalNumberExpression(text, value);
    setEditing(false);
    if (v === undefined) setText(fmt(value));
    else if (clamp(v) !== value) onChange(clamp(v), 'commit');
    else setText(fmt(value));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
      const v = clamp(value + d);
      setText(fmt(v));
      onChange(v, 'commit');
    } else if (e.key === 'Enter') {
      commitText();
      (e.target as HTMLInputElement).select();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setText(fmt(value));
    }
  };
  const scrub = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    e.preventDefault();
    const startX = e.clientX;
    const start = value;
    let last = start;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const v = clamp(start + Math.round((ev.clientX - startX) / 2) * step * (ev.shiftKey ? 10 : 1));
      if (v !== last) {
        last = v;
        onChange(v, 'preview');
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      if (last !== start) onChange(last, 'commit');
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <label className={`fr-field fr-field--number ${disabled ? 'fr-field--disabled' : ''}`}>
      {prefix && <span className="fr-field__prefix" onPointerDown={scrub} aria-hidden title={label}>{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={Number.isFinite(min) ? min : undefined}
        aria-valuemax={Number.isFinite(max) ? max : undefined}
        value={text}
        disabled={disabled}
        onFocus={(e) => { setEditing(true); e.target.select(); }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={onKey}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ select */

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  meta?: string;
  disabled?: boolean;
  disabledReason?: string;
}

export interface SelectProps<T extends string> {
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  disabledReason?: string;
}

/** Field-styled button opening a menu, with search when there are more than 10 options. */
export function Select<T extends string>({ value, options, onChange, label, placeholder, disabled, disabledReason }: SelectProps<T>) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const current = options.find((o) => o.value === value);
  const filtered = useMemo(() => (q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()) || o.meta?.toLowerCase().includes(q.toLowerCase())) : options), [q, options]);
  const close = () => { setOpen(false); setQ(''); ref.current?.focus(); };
  const pick = (o: SelectOption<T>) => { if (!o.disabled) { onChange(o.value); close(); } };
  useEffect(() => {
    if (open) setActive(Math.max(0, filtered.findIndex((o) => o.value === value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtered[active]; if (o) pick(o); }
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`fr-field fr-select ${disabled ? 'fr-field--disabled' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? placeholder ?? ''}`}
        title={disabled ? disabledReason : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}
      >
        <span className={`fr-select__value ${current ? '' : 'fr-faint'}`}>{current?.label ?? placeholder ?? ''}</span>
        <ChevronDown size={14} className="fr-faint" aria-hidden />
      </button>
      <Popover anchor={ref} open={open} onClose={close} role="presentation" width={Math.max(200, ref.current?.offsetWidth ?? 0)}>
        <div onKeyDown={onKey}>
          {options.length > 10 && (
            <div style={{ padding: 4 }}>
              <SearchField value={q} onChange={(v) => { setQ(v); setActive(0); }} placeholder={t('common.search')} autoFocus />
            </div>
          )}
          <div role="listbox" id={listId} aria-label={label} tabIndex={options.length > 10 ? -1 : 0} ref={(el) => { if (el && options.length <= 10) el.focus(); }} aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}>
            {filtered.map((o, i) => (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                title={o.disabled ? o.disabledReason : undefined}
                className="fr-menu-item"
                data-active={i === active}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o)}
                style={o.disabled ? { color: 'var(--color-text3)', cursor: 'not-allowed' } : undefined}
              >
                <span className="fr-check">{o.value === value ? <Check size={14} aria-hidden /> : null}</span>
                <span>{o.label}</span>
                {(o.meta || o.disabledReason) && <span className="fr-shortcut">{o.disabled ? o.disabledReason : o.meta}</span>}
              </div>
            ))}
            {filtered.length === 0 && <p className="fr-empty-note">{q ? t('common.noResults', { query: q }) : t('common.noOptions')}</p>}
          </div>
        </div>
      </Popover>
    </>
  );
}

/* ------------------------------------------------------------------ slider row */

export interface SliderRowProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  onChange: (v: number, phase: EditPhase) => void;
  format?: (v: number) => string;
  parse?: (s: string) => number | undefined;
  endLabels?: [string, string];
  inline?: boolean;
  disabled?: boolean;
}

/** Label and editable numeric badge above a range; double-click resets to default (Design System §6). */
export function SliderRow({ label, value, min = 0, max = 100, step = 1, defaultValue, onChange, format = (v) => String(Math.round(v)), parse, endLabels, inline, disabled }: SliderRowProps) {
  const [badge, setBadge] = useState<string | null>(null);
  const dragging = useRef(false);
  const commitBadge = () => {
    if (badge === null) return;
    const v = parse ? parse(badge) : evalNumberExpression(badge, value);
    setBadge(null);
    if (v !== undefined && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)), 'commit');
  };
  const id = useId();
  const input = (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={format(value)}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue, 'commit')}
      onPointerDown={() => { dragging.current = true; }}
      onPointerUp={(e) => { dragging.current = false; onChange(Number((e.target as HTMLInputElement).value), 'commit'); }}
      onKeyUp={(e) => { if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.startsWith('Page')) onChange(Number((e.target as HTMLInputElement).value), 'commit'); }}
      onChange={(e) => onChange(Number(e.target.value), 'preview')}
    />
  );
  const badgeEl = (
    <input
      className="fr-slider__badge"
      aria-label={`${label} value`}
      value={badge ?? format(value)}
      disabled={disabled}
      onFocus={(e) => { setBadge(format(value)); e.target.select(); }}
      onChange={(e) => setBadge(e.target.value)}
      onBlur={commitBadge}
      onKeyDown={(e) => { if (e.key === 'Enter') commitBadge(); if (e.key === 'Escape') setBadge(null); }}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue, 'commit')}
    />
  );
  if (inline) {
    return (
      <div className="fr-slider fr-slider--inline">
        <label className="fr-slider__label" htmlFor={id}>{label}</label>
        {input}
        {badgeEl}
      </div>
    );
  }
  return (
    <div className="fr-slider">
      <div className="fr-slider__head">
        <label className="fr-slider__label" htmlFor={id}>{label}</label>
        {badgeEl}
      </div>
      {input}
      {endLabels && (
        <div className="fr-slider__ends" aria-hidden>
          <span>{endLabels[0]}</span>
          <span>{endLabels[1]}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ toggles */

export function ToggleRow({ label, description, checked, onChange, disabled, disabledReason }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; disabledReason?: string }) {
  return (
    <label className={`fr-toggle ${disabled ? 'fr-toggle--disabled' : ''}`} title={disabled ? disabledReason : undefined}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {(description || (disabled && disabledReason)) && <span className="fr-toggle__desc">{disabled && disabledReason ? disabledReason : description}</span>}
      </span>
    </label>
  );
}

/** Switch style only for on/off settings that apply immediately. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="fr-switch" disabled={disabled} onClick={() => onChange(!checked)} />;
}

/* ------------------------------------------------------------------ swatches */

export interface Swatch {
  value: string;
  label: string;
}

/** 8-column swatch grid with a final custom swatch opening a colour picker (palette, eyedropper, hex). */
export function SwatchGrid({ value, swatches, onChange, label }: { value: string; swatches: Swatch[]; onChange: (v: string, phase: EditPhase) => void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const isCustom = !swatches.some((s) => s.value.toLowerCase() === value.toLowerCase());
  const eyedropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  return (
    <div role="radiogroup" aria-label={label} className="fr-swatches">
      {swatches.map((s) => (
        <button key={s.value} type="button" role="radio" aria-checked={s.value.toLowerCase() === value.toLowerCase()} aria-label={`${s.label} ${s.value}`} title={`${s.label} · ${s.value}`} className="fr-swatch" style={{ background: s.value }} onClick={() => onChange(s.value, 'commit')} />
      ))}
      <button ref={ref} type="button" role="radio" aria-checked={isCustom} aria-label={t('common.customColour')} className={`fr-swatch ${isCustom ? '' : 'fr-swatch--custom'}`} style={isCustom ? { background: value } : undefined} onClick={() => setOpen(true)}>
        {!isCustom && <Plus size={14} aria-hidden />}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label={t('common.customColour')} placement="bottom-end">
        <div className="fr-colorpicker">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} aria-label={t('common.customColour')} onChange={(e) => onChange(e.target.value, 'preview')} onBlur={(e) => onChange(e.target.value, 'commit')} />
          <div className="fr-label-row">
            <span className="fr-label" style={{ width: 32 }}>{t('common.hex')}</span>
            <TextField value={hex} label={t('common.hex')} onChange={setHex} onBlur={() => { if (/^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toUpperCase(), 'commit'); else setHex(value); }} onKeyDown={(e) => { if (e.key === 'Enter' && /^#[0-9a-f]{6}$/i.test(hex)) onChange(hex.toUpperCase(), 'commit'); }} className="fr-mono" />
            {eyedropper && (
              <button type="button" className="fr-btn fr-btn--secondary fr-icon-btn" aria-label={t('common.eyedropper')} title={t('common.eyedropper')} onClick={async () => {
                try {
                  const r = await new (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper().open();
                  onChange(r.sRGBHex.toUpperCase(), 'commit');
                } catch { /* cancelled */ }
              }}>
                <Pipette size={14} aria-hidden />
              </button>
            )}
          </div>
          <div className="fr-swatches">
            {swatches.slice(0, 16).map((s) => (
              <button key={s.value} type="button" aria-label={s.label} className="fr-swatch" style={{ background: s.value }} onClick={() => onChange(s.value, 'commit')} />
            ))}
          </div>
        </div>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ chips, badges, segmented, tabs */

export function Chip({ selected, onClick, children, disabled, title }: { selected?: boolean; onClick?: () => void; children: ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="fr-chip" aria-pressed={selected ?? false} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; disabled?: boolean; reason?: string }[]; value: T | undefined; onChange: (v: T) => void; label: string }) {
  return (
    <div className="fr-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={o.value} selected={o.value === value} onClick={() => onChange(o.value)} disabled={o.disabled} title={o.disabled ? o.reason : undefined}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

/** Status always has text; the dot is supplementary (D7, never colour alone). */
export function StatusBadge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className="fr-badge" title={title} role="status">
      <span className={`fr-dot fr-dot--${tone}`} aria-hidden />
      {children}
    </span>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; disabled?: boolean; reason?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = options.length;
    let i = idx;
    for (let k = 0; k < n; k++) {
      i = (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
      if (!options[i]!.disabled) break;
    }
    onChange(options[i]!.value);
    refs.current[i]?.focus();
  };
  return (
    <div className="fr-seg" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button key={o.value} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1} className="fr-seg__opt" disabled={o.disabled} title={o.disabled ? o.reason : undefined} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label, className, style }: { tabs: { value: T; label: string; shortcut?: string }[]; value: T; onChange: (v: T) => void; label: string; className?: string; style?: React.CSSProperties }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((x) => x.value === value);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') n = 0;
    if (e.key === 'End') n = tabs.length - 1;
    if (n >= 0) {
      e.preventDefault();
      onChange(tabs[n]!.value);
      refs.current[n]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} className={`fr-tabs ${className ?? ''}`} style={style} onKeyDown={onKey}>
      {tabs.map((tb, i) => (
        <button key={tb.value} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" aria-selected={tb.value === value} tabIndex={tb.value === value ? 0 : -1} aria-keyshortcuts={tb.shortcut} className="fr-tab" onClick={() => onChange(tb.value)} title={tb.shortcut ? `${tb.label} (${tb.shortcut})` : undefined}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}
