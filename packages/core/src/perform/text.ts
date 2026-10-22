/**
 * On-screen text (FR-TXT-03..05, Catalog O1): speech and thought bubbles whose tail tracks a character, titles,
 * lower thirds, cards, credits and graphics in screen space (inside the safe area of every aspect ratio), and world
 * text that lives on the stage and moves with the camera. Text clips sit on the scene's text track; their content
 * and placement are clip parameters, their look is the asset's data. Pure: display items from (clip, time, layout).
 */
import type { Item, Mat } from '@frame/render';

export interface BubbleStyle {
  shape: 'round' | 'square' | 'shout' | 'whisper' | 'thought' | 'narration';
  fill?: string;
  stroke?: string;
  text?: string;
  font?: string;
  weight?: number;
}

export interface GraphicStyle {
  layout: 'title' | 'card' | 'lower-third' | 'bar' | 'tag' | 'credits-roll' | 'credits-card' | 'bug' | 'progress' | 'countdown' | 'arrow' | 'circle' | 'callout';
  background?: string;
  accent?: string;
  text?: string;
  font?: string;
  weight?: number;
  /** Text size as a fraction of the frame height. */
  size?: number;
  anim?: 'fade' | 'slide' | 'pop' | 'none';
}

export interface WorldTextStyle { panel: 'sign' | 'screen' | 'chalk'; background?: string; text?: string; font?: string }

export interface TextLayout {
  w: number;
  h: number;
  /** Clip progress (0…1), seconds since its start and its length in seconds. */
  u: number;
  s: number;
  dur: number;
  /** Screen boxes of instances (bubbles and callouts attach to them). */
  boxes: Record<string, { x: number; y: number; w: number; h: number }>;
  /** Stage → screen matrix (world text). */
  view: Mat;
}

const ink = '#1A1A1A';

/** Approximate text block size for a font size (Inter averages ≈ 0.53 em per character). */
export function measureText(text: string, size: number, maxWidth: number): { lines: number; width: number; height: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const per = size * 0.53;
  let lines = 1;
  let line = 0;
  let widest = 0;
  for (const word of words) {
    const ww = (word.length + 1) * per;
    if (line > 0 && line + ww > maxWidth) {
      widest = Math.max(widest, line);
      lines++;
      line = 0;
    }
    line += ww;
  }
  widest = Math.max(widest, line);
  return { lines, width: Math.min(maxWidth, widest), height: lines * size * 1.25 };
}

/** In/out animation factor and transform. */
function anim(kind: GraphicStyle['anim'], l: TextLayout): { op: number; dx: number; sc: number } {
  const inT = Math.min(1, l.s / 0.35);
  const outT = Math.min(1, Math.max(0, (l.dur - l.s) / 0.3));
  const e = (x: number) => 1 - (1 - x) ** 3;
  switch (kind) {
    case 'none':
      return { op: 1, dx: 0, sc: 1 };
    case 'slide':
      return { op: Math.min(inT * 2, outT), dx: -(1 - e(inT)) * l.w * 0.4, sc: 1 };
    case 'pop':
      return { op: Math.min(1, inT * 3, outT), dx: 0, sc: 0.7 + 0.3 * e(inT) + Math.sin(inT * Math.PI) * 0.06 };
    default:
      return { op: Math.min(e(inT), outT), dx: 0, sc: 1 };
  }
}

const scaleAbout = (cx: number, cy: number, k: number): Mat => [k, 0, 0, k, cx * (1 - k), cy * (1 - k)];

