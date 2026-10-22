/**
 * Captions (FR-TXT-01/02, FR-TXT-06, FR-RND-06): paging from word timings, burn-in layout from a caption style asset,
 * and SRT/WebVTT subtitle files. Burn-in and subtitle files use the same pages so they always agree.
 */
import type { Item, TextSpan } from '@frame/render';
import type { ProjectState } from './state.js';
import { TICKS_PER_SECOND } from './time.js';
import { lineTakeState } from './validate.js';

export interface CaptionStyle {
  font: string;
  weight: number;
  /** Font size as a fraction of the output's shorter side. */
  size: number;
  color: string;
  /** 'line': whole page; 'karaoke': spoken words highlighted; 'pop': a few words at a time, current word enlarged. */
  mode: 'line' | 'karaoke' | 'pop';
  highlight?: string;
  /** Colour of words not yet spoken (karaoke). */
  upcoming?: string;
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number; dx: number; dy: number };
  box?: { color: string; radius: number; padX: number; padY: number };
  position: 'bottom' | 'top';
  /** Maximum characters per caption line; pages hold two lines. */
  maxChars: number;
  /** Words per page in 'pop' mode. */
  window?: number;
  uppercase?: boolean;
  italic?: boolean;
  label?: { color: string; weight: number };
  letterSpacing?: number;
}

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  font: 'Inter', weight: 600, size: 0.046, color: '#FFFFFF', mode: 'line', position: 'bottom', maxChars: 42,
  outline: { color: '#000000', width: 0.08 }, label: { color: '#FFD54A', weight: 700 },
};

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface CaptionPage {
  text: string;
  start: number;
  end: number;
  words: Word[];
}

/**
 * Splits a line into caption pages (≤ two lines of maxChars). Pages follow word timings when present; otherwise
 * time is shared in proportion to characters.
 */
export function captionPages(text: string, duration: number, words: Word[] | undefined, maxChars: number, perPage?: number): CaptionPage[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length || duration <= 0) return [];
  // Map display tokens to timings by order; aligners drop punctuation, so match on position.
  const timed: Word[] = [];
  const total = tokens.reduce((n, t) => n + t.length + 1, 0);
  let acc = 0;
  tokens.forEach((t, i) => {
    const w = words && words.length === tokens.length ? words[i] : undefined;
    const s = w ? w.start : (acc / total) * duration;
    acc += t.length + 1;
    const e = w ? w.end : (acc / total) * duration;
    timed.push({ text: t, start: Math.max(0, s), end: Math.min(duration, Math.max(s, e)) });
  });
  const pages: Word[][] = [];
  let cur: Word[] = [];
  let len = 0;
  const limit = maxChars * 2;
  for (const w of timed) {
    const add = (cur.length ? 1 : 0) + w.text.length;
    const full = perPage ? cur.length >= perPage : len + add > limit && cur.length > 0;
    if (full) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(w);
    len += (cur.length > 1 ? 1 : 0) + w.text.length;
    // Prefer to end a page at sentence punctuation once it is reasonably full.
    if (!perPage && /[.!?]$/.test(w.text) && len > maxChars) {
      pages.push(cur);
      cur = [];
      len = 0;
    }
  }
  if (cur.length) pages.push(cur);
  return pages.map((ws, i) => ({
    text: ws.map((w) => w.text).join(' '),
    start: i === 0 ? 0 : ws[0]!.start,
    end: i === pages.length - 1 ? duration : pages[i + 1]![0]!.start,
    words: ws,
  }));
}

/** Breaks page text into at most two balanced lines of ≤ maxChars where possible. */
export function balanceLines(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const words = text.split(' ');
  let best = text;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length) + (a.length > maxChars || b.length > maxChars ? 1000 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = `${a}\n${b}`;
    }
  }
  return best;
}

export interface ActiveCaption {
  speaker: string;
  text: string;
  words?: Word[];
  /** Seconds since the line started. */
  local: number;
  /** Line length in seconds. */
  duration: number;
}

