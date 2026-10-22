import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { t } from './i18n.js';

export interface TreeNode {
  id: string;
  parent?: string;
  label: string;
  icon?: ReactNode;
  meta?: ReactNode;
  /** Extra text matched by search (e.g. current values), Design System §5.1/§7.2. */
  searchText?: string;
  /** Shows the accent "changed" dot. */
  changed?: boolean;
  /** Has children even if not loaded (e.g. collapsed scenes). */
  hasChildren?: boolean;
  renamable?: boolean;
  draggable?: boolean;
  /** Hover actions (visibility, lock, more…). */
  actions?: ReactNode;
  /** Semantic weight: group rows (depth ≤ 2) use semibold; deeper detail rows use secondary text. */
  emphasis?: 'group' | 'leaf' | 'detail';
  disabled?: boolean;
}

export type DropPosition = 'before' | 'after' | 'inside';

export interface TreeProps {
  nodes: TreeNode[];
  label: string;
  expanded: Set<string>;
  onExpandedChange: (ids: Set<string>) => void;
  selected?: string | Set<string>;
  onSelect?: (id: string, e: { shift: boolean; meta: boolean }) => void;
  onActivate?: (id: string) => void;
  onRename?: (id: string, label: string) => void;
  query?: string;
  canDrop?: (dragId: string, targetId: string, pos: DropPosition) => boolean;
  onDrop?: (dragId: string, targetId: string, pos: DropPosition) => void;
  /** Persist expansion (Design System §5.1). */
  emptyText?: string;
  /** Context menu for a row (pointer or Shift+F10 / Menu key on the focused row). */
  onContextMenu?: (id: string, at: { x: number; y: number }) => void;
}

function highlight(label: string, q: string): ReactNode {
  if (!q) return label;
  const i = label.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return label;
  return (
    <>
      {label.slice(0, i)}
      <mark className="fr-match">{label.slice(i, i + q.length)}</mark>
      {label.slice(i + q.length)}
    </>
  );
}