function spiky(cx: number, cy: number, rx: number, ry: number, n: number): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const k = i % 2 ? 1 : 1.22;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rx * k).toFixed(1)} ${(cy + Math.sin(a) * ry * k).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** A speech/thought bubble for `text` attached to a character box; the tail points at the mouth. */
export function bubbleItems(style: BubbleStyle, text: string, attach: { x: number; y: number; w: number; h: number } | undefined, l: TextLayout): Item[] {
  const size = Math.max(14, l.h * 0.034);
  const fill = style.fill ?? '#FFFFFF';
  const stroke = style.stroke ?? ink;
  const sw = Math.max(1.5, l.h * 0.0035);
  const safe = l.h * 0.05;
  const m = measureText(text, size, l.w * 0.3);
  const pad = size * 0.8;
  const bw = m.width + pad * 2;
  const bh = m.height + pad * 1.4;
  const a = anim('pop', l);
  if (style.shape === 'narration' || !attach) {
    const x = safe + l.w * 0.02;
    const y = safe;
    return [{ k: 'group', op: a.op, items: [
      { k: 'rect', x, y, w: bw, h: bh, r: 4, fill: { color: style.fill ?? '#FFF4C2' }, stroke: { paint: { color: stroke }, width: sw } },
      { k: 'text', text, x: x + pad, y: y + pad * 0.7, size, family: style.font ?? 'Inter', weight: style.weight ?? 600, color: style.text ?? ink, align: 'left', maxWidth: m.width + size, lineHeight: 1.25 },
    ] }];
  }
  // Mouth ≈ a sixth down the character's box; the bubble sits above the head on the side with more room.
  const mouth: [number, number] = [attach.x + attach.w / 2, attach.y + attach.h * 0.17];
  const left = mouth[0] > l.w / 2;
  let bx = left ? mouth[0] - bw - attach.w * 0.15 : mouth[0] + attach.w * 0.15;
  let by = attach.y - bh * 0.6;
  bx = Math.max(safe, Math.min(l.w - safe - bw, bx));
  by = Math.max(safe, Math.min(l.h - safe - bh, by));
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  const items: Item[] = [];
  const tailBase: [number, number] = [left ? bx + bw * 0.75 : bx + bw * 0.25, by + bh * 0.85];
  const tip: [number, number] = [tailBase[0] + (mouth[0] - tailBase[0]) * 0.6, tailBase[1] + (mouth[1] - tailBase[1]) * 0.6];
  const fillP = { color: fill };
  const line = { paint: { color: stroke }, width: sw, join: 'round' as const, cap: 'round' as const };
  if (style.shape === 'thought') {
    const lobes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const r = Math.min(bw, bh) * 0.28;
      const px = cx + Math.cos(ang) * (bw / 2 - r * 0.6);
      const py = cy + Math.sin(ang) * (bh / 2 - r * 0.6);
      lobes.push(`M${px - r} ${py}A${r} ${r} 0 1 0 ${px + r} ${py}A${r} ${r} 0 1 0 ${px - r} ${py}Z`);
    }
    items.push({ k: 'path', d: lobes.join(''), fill: fillP, stroke: line });
    items.push({ k: 'ellipse', cx, cy, rx: bw / 2 - sw, ry: bh / 2 - sw, fill: fillP });
    for (let i = 1; i <= 3; i++) {
      const f = i / 4;
      const r = size * (0.45 - i * 0.1);
      items.push({ k: 'ellipse', cx: tailBase[0] + (mouth[0] - tailBase[0]) * f * 0.8, cy: tailBase[1] + (mouth[1] - tailBase[1]) * f * 0.8, rx: r, ry: r, fill: fillP, stroke: line });
    }
  } else {
    const tw = size * 0.55;
    const tail = `M${tailBase[0] - tw} ${tailBase[1]}L${tip[0]} ${tip[1]}L${tailBase[0] + tw} ${tailBase[1]}Z`;
    const body = style.shape === 'shout'
      ? spiky(cx, cy, bw * 0.56, bh * 0.6, 12)
      : style.shape === 'square' ? `M${bx} ${by}L${bx + bw} ${by}L${bx + bw} ${by + bh}L${bx} ${by + bh}Z`
      : `M${bx} ${cy}A${bw / 2} ${bh / 2} 0 1 0 ${bx + bw} ${cy}A${bw / 2} ${bh / 2} 0 1 0 ${bx} ${cy}Z`;
    const whisper = style.shape === 'whisper';
    items.push({ k: 'path', d: tail, fill: fillP, stroke: line, ...(whisper ? { op: 0.85 } : {}) });
    items.push({ k: 'path', d: body, fill: fillP, stroke: { ...line, width: whisper ? sw * 0.6 : sw }, ...(whisper ? { op: 0.9 } : {}) });
    // Cover the tail's join with the body.
    items.push({ k: 'path', d: `M${tailBase[0] - tw + sw} ${tailBase[1] - sw * 2}L${tailBase[0] + tw - sw} ${tailBase[1] - sw * 2}L${tailBase[0]} ${tailBase[1] + sw}Z`, fill: fillP });
  }
  const shoutSize = style.shape === 'shout' ? size * 1.15 : size;
  items.push({ k: 'text', text, x: cx, y: cy - m.height / 2, size: shoutSize, family: style.font ?? 'Inter', weight: style.weight ?? (style.shape === 'shout' ? 800 : 600), italic: style.shape === 'whisper', color: style.text ?? ink, align: 'center', maxWidth: m.width + size, lineHeight: 1.25 });
  return [{ k: 'group', op: a.op, tf: scaleAbout(tip[0], tip[1], a.sc), items }];
}

