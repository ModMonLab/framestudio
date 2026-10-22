import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/* ------------------------------------------------------------------ portal root */

const PortalContext = createContext<HTMLElement | null>(null);

/** Provides the element popovers, dialogs and toasts portal into (inherits theme variables). */
export function PortalRoot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  return (
    <PortalContext.Provider value={el}>
      {children}
      <div ref={setEl} className="fr-portal fr-root" style={{ background: "transparent" }} />
    </PortalContext.Provider>
  );
}

export function Portal({ children }: { children: ReactNode }) {
  const root = useContext(PortalContext);
  if (typeof document === 'undefined') return null;
  return createPortal(children, root ?? document.body);
}

/* ------------------------------------------------------------------ positioning */

export type Placement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top' | 'bottom' | 'right-start';

export function usePosition(anchor: RefObject<HTMLElement | null>, floating: RefObject<HTMLElement | null>, open: boolean, placement: Placement = 'bottom-start', offset = 4) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const update = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const f = floating.current?.getBoundingClientRect();
    if (!a || !f) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = a.left;
    let top = a.bottom + offset;
    if (placement === 'bottom-end') left = a.right - f.width;
    if (placement === 'bottom' || placement === 'top') left = a.left + a.width / 2 - f.width / 2;
    if (placement === 'top-start' || placement === 'top') top = a.top - f.height - offset;
    if (placement === 'right-start') {
      left = a.right + offset;
      top = a.top - 4;
    }
    if (top + f.height > vh - 8 && placement.startsWith('bottom')) top = Math.max(8, a.top - f.height - offset);
    if (top < 8) top = a.bottom + offset;
    left = Math.max(8, Math.min(left, vw - f.width - 8));
    top = Math.max(8, Math.min(top, vh - f.height - 8));
    setPos({ left, top });
  }, [anchor, floating, placement, offset]);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    update();
    const h = () => update();
    window.addEventListener('resize', h);
    window.addEventListener('scroll', h, true);
    return () => {
      window.removeEventListener('resize', h);
      window.removeEventListener('scroll', h, true);
    };
  }, [open, update]);
  return pos;
}

/** Closes on outside pointer-down and Escape. */
export function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[]) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (refs.some((r) => r.current?.contains(e.target as Node))) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key, true);
    };
  }, [open, onClose, refs]);
}

export interface PopoverProps {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  children: ReactNode;
  label?: string;
  role?: string;
  className?: string;
  width?: number;
}

export function Popover({ anchor, open, onClose, placement, children, label, role = 'dialog', className, width }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = usePosition(anchor, ref, open, placement);
  useDismiss(open, onClose, [ref, anchor]);
  if (!open) return null;
  return (
    <Portal>
      <div
        ref={ref}
        role={role}
        aria-label={label}
        className={`fr-popover ${className ?? ''}`}
        style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, visibility: pos ? 'visible' : 'hidden', ...(width ? { width } : {}) }}
      >
        {children}
      </div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ tooltip (400 ms delay, includes shortcut) */

export function Tooltip({ label, shortcut, children, placement = 'bottom' }: { label: string; shortcut?: string; children: (props: { 'aria-describedby'?: string; onPointerEnter: () => void; onPointerLeave: () => void; onFocus: () => void; onBlur: () => void; ref: RefObject<HTMLElement | null> }) => ReactNode; placement?: Placement }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const anchor = useRef<HTMLElement | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const id = useId();
  const pos = usePosition(anchor, tip, open, placement, 6);
  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 400);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      {children({ 'aria-describedby': open ? id : undefined, onPointerEnter: show, onPointerLeave: hide, onFocus: show, onBlur: hide, ref: anchor })}
      {open && (
        <Portal>
          <div ref={tip} id={id} role="tooltip" className="fr-tooltip" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
            {label}
            {shortcut && <span className="fr-kbd">{shortcut}</span>}
          </div>
        </Portal>
      )}
    </>
  );
}