/** WAI-ARIA tree with search-with-ancestors, type-ahead, F2 rename and drag-and-drop (Design System §5.1). */
export function Tree({ nodes, label, expanded, onExpandedChange, selected, onSelect, onActivate, onRename, query = '', canDrop, onDrop, emptyText, onContextMenu }: TreeProps) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const m = new Map<string | undefined, TreeNode[]>();
    for (const n of nodes) m.set(n.parent, [...(m.get(n.parent) ?? []), n]);
    return m;
  }, [nodes]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const set = new Set<string>();
    for (const n of nodes) {
      if (n.label.toLowerCase().includes(q) || n.searchText?.toLowerCase().includes(q)) {
        let p: TreeNode | undefined = n;
        while (p) {
          set.add(p.id);
          p = p.parent ? byId.get(p.parent) : undefined;
        }
      }
    }
    return set;
  }, [q, nodes, byId]);

  const visible: { node: TreeNode; depth: number; open: boolean; kids: boolean }[] = [];
  const walk = (parent: string | undefined, depth: number) => {
    for (const n of children.get(parent) ?? []) {
      if (matches && !matches.has(n.id)) continue;
      const kids = (children.get(n.id)?.length ?? 0) > 0 || !!n.hasChildren;
      const open = matches ? true : expanded.has(n.id);
      visible.push({ node: n, depth, open, kids });
      if (kids && open) walk(n.id, depth + 1);
    }
  };
  walk(undefined, 0);

  const isSelected = (id: string) => (selected instanceof Set ? selected.has(id) : selected === id);
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const focusId = focus && visible.some((v) => v.node.id === focus) ? focus : (visible.find((v) => isSelected(v.node.id))?.node.id ?? visible[0]?.node.id);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [drop, setDrop] = useState<{ id: string; pos: DropPosition } | null>(null);
  const dragId = useRef<string | null>(null);
  const typeahead = useRef({ text: '', at: 0 });

  useEffect(() => {
    if (focus && rows.current.get(focus) && document.activeElement?.closest('[role="tree"]') === rows.current.get(focus)?.closest('[role="tree"]')) {
      rows.current.get(focus)?.focus();
    }
  }, [focus]);

  const toggle = (id: string, open?: boolean) => {
    const n = new Set(expanded);
    if (open ?? !n.has(id)) n.add(id);
    else n.delete(id);
    onExpandedChange(n);
  };

  const onKey = (e: KeyboardEvent, i: number) => {
    const v = visible[i]!;
    const go = (j: number) => {
      const target = visible[Math.max(0, Math.min(visible.length - 1, j))];
      if (target) {
        setFocus(target.node.id);
        rows.current.get(target.node.id)?.focus();
      }
    };
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); go(i + 1); break;
      case 'ArrowUp': e.preventDefault(); go(i - 1); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(visible.length - 1); break;
      case 'ArrowRight':
        e.preventDefault();
        if (v.kids && !v.open) toggle(v.node.id, true);
        else if (v.kids) go(i + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (v.kids && v.open && !matches) toggle(v.node.id, false);
        else if (v.node.parent) go(visible.findIndex((x) => x.node.id === v.node.parent));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect?.(v.node.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
        break;
      case 'F2':
        if (v.node.renamable && onRename) {
          e.preventDefault();
          setRenaming(v.node.id);
          setDraft(v.node.label);
        }
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now();
          typeahead.current = { text: (now - typeahead.current.at < 700 ? typeahead.current.text : '') + e.key.toLowerCase(), at: now };
          const s = typeahead.current.text;
          // A single key cycles from the next row; a longer prefix keeps matching from the current row.
          const startAt = s.length === 1 ? i + 1 : i;
          for (let k = 0; k < visible.length; k++) {
            const idx = (startAt + k) % visible.length;
            if (visible[idx]!.node.label.toLowerCase().startsWith(s)) {
              go(idx);
              break;
            }
          }
        }
    }
  };

  const commitRename = () => {
    if (renaming && draft.trim() && draft !== byId.get(renaming)?.label) onRename?.(renaming, draft.trim());
    setRenaming(null);
  };

  if (visible.length === 0) {
    return <p className="fr-empty-note" role="status">{q ? t('common.noResults', { query }) : emptyText}</p>;
  }
  return (
    <div role="tree" aria-label={label} className="fr-tree" aria-multiselectable={selected instanceof Set || undefined}>
      {visible.map((v, i) => {
        const n = v.node;
        const sel = isSelected(n.id);
        const emphasis = n.emphasis ?? (v.depth <= 2 && v.kids ? 'group' : 'leaf');
        const dropCls = drop?.id === n.id ? `fr-row--drop-${drop.pos}` : '';
        return (
          <Fragment key={n.id}>
            <div
              ref={(el) => { if (el) rows.current.set(n.id, el); else rows.current.delete(n.id); }}
              role="treeitem"
              aria-level={v.depth + 1}
              aria-expanded={v.kids ? v.open : undefined}
              aria-selected={sel}
              aria-disabled={n.disabled || undefined}
              tabIndex={focusId === n.id ? 0 : -1}
              className={`fr-row ${dropCls}`}
              draggable={!!n.draggable && !!onDrop && renaming !== n.id}
              onClick={(e) => { setFocus(n.id); onSelect?.(n.id, { shift: e.shiftKey, meta: e.metaKey || e.ctrlKey }); }}
              onContextMenu={onContextMenu ? (e) => {
                e.preventDefault();
                setFocus(n.id);
                if (!sel) onSelect?.(n.id, { shift: false, meta: false });
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onContextMenu(n.id, e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: r.left + 24, y: r.bottom });
              } : undefined}
              onDoubleClick={() => {
                if (n.renamable && onRename) { setRenaming(n.id); setDraft(n.label); }
                else onActivate?.(n.id);
              }}
              onKeyDown={(e) => { if (renaming !== n.id) onKey(e, i); }}
              onFocus={() => setFocus(n.id)}
              onDragStart={(e) => { dragId.current = n.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.label); }}
              onDragEnd={() => { dragId.current = null; setDrop(null); }}
              onDragOver={(e) => {
                const d = dragId.current;
                if (!d || d === n.id) return;
                const r = e.currentTarget.getBoundingClientRect();
                const y = (e.clientY - r.top) / r.height;
                const pos: DropPosition = y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside';
                if (canDrop && !canDrop(d, n.id, pos)) { setDrop(null); return; }
                e.preventDefault();
                setDrop({ id: n.id, pos });
              }}
              onDragLeave={() => setDrop((x) => (x?.id === n.id ? null : x))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId.current && drop) onDrop?.(dragId.current, drop.id, drop.pos);
                setDrop(null);
              }}
            >
              <span style={{ width: v.depth * 14, flex: 'none' }} />
              {v.kids ? (
                <button
                  type="button"
                  tabIndex={-1}
                  className="fr-row__toggle"
                  aria-label={v.open ? t('common.collapse', { label: n.label }) : t('common.expand', { label: n.label })}
                  onClick={(e) => { e.stopPropagation(); toggle(n.id); }}
                >
                  <ChevronRight size={12} className={`fr-chev ${v.open ? 'fr-chev--open' : ''}`} aria-hidden />
                </button>
              ) : (
                <span style={{ width: 18, flex: 'none' }} />
              )}
              {n.icon && <span className="fr-row__icon" aria-hidden>{n.icon}</span>}
              {renaming === n.id ? (
                <input
                  className="fr-field"
                  style={{ height: 22, flex: 1, minWidth: 0, padding: '0 4px' }}
                  aria-label={`Rename ${n.label}`}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <span className={`fr-row__label ${emphasis === 'group' ? 'fr-row__label--group' : emphasis === 'detail' ? 'fr-row__label--detail' : ''}`}>{highlight(n.label, q)}</span>
              )}
              {n.changed && <span className="fr-row__changed" aria-label="Changed" />}
              {n.meta !== undefined && <span className="fr-row__meta">{n.meta}</span>}
              {n.actions && <span className="fr-row__actions" onClick={(e) => e.stopPropagation()}>{n.actions}</span>}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
