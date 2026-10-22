/**
 * Notes (FR-PRJ-04): project, episode and scene notes are stored as a Markdown subset (headings, bullet and numbered
 * lists, bold, italic). This parser is the one place that subset is defined; the Studio renders its blocks as
 * elements (never as HTML strings) and exports reuse it.
 */

export interface NoteSpan { text: string; bold?: boolean; italic?: boolean }
export type NoteBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; spans: NoteSpan[] }
  | { kind: 'paragraph'; spans: NoteSpan[] }
  | { kind: 'list'; ordered: boolean; items: NoteSpan[][] };

/** Inline `**bold**`, `*italic*` / `_italic_` (nesting one level: `***both***`). Unclosed markers stay literal. */
export function parseInline(text: string): NoteSpan[] {
  const out: NoteSpan[] = [];
  const re = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|(?<![\w])_([^_\s][^_]*)_(?![\w]))/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) out.push({ text: m[2], bold: true, italic: true });
    else if (m[3] !== undefined) out.push({ text: m[3], bold: true });
    else out.push({ text: (m[4] ?? m[5])!, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function parseNotes(md: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: NoteSpan[][] } | undefined;
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', spans: parseInline(para.join(' ')) });
    para = [];
    if (list) blocks.push({ kind: 'list', ...list });
    list = undefined;
  };
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ kind: 'heading', level: h[1]!.length as 1 | 2 | 3, spans: parseInline(h[2]!) });
      continue;
    }
    const li = /^(?:([-*•])|(\d+)[.)])\s+(.+)$/.exec(line);
    if (li) {
      const ordered = !!li[2];
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(parseInline(li[3]!));
      continue;
    }
    if (list) flush();
    para.push(line);
  }
  flush();
  return blocks;
}

/** Plain text (for exports and search). */
export function notesPlainText(md: string): string {
  return parseNotes(md).map((b) => b.kind === 'list'
    ? b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : '•'} ${it.map((s) => s.text).join('')}`).join('\n')
    : b.spans.map((s) => s.text).join('')).join('\n\n');
}
