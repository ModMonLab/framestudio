/**
 * Notes editor (FR-PRJ-04): a Markdown-subset text field with Heading / List / Bold / Italic buttons and a preview.
 * One edit session is one command (committed on blur), so typing is a single undo step (FR-PER-02).
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { Bold, Eye, Heading2, Italic, List, ListOrdered, Pencil } from 'lucide-react';
import { parseNotes, type NoteBlock, type NoteSpan } from '@frame/core';
import { IconButton } from '@frame/ui';

/** `offset` maps note heading levels to HTML levels (# → h(1 + offset)) so pages keep a valid outline. */
export function NotesView({ value, empty = 'No notes yet.', offset = 2 }: { value: string; empty?: string; offset?: number }) {
  const blocks = parseNotes(value);
  if (!blocks.length) return <p className="fr-faint st-notes-empty">{empty}</p>;
  const spans = (ss: NoteSpan[]) => ss.map((s, i) => {
    let el = <Fragment key={i}>{s.text}</Fragment>;
    if (s.italic) el = <em key={i}>{el}</em>;
    if (s.bold) el = <strong key={i}>{el}</strong>;
    return el;
  });
  const block = (b: NoteBlock, i: number) => {
    if (b.kind === 'heading') {
      const H = `h${Math.min(6, b.level + offset)}` as 'h2';
      return <H key={i}>{spans(b.spans)}</H>;
    }
    if (b.kind === 'list') return b.ordered ? <ol key={i}>{b.items.map((it, j) => <li key={j}>{spans(it)}</li>)}</ol> : <ul key={i}>{b.items.map((it, j) => <li key={j}>{spans(it)}</li>)}</ul>;
    return <p key={i}>{spans(b.spans)}</p>;
  };
  return <div className="st-notes-view">{blocks.map(block)}</div>;
}

export function NotesEditor({ label, value, onCommit, rows = 5, placeholder }: { label: string; value: string; onCommit: (v: string) => void; rows?: number; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setDraft(value), [value]);
  const commit = (v = draft) => {
    if (v !== value) onCommit(v);
  };
  // Wraps the selection in a marker, or prefixes each selected line.
  const wrap = (mark: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = draft.slice(a, b) || 'text';
    const next = draft.slice(0, a) + mark + sel + mark + draft.slice(b);
    setDraft(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + mark.length, a + mark.length + sel.length); });
  };
  const prefix = (p: (i: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const start = draft.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const endNl = draft.indexOf('\n', el.selectionEnd);
    const end = endNl < 0 ? draft.length : endNl;
    const lines = draft.slice(start, end).split('\n').map((l, i) => p(i) + l.replace(/^(#{1,3}\s+|[-*•]\s+|\d+[.)]\s+)/, ''));
    const next = draft.slice(0, start) + lines.join('\n') + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => el.focus());
  };
  return (
    <div className="st-notes">
      <div className="st-notes-bar" role="toolbar" aria-label={`${label} formatting`}>
        <span className="st-notes-label">{label}</span>
        <span className="fr-spacer" />
        {!preview && <>
          <IconButton size="sm" label="Heading" icon={<Heading2 size={13} />} onMouseDown={(e) => e.preventDefault()} onClick={() => prefix(() => '## ')} />
          <IconButton size="sm" label="Bulleted list" icon={<List size={13} />} onMouseDown={(e) => e.preventDefault()} onClick={() => prefix(() => '- ')} />
          <IconButton size="sm" label="Numbered list" icon={<ListOrdered size={13} />} onMouseDown={(e) => e.preventDefault()} onClick={() => prefix((i) => `${i + 1}. `)} />
          <IconButton size="sm" label="Bold" shortcut="Ctrl B" icon={<Bold size={13} />} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('**')} />
          <IconButton size="sm" label="Italic" shortcut="Ctrl I" icon={<Italic size={13} />} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('*')} />
        </>}
        <IconButton size="sm" label={preview ? 'Edit notes' : 'Preview notes'} icon={preview ? <Pencil size={13} /> : <Eye size={13} />} onClick={() => { commit(); setPreview(!preview); }} />
      </div>
      {preview ? <NotesView value={draft} /> : (
        <label className="fr-field fr-textarea">
          <textarea ref={ref} aria-label={label} value={draft} rows={rows} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onBlur={() => commit()}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); wrap('**'); }
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); wrap('*'); }
            }} />
        </label>
      )}
    </div>
  );
}
