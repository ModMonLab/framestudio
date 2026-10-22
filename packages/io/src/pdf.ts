import { parseNotes, scriptRows, stripPauseMarkers, type ProjectState } from '@frame/core';
/**
 * A small text-only PDF writer (FR-PRJ-04 script export): standard Type 1 fonts (no embedding), WinAnsi encoding,
 * word wrap and pagination. Deterministic: no timestamps or random ids, so the same script gives the same bytes.
 */

export type PdfFont = 'regular' | 'bold' | 'italic' | 'mono';
export interface PdfBlock {
  text: string;
  font?: PdfFont;
  size?: number;
  /** Left indent in points from the margin. */
  indent?: number;
  /** Wrap width in points (default: the text area). */
  width?: number;
  spaceBefore?: number;
  align?: 'left' | 'center';
  /** Start a new page before this block. */
  pageBreak?: boolean;
}

const FONT_NAMES: Record<PdfFont, string> = { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', mono: 'Courier' };
const PAGE = { w: 595.28, h: 841.89, margin: 64 }; // A4

// WinAnsi code points above 0x7F that map from common Unicode punctuation.
const WIN: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function encode(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const code = WIN[ch] ?? (c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : 0x3f);
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + String.fromCharCode(code);
    else if (code < 0x20 || code > 0x7e) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return out;
}

/** Approximate advance widths (1/1000 em) good enough for wrapping; Courier is fixed at 600. */
function width(s: string, font: PdfFont, size: number): number {
  if (font === 'mono') return [...s].length * 0.6 * size;
  let w = 0;
  for (const ch of s) {
    if (/[ilj.,:;'|!]/.test(ch)) w += 250;
    else if (/[frt()[\] -]/.test(ch)) w += 320;
    else if (/[mwMW]/.test(ch)) w += 850;
    else if (/[A-Z]/.test(ch)) w += 680;
    else w += 540;
  }
  return (w / 1000) * size * (font === 'bold' ? 1.05 : 1);
}

function wrap(text: string, font: PdfFont, size: number, max: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && width(next, font, size) > max) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
  }
  return lines;
}

export function textPdf(blocks: PdfBlock[], o: { title?: string } = {}): Uint8Array {
  const area = PAGE.w - PAGE.margin * 2;
  const pages: string[][] = [[]];
  let y = PAGE.h - PAGE.margin;
  for (const b of blocks) {
    const font = b.font ?? 'regular';
    const size = b.size ?? 11;
    const lead = size * 1.3;
    const indent = b.indent ?? 0;
    const lines = wrap(b.text, font, size, b.width ?? area - indent);
    if (b.pageBreak && pages[pages.length - 1]!.length) {
      pages.push([]);
      y = PAGE.h - PAGE.margin;
    } else y -= b.spaceBefore ?? 0;
    for (const ln of lines) {
      if (y - lead < PAGE.margin) {
        pages.push([]);
        y = PAGE.h - PAGE.margin;
      }
      y -= lead;
      const x = PAGE.margin + (b.align === 'center' ? (area - width(ln, font, size)) / 2 : indent);
      pages[pages.length - 1]!.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${encode(ln)}) Tj ET`);
    }
  }
  // Objects: 1 catalog, 2 pages, 3..6 fonts, 7 info, then a page + content pair per page.
  const fontIds: Record<PdfFont, number> = { regular: 3, bold: 4, italic: 5, mono: 6 };
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${8 + i * 2} 0 R`).join(' ');
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  for (const [f, id] of Object.entries(fontIds)) objs[id] = `<< /Type /Font /Subtype /Type1 /BaseFont /${FONT_NAMES[f as PdfFont]} /Encoding /WinAnsiEncoding >>`;
  objs[7] = `<< /Producer (Frame)${o.title ? ` /Title (${encode(o.title)})` : ''} >>`;
  const res = `<< /Font << ${Object.entries(fontIds).map(([f, id]) => `/${f} ${id} 0 R`).join(' ')} >> >>`;
  pages.forEach((ops, i) => {
    const content = ops.join('\n');
    objs[8 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources ${res} /Contents ${9 + i * 2} 0 R >>`;
    objs[9 + i * 2] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  });
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

/** The script as a screenplay-style PDF: title page with the project description, scene headings, cues, dialogue. */
export function scriptPdf(state: ProjectState): Uint8Array {
  const blocks: PdfBlock[] = [{ text: state.project.name, font: 'bold', size: 20, align: 'center', spaceBefore: 180 }];
  for (const b of parseNotes(state.project.description)) {
    const text = b.kind === 'list' ? b.items.map((it, i) => `${b.ordered ? `${i + 1}.` : '•'} ${it.map((s) => s.text).join('')}`).join('\n') : b.spans.map((s) => s.text).join('');
    blocks.push({ text, font: b.kind === 'heading' ? 'bold' : 'regular', size: b.kind === 'heading' ? 13 : 11, spaceBefore: 10 });
  }
  let scene = '';
  let first = true;
  for (const r of scriptRows(state)) {
    if (r.scene !== scene) {
      scene = r.scene;
      blocks.push({ text: r.sceneName.toUpperCase(), font: 'mono', size: 12, pageBreak: first, spaceBefore: 24 });
      first = false;
    }
    blocks.push({ text: r.speaker.toUpperCase(), font: 'mono', size: 12, indent: 158, spaceBefore: 14 });
    if (r.emotion && r.emotion !== 'neutral') blocks.push({ text: `(${r.emotion})`, font: 'mono', size: 12, indent: 122 });
    blocks.push({ text: stripPauseMarkers(r.text), font: 'mono', size: 12, indent: 72, width: 252 });
  }
  return textPdf(blocks, { title: state.project.name });
}