/** Display items for the captions active at a frame (FR-TXT-01: stacked speakers, safe-area aware). */
export function captionItems(active: ActiveCaption[], style: CaptionStyle, width: number, height: number, speakerLabels: boolean): Item[] {
  if (!active.length) return [];
  const short = Math.min(width, height);
  const size = Math.round(style.size * short);
  const vertical = height > width;
  // Title-safe margin (10 %); vertical formats keep clear of social UI at the bottom.
  const marginY = height * (vertical ? 0.2 : 0.1);
  const maxWidth = width * (vertical ? 0.84 : 0.8);
  const spans: TextSpan[] = [];
  active.forEach((c, i) => {
    const pages = captionPages(c.text, c.duration, c.words, style.maxChars, style.mode === 'pop' ? style.window ?? 3 : undefined);
    const page = pages.find((p) => c.local >= p.start && c.local < p.end) ?? pages[pages.length - 1];
    if (!page) return;
    if (i > 0) spans.push({ text: '\n' });
    if (speakerLabels && c.speaker) spans.push({ text: `${style.uppercase ? c.speaker.toUpperCase() : c.speaker}: `, color: style.label?.color ?? style.color, weight: style.label?.weight ?? style.weight });
    const lines = balanceLines(page.text, style.maxChars).split('\n');
    let wi = 0;
    lines.forEach((ln, li) => {
      if (li > 0) spans.push({ text: '\n' });
      ln.split(' ').forEach((tok, ti) => {
        const w = page.words[wi++];
        const txt = (ti > 0 ? ' ' : '') + (style.uppercase ? tok.toUpperCase() : tok);
        if (style.mode === 'line' || !w) {
          spans.push({ text: txt });
          return;
        }
        const spoken = c.local >= w.start;
        const current = spoken && c.local < w.end;
        if (style.mode === 'karaoke') spans.push({ text: txt, color: spoken ? style.highlight ?? style.color : style.upcoming ?? style.color });
        else spans.push({ text: txt, ...(current ? { color: style.highlight ?? style.color, scale: 1.15 } : {}) });
      });
    });
  });
  if (!spans.length) return [];
  const merged = mergeSpans(spans);
  return [{
    k: 'text',
    text: merged.map((s) => s.text).join(''),
    spans: merged,
    x: width / 2,
    y: style.position === 'top' ? marginY : height - marginY,
    valign: style.position === 'top' ? 'top' : 'bottom',
    align: 'center',
    maxWidth,
    size,
    family: style.font,
    weight: style.weight,
    ...(style.italic ? { italic: true } : {}),
    color: style.color,
    lineHeight: 1.3,
    ...(style.letterSpacing ? { letterSpacing: style.letterSpacing * size } : {}),
    ...(style.outline ? { outline: { color: style.outline.color, width: style.outline.width * size } } : {}),
    ...(style.shadow ? { shadow: { ...style.shadow, blur: style.shadow.blur * size, dx: style.shadow.dx * size, dy: style.shadow.dy * size } } : {}),
    ...(style.box ? { box: { color: style.box.color, radius: style.box.radius * size, padX: style.box.padX * size, padY: style.box.padY * size } } : {}),
  }];
}

function mergeSpans(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && last.color === s.color && last.weight === s.weight && last.scale === s.scale) last.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/* ------------------------------------------------------------------ subtitle files */

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Subtitle cues for scenes laid end to end (seconds from the start of the first scene). */
export function subtitleCues(state: ProjectState, sceneIds: string[], opts: { speakerLabels?: boolean; maxChars?: number; range?: { from: number; to: number } } = {}): Cue[] {
  const cues: Cue[] = [];
  let offset = 0;
  const maxChars = opts.maxChars ?? DEFAULT_CAPTION_STYLE.maxChars;
  for (const id of sceneIds) {
    const scene = state.scenes[id];
    if (!scene) continue;
    const from = opts.range?.from ?? 0;
    const to = Math.min(opts.range?.to ?? scene.duration, scene.duration);
    for (const c of scene.clips) {
      if (!c.enabled || !c.line || c.line.muted || c.line.caption?.hidden) continue;
      if (c.end <= from || c.start >= to) continue;
      const take = lineTakeState(state, c) === 'Ready' && c.line.take ? state.takes[c.line.take] : undefined;
      const speaker = scene.instances.find((i) => i.id === c.line!.speaker)?.name ?? '';
      const text = c.line.caption?.text ?? stripPauseMarkers(c.line.text);
      const dur = (c.end - c.start) / TICKS_PER_SECOND;
      const base = offset + (c.start - from) / TICKS_PER_SECOND;
      for (const p of captionPages(text, dur, take?.alignment?.words, maxChars)) {
        const s = Math.max(offset, base + p.start);
        const e = Math.min(offset + (to - from) / TICKS_PER_SECOND, base + p.end);
        if (e - s < 0.04) continue;
        const body = balanceLines(p.text, maxChars);
        cues.push({ start: s, end: e, text: opts.speakerLabels && speaker ? `${speaker}: ${body}` : body });
      }
    }
    offset += (to - from) / TICKS_PER_SECOND;
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function stripPauseMarkers(text: string): string {
  return text.replace(/\[pause\s+\d+(?:\.\d+)?s\]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function stamp(s: number, sep: string): string {
  const ms = Math.round(s * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(r).padStart(3, '0')}`;
}

export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function toVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text.replace(/-->/g, '→')}\n`).join('\n')}`;
}