/** Titles, lower thirds, cards, credits and graphics in screen space (safe-area aware). */
export function graphicItems(g: GraphicStyle, p: { text: string; subtitle?: string; lines?: string[]; attach?: string }, l: TextLayout): Item[] {
  const { w, h } = l;
  const safeX = w * 0.06;
  const safeY = h * 0.06;
  const a = anim(g.anim ?? (g.layout === 'lower-third' || g.layout === 'bar' ? 'slide' : 'fade'), l);
  const font = g.font ?? 'Inter';
  const textC = g.text ?? '#FFFFFF';
  const bg = g.background ?? '#1E2433';
  const accent = g.accent ?? '#F5B83D';
  const size = (g.size ?? 0.06) * h;
  const items: Item[] = [];
  switch (g.layout) {
    case 'title':
    case 'card': {
      if (g.layout === 'card' || g.background) items.push({ k: 'rect', x: 0, y: 0, w, h, fill: { color: bg } });
      // Titles over the picture get a soft shadow so they read on any background.
      const shadow = g.layout === 'title' && !g.background ? { shadow: { color: '#000000AA', blur: size * 0.25, dx: 0, dy: size * 0.06 } } : {};
      items.push({ k: 'text', text: p.text, x: w / 2, y: h * 0.42 - size, size: size * 1.4, family: font, weight: g.weight ?? 800, color: textC, align: 'center', maxWidth: w - safeX * 2, lineHeight: 1.1, ...shadow });
      if (p.subtitle) items.push({ k: 'text', text: p.subtitle, x: w / 2, y: h * 0.42 + size * 0.9, size: size * 0.6, family: font, weight: 500, color: accent, align: 'center', maxWidth: w - safeX * 2 });
      items.push({ k: 'rect', x: w / 2 - w * 0.06, y: h * 0.42 + size * 0.55, w: w * 0.12, h: Math.max(2, h * 0.005), fill: { color: accent } });
      return [{ k: 'group', op: a.op, items }];
    }
    case 'lower-third': {
      const m = measureText(p.text, size * 0.75, w * 0.5);
      const bw = Math.max(w * 0.22, m.width + size * 1.2);
      const bh = size * (p.subtitle ? 1.9 : 1.25);
      const x = safeX + a.dx;
      const y = h - safeY - bh - h * 0.08;
      items.push({ k: 'rect', x, y, w: Math.max(4, size * 0.18), h: bh, fill: { color: accent } });
      items.push({ k: 'rect', x: x + size * 0.18, y, w: bw, h: bh, fill: { color: bg }, op: 0.92 });
      items.push({ k: 'text', text: p.text, x: x + size * 0.6, y: y + size * 0.22, size: size * 0.75, family: font, weight: 700, color: textC, align: 'left' });
      if (p.subtitle) items.push({ k: 'text', text: p.subtitle, x: x + size * 0.6, y: y + size * 1.08, size: size * 0.5, family: font, weight: 500, color: accent, align: 'left' });
      return [{ k: 'group', op: a.op, items }];
    }
    case 'bar': {
      const bh = size * 1.3;
      const y = h - safeY - bh;
      items.push({ k: 'rect', x: 0, y, w, h: bh, fill: { color: bg } });
      items.push({ k: 'rect', x: 0, y, w: size * 4.2, h: bh, fill: { color: accent } });
      items.push({ k: 'text', text: p.subtitle ?? 'BREAKING', x: size * 2.1, y: y + bh * 0.22, size: size * 0.55, family: font, weight: 800, color: '#FFFFFF', align: 'center' });
      // Ticker scrolls right to left.
      const tx = w - ((l.s * w * 0.12) % (w + size * p.text.length * 0.6));
      items.push({ k: 'group', clip: `M${size * 4.2} ${y}L${w} ${y}L${w} ${y + bh}L${size * 4.2} ${y + bh}Z`, items: [{ k: 'text', text: p.text, x: tx, y: y + bh * 0.2, size: size * 0.6, family: font, weight: 600, color: textC, align: 'left' }] });
      return [{ k: 'group', op: a.op, tf: [1, 0, 0, 1, 0, (1 - a.op) * bh], items }];
    }
    case 'tag': {
      const s2 = size * 0.55;
      const m = measureText(p.text, s2, w * 0.4);
      const x = safeX + a.dx;
      const y = h - safeY - s2 * 2;
      items.push({ k: 'rect', x, y, w: m.width + s2 * 1.6, h: s2 * 1.7, r: s2 * 0.85, fill: { color: bg }, op: 0.85 });
      items.push({ k: 'text', text: p.text, x: x + s2 * 0.8, y: y + s2 * 0.32, size: s2, family: font, weight: 600, color: textC, align: 'left' });
      return [{ k: 'group', op: a.op, items }];
    }
    case 'credits-roll': {
      const lines = p.lines?.length ? p.lines : p.text.split('\n');
      const lh = size * 0.9;
      const total = lines.length * lh + h;
      const y0 = h - l.u * total;
      if (g.background) items.push({ k: 'rect', x: 0, y: 0, w, h, fill: { color: bg } });
      lines.forEach((ln, i) => items.push({ k: 'text', text: ln, x: w / 2, y: y0 + i * lh, size: size * (i === 0 ? 0.8 : 0.55), family: font, weight: i === 0 ? 800 : 500, color: textC, align: 'center' }));
      return [{ k: 'group', op: Math.min(1, (l.dur - l.s) / 0.3), items }];
    }
    case 'credits-card': {
      const lines = p.lines?.length ? p.lines : p.text.split('\n');
      items.push({ k: 'rect', x: 0, y: 0, w, h, fill: { color: bg } });
      const lh = size * 0.85;
      lines.forEach((ln, i) => items.push({ k: 'text', text: ln, x: w / 2, y: h / 2 - (lines.length * lh) / 2 + i * lh, size: size * (i === 0 ? 0.75 : 0.5), family: font, weight: i === 0 ? 800 : 500, color: i === 0 ? accent : textC, align: 'center' }));
      return [{ k: 'group', op: a.op, items }];
    }
    case 'bug':
      return [{ k: 'text', text: p.text, x: w - safeX, y: safeY, size: size * 0.45, family: font, weight: 800, color: textC, align: 'right', op: 0.55 * a.op }];
    case 'progress': {
      const bh = Math.max(3, h * 0.008);
      return [{ k: 'group', op: a.op, items: [{ k: 'rect', x: 0, y: h - bh, w, h: bh, fill: { color: bg }, op: 0.5 }, { k: 'rect', x: 0, y: h - bh, w: w * l.u, h: bh, fill: { color: accent } }] }];
    }
    case 'countdown': {
      const n = Math.max(0, Math.ceil(l.dur - l.s));
      const pulse = 1 + 0.15 * (1 - ((l.s % 1) * 4 > 1 ? 1 : (l.s % 1) * 4));
      return [{ k: 'group', tf: scaleAbout(w / 2, h / 2, pulse), items: [{ k: 'ellipse', cx: w / 2, cy: h / 2, rx: size * 1.6, ry: size * 1.6, fill: { color: bg }, op: 0.85 }, { k: 'text', text: String(n), x: w / 2, y: h / 2 - size * 0.9, size: size * 1.8, family: font, weight: 800, color: textC, align: 'center' }] }];
    }
    case 'arrow':
    case 'circle':
    case 'callout': {
      const b = p.attach ? l.boxes[p.attach] : undefined;
      if (!b) return [];
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h * (g.layout === 'circle' ? 0.5 : 0.2);
      const line = { paint: { color: accent }, width: Math.max(3, h * 0.006), cap: 'round' as const, join: 'round' as const };
      if (g.layout === 'circle') {
        // Drawn on, then held.
        const k = Math.min(1, l.s / 0.5);
        const rx = b.w * 0.65;
        const ry = b.h * 0.58;
        let d = '';
        for (let i = 0; i <= 48 * k; i++) {
          const ang = -Math.PI / 2 + (i / 48) * Math.PI * 2.05;
          d += `${i ? 'L' : 'M'}${(cx + Math.cos(ang) * rx).toFixed(1)} ${(cy + Math.sin(ang) * ry).toFixed(1)}`;
        }
        return [{ k: 'path', d, stroke: line, op: a.op }];
      }
      const lx = cx < w / 2 ? Math.min(w - safeX - w * 0.2, cx + b.w) : Math.max(safeX, cx - b.w - w * 0.2);
      const ly = Math.max(safeY + size, cy - b.h * 0.25);
      const end: [number, number] = [cx + (lx < cx ? -b.w * 0.25 : b.w * 0.25), cy];
      const start: [number, number] = [lx + (lx < cx ? w * 0.2 : 0), ly + size * 0.5];
      const ang = Math.atan2(end[1] - start[1], end[0] - start[0]);
      const hl = size * 0.5;
      items.push({ k: 'path', d: `M${start[0]} ${start[1]}Q${(start[0] + end[0]) / 2} ${start[1]} ${end[0]} ${end[1]}M${end[0] - Math.cos(ang - 0.5) * hl} ${end[1] - Math.sin(ang - 0.5) * hl}L${end[0]} ${end[1]}L${end[0] - Math.cos(ang + 0.5) * hl} ${end[1] - Math.sin(ang + 0.5) * hl}`, stroke: line });
      if (p.text) items.push({ k: 'text', text: p.text, x: lx, y: ly - size * 0.6, size: size * 0.6, family: font, weight: 700, color: textC, align: 'left', outline: { color: '#000000', width: size * 0.06 } });
      return [{ k: 'group', op: a.op, items }];
    }
  }
  return [];
}

