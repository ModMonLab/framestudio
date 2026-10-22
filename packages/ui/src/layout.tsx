import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Info, X, XCircle } from 'lucide-react';
import { t } from './i18n.js';
import { Portal } from './overlay.js';
import { IconButton } from './buttons.js';

/* ------------------------------------------------------------------ panel */

export function Panel({ title, actions, search, children, label, className, style }: { title?: ReactNode; actions?: ReactNode; search?: ReactNode; children: ReactNode; label?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <aside className={`fr-panel ${className ?? ''}`} aria-label={label ?? (typeof title === 'string' ? title : undefined)} style={style}>
      {(title || actions) && (
        <div className="fr-panel__head">
          <span className="fr-panel__title">{title}</span>
          {actions}
        </div>
      )}
      {search && <div className="fr-panel__search">{search}</div>}
      <div className="fr-panel__body">{children}</div>
    </aside>
  );
}

/* ------------------------------------------------------------------ collapsible section (Design System §5.2) */

export function Section({ title, summary, open, onToggle, children, id }: { title: string; summary?: ReactNode; open: boolean; onToggle: (open: boolean) => void; children: ReactNode; id?: string }) {
  const bodyId = useId();
  return (
    <div className="fr-section" data-section={id}>
      <button type="button" className="fr-section__head" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(!open)}>
        <ChevronRight size={14} className={`fr-chev ${open ? 'fr-chev--open' : ''}`} aria-hidden />
        <span className="fr-section__title">{title}</span>
        {summary !== undefined && summary !== '' && <span className="fr-section__summary">{summary}</span>}
      </button>
      {open && (
        <div className="fr-section__body" id={bodyId} role="region" aria-label={title}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Persisted open/closed state for a set of sections (user choices persist; Design System §5.2). */
export function useSectionState(storageKey: string, defaults: Record<string, boolean>) {
  const [state, setState] = useState<Record<string, boolean>>(() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
      return { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      return defaults;
    }
  });
  const set = useCallback(
    (key: string, open: boolean) => {
      setState((s) => {
        const n = { ...s, [key]: open };
        try {
          localStorage.setItem(storageKey, JSON.stringify(n));
        } catch {
          /* storage unavailable */
        }
        return n;
      });
    },
    [storageKey],
  );
  return [state, set] as const;
}

/* ------------------------------------------------------------------ toolbar, floating */

export function Toolbar({ label, children, className, style }: { label: string; children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div role="toolbar" aria-label={label} className={`fr-toolbar ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return <span className="fr-toolbar__sep" role="separator" aria-orientation="vertical" />;
}

export function FloatingControl({ children, label, style }: { children: ReactNode; label: string; style?: React.CSSProperties }) {
  return (
    <div className="fr-floating" role="group" aria-label={label} style={style}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ empty, skeleton, progress, job row */

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="fr-empty">
      {icon && <span className="fr-empty__icon" aria-hidden>{icon}</span>}
      {title && <div className="fr-empty__title">{title}</div>}
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 12, style }: { width?: number | string; height?: number | string; style?: React.CSSProperties }) {
  return <span className="fr-skeleton" style={{ display: 'block', width, height, ...style }} aria-hidden />;
}

export function Progress({ value, label, failed, indeterminate }: { value?: number; label: string; failed?: boolean; indeterminate?: boolean }) {
  const pct = Math.max(0, Math.min(1, value ?? 0)) * 100;
  return (
    <div
      className={`fr-progress ${failed ? 'fr-progress--failed' : ''} ${indeterminate ? 'fr-progress--indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
    >
      <div className="fr-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatDuration(s: number): string {
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return `${Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export interface JobRowProps {
  name: string;
  state: string;
  progress?: number;
  elapsedS?: number;
  remainingS?: number;
  failed?: boolean;
  onCancel?: () => void;
  action?: ReactNode;
}

/** Name, literal state text, 4 px progress bar, elapsed/remaining, cancel (Design System §6). */
export function JobRow({ name, state, progress, elapsedS, remainingS, failed, onCancel, action }: JobRowProps) {
  return (
    <div className="fr-job">
      <span className="fr-job__name">{name}</span>
      <span style={{ display: 'flex', gap: 4 }}>
        {action}
        {onCancel && <IconButton size="xs" label={t('job.cancel', { name })} icon={<X size={13} />} onClick={onCancel} />}
      </span>
      <span className="fr-job__state" aria-live="polite">{state}</span>
      <span />
      <div className="fr-job__progress">
        <Progress value={progress} label={name} failed={failed} indeterminate={progress === undefined && !failed} />
      </div>
      {(elapsedS !== undefined || remainingS !== undefined) && (
        <div className="fr-job__time">
          <span>{elapsedS !== undefined ? t('job.elapsed', { time: formatDuration(elapsedS) }) : ''}</span>
          <span>{remainingS !== undefined ? t('job.remaining', { time: formatDuration(remainingS) }) : ''}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

export function Dialog({ title, open, onClose, children, footer, wide }: { title: string; open: boolean; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const previous = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement;
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
    (focusables()[1] ?? focusables()[0])?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      (previous.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <Portal>
      <div className="fr-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`fr-dialog ${wide ? 'fr-dialog--wide' : ''}`}>
          <div className="fr-dialog__head">
            <h2 id={titleId} className="fr-dialog__title">{title}</h2>
            <IconButton label={t('common.close')} shortcut="Esc" icon={<X size={15} />} size="sm" onClick={onClose} />
          </div>
          <div className="fr-dialog__body">{children}</div>
          {footer && <div className="fr-dialog__foot">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ toasts */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastSpec {
  id?: string;
  tone: ToastTone;
  message: string;
  action?: { label: string; run: () => void };
  /** Errors that need action never auto-dismiss. */
  sticky?: boolean;
}

interface ToastEntry extends ToastSpec {
  id: string;
}

const ToastContext = createContext<{ show: (t: ToastSpec) => string; dismiss: (id: string) => void } | null>(null);

export function useToasts() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts must be used inside <ToastProvider>');
  return ctx;
}

const toneIcon: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={16} aria-hidden />,
  error: <XCircle size={16} aria-hidden />,
  warning: <AlertTriangle size={16} aria-hidden />,
  info: <Info size={16} aria-hidden />,
};

/** Bottom-right toasts: auto-dismiss 4 s (errors 9 s; never for errors needing action). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const dismiss = useCallback((id: string) => {
    setToasts((ts) => ts.filter((x) => x.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);
  const show = useCallback(
    (spec: ToastSpec) => {
      const id = spec.id ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      setToasts((ts) => [...ts.filter((x) => x.id !== id), { ...spec, id }].slice(-5));
      const needsAction = spec.tone === 'error' && spec.action;
      if (!spec.sticky && !needsAction) {
        clearTimeout(timers.current.get(id));
        timers.current.set(id, setTimeout(() => dismiss(id), spec.tone === 'error' ? 9000 : 4000));
      }
      return id;
    },
    [dismiss],
  );
  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <Portal>
        <div className="fr-toasts" role="region" aria-label="Notifications">
          {toasts.map((x) => (
            <div key={x.id} className="fr-toast" role={x.tone === 'error' ? 'alert' : 'status'} aria-live={x.tone === 'error' ? 'assertive' : 'polite'}>
              <span className={`fr-toast__icon fr-toast__icon--${x.tone}`}>{toneIcon[x.tone]}</span>
              <span className="fr-toast__msg">{x.message}</span>
              {x.action && (
                <button type="button" className="fr-btn fr-btn--ghost" style={{ color: 'var(--color-accent-text)', fontWeight: 600 }} onClick={() => { x.action!.run(); dismiss(x.id); }}>
                  {x.action.label}
                </button>
              )}
              <IconButton size="xs" label={t('common.dismiss')} icon={<X size={13} />} onClick={() => dismiss(x.id)} />
            </div>
          ))}
        </div>
      </Portal>
    </ToastContext.Provider>
  );
}
