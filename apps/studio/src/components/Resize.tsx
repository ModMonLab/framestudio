/** Panel resizing by dragging the inner edge (Design System §4.1); sizes persist per user. Keyboard: ←/→ or ↑/↓. */
import { useCallback, useState } from 'react';

export function usePanelSize(key: string, initial: number, min: number, max: number): [number, (v: number) => void] {
  const [size, setSize] = useState(() => {
    try {
      const v = Number(localStorage.getItem(`frame.panel.${key}`));
      return Number.isFinite(v) && v >= min && v <= max ? v : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: number) => {
      const c = Math.round(Math.max(min, Math.min(max, v)));
      setSize(c);
      try {
        localStorage.setItem(`frame.panel.${key}`, String(c));
      } catch {
        /* storage unavailable: size lasts for this session */
      }
    },
    [key, min, max],
  );
  return [size, set];
}

/** A separator handle. `dir` is the direction in which dragging grows the panel; double-click restores the default. */
export function ResizeHandle({ label, value, min, max, defaultValue, onChange, dir, orientation = 'vertical' }: { label: string; value: number; min: number; max: number; defaultValue: number; onChange: (v: number) => void; dir: 1 | -1; orientation?: 'vertical' | 'horizontal' }) {
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const start = orientation === 'vertical' ? e.clientX : e.clientY;
    const v0 = value;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onChange(v0 + dir * ((orientation === 'vertical' ? ev.clientX : ev.clientY) - start));
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const grow = orientation === 'vertical' ? (e.key === 'ArrowRight' ? dir : e.key === 'ArrowLeft' ? -dir : 0) : e.key === 'ArrowDown' ? dir : e.key === 'ArrowUp' ? -dir : 0;
    if (grow) {
      e.preventDefault();
      onChange(value + grow * step);
    }
  };
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`st-resize st-resize--${orientation}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(defaultValue)}
    />
  );
}