/** World text: a sign, screen or chalkboard panel on the stage at (x, y) with width in stage units. */
export function worldTextItems(st: WorldTextStyle, p: { text: string; x: number; y: number; width: number }, view: Mat): Item[] {
  const size = p.width * 0.12;
  const m = measureText(p.text, size, p.width * 0.86);
  const hgt = m.height + size * 1.2;
  const x = p.x - p.width / 2;
  const y = p.y - hgt / 2;
  const look = st.panel === 'screen' ? { bg: st.background ?? '#101820', fg: st.text ?? '#7FF0FF', weight: 600 } : st.panel === 'chalk' ? { bg: st.background ?? '#2F4A3A', fg: st.text ?? '#F2F2E8', weight: 500 } : { bg: st.background ?? '#F4E3C1', fg: st.text ?? '#3A2A1E', weight: 800 };
  return [{
    k: 'group', tf: view, items: [
      { k: 'rect', x, y, w: p.width, h: hgt, r: st.panel === 'sign' ? size * 0.2 : 2, fill: { color: look.bg }, stroke: { paint: { color: st.panel === 'chalk' ? '#6B4B34' : '#2A2A2A' }, width: size * 0.12 } },
      { k: 'text', text: p.text, x: p.x, y: y + size * 0.6, size, family: st.font ?? 'Inter', weight: look.weight, color: look.fg, align: 'center', maxWidth: p.width * 0.9, lineHeight: 1.2, ...(st.panel === 'screen' ? { shadow: { color: look.fg, blur: size * 0.3, dx: 0, dy: 0 } } : {}) },
    ],
  }];
}
