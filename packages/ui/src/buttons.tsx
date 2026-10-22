import { forwardRef, useRef, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Loader2 } from 'lucide-react';
import { Tooltip } from './overlay.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
  loading?: boolean;
  /** Shown as a tooltip when disabled: every disabled control states its prerequisite (UI-06). */
  disabledReason?: string;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (v: T | null) => {
    for (const r of refs) {
      if (typeof r === 'function') r(v);
      else if (r) (r as { current: T | null }).current = v;
    }
  };
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', icon, loading, disabledReason, className, children, disabled, ...rest }, ref) {
  const btn = (extra: Record<string, unknown> = {}, r?: Ref<HTMLButtonElement>) => (
    <button
      ref={mergeRefs(ref, r)}
      type="button"
      className={`fr-btn fr-btn--${variant} ${loading ? 'fr-btn--loading' : ''} ${className ?? ''}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
      {...extra}
    >
      {loading ? <Loader2 size={14} className="fr-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
  if (disabled && disabledReason) {
    // Disabled buttons do not receive pointer events; the wrapper carries the explanation.
    return (
      <Tooltip label={disabledReason}>
        {(p) => (
          <span ref={p.ref as Ref<HTMLSpanElement>} onPointerEnter={p.onPointerEnter} onPointerLeave={p.onPointerLeave} style={{ display: 'inline-flex' }} tabIndex={0} onFocus={p.onFocus} onBlur={p.onBlur} aria-describedby={p['aria-describedby']} aria-label={`${typeof children === 'string' ? children : ''} — ${disabledReason}`}>
            {btn({ 'aria-disabled': true })}
          </span>
        )}
      </Tooltip>
    );
  }
  return btn();
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip (required: Design System §2.6). */
  label: string;
  shortcut?: string;
  icon: ReactNode;
  size?: 'md' | 'sm' | 'xs';
  pressed?: boolean;
  disabledReason?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, shortcut, icon, size = 'md', pressed, className, disabled, disabledReason, ...rest }, ref) {
  return (
    <Tooltip label={disabled && disabledReason ? `${label} — ${disabledReason}` : label} shortcut={shortcut}>
      {(p) => (
        <span ref={p.ref as Ref<HTMLSpanElement>} style={{ display: 'inline-flex' }} onPointerEnter={p.onPointerEnter} onPointerLeave={p.onPointerLeave}>
          <button
            ref={ref}
            type="button"
            aria-label={label}
            aria-keyshortcuts={shortcut}
            aria-pressed={pressed}
            aria-describedby={p['aria-describedby']}
            onFocus={p.onFocus}
            onBlur={p.onBlur}
            className={`fr-btn fr-btn--ghost fr-icon-btn ${size === 'sm' ? 'fr-icon-btn--sm' : size === 'xs' ? 'fr-icon-btn--xs' : ''} ${className ?? ''}`}
            disabled={disabled}
            {...rest}
          >
            {icon}
          </button>
        </span>
      )}
    </Tooltip>
  );
});

/** Small helper for components that need a stable ref to an anchor button. */
export function useAnchor<T extends HTMLElement = HTMLButtonElement>() {
  return useRef<T>(null);
}
