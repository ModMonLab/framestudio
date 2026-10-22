/**
 * Image import (SRS §4.4, FR-IMP-01): PNG, JPEG and WebP are recognised by their signatures and measured from their
 * headers; SVG is parsed as data — never rendered by a browser engine, never executed — into a vector drawing of
 * paths with solid paint, grouped into layers (top-level groups). Scripts, external references, embedded images,
 * entities and DTDs are refused or dropped with a warning.
 */
import { XMLParser } from 'fast-xml-parser';
import { FrameError } from '@frame/schema';

export const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 16_384;

export interface RasterInfo {
  format: 'png' | 'jpeg' | 'webp';
  ext: 'png' | 'jpg' | 'webp';
  mime: string;
  width: number;
  height: number;
}

const bad = (message: string, details?: unknown) => new FrameError('VALIDATION_FAILED', message, details, 'Import a PNG, JPEG, WebP or SVG file.');

/** Recognises a raster image and reads its pixel size from the header. */
export function sniffRaster(b: Uint8Array): RasterInfo | undefined {
  const u32be = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0;
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u16le = (i: number) => b[i]! | (b[i + 1]! << 8);
  const u24le = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { format: 'png', ext: 'png', mime: 'image/png', width: u32be(16), height: u32be(20) };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    // Walk segments to the first start-of-frame marker.
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return undefined;
      const marker = b[i + 1]!;
      const len = u16be(i + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) return { format: 'jpeg', ext: 'jpg', mime: 'image/jpeg', width: u16be(i + 7), height: u16be(i + 5) };
      i += 2 + len;
    }
    return undefined;
  }
  if (b.length >= 30 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') {
    const chunk = String.fromCharCode(...b.subarray(12, 16));
    if (chunk === 'VP8X') return { format: 'webp', ext: 'webp', mime: 'image/webp', width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { format: 'webp', ext: 'webp', mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') return { format: 'webp', ext: 'webp', mime: 'image/webp', width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
  }
  return undefined;
}

export function checkRaster(b: Uint8Array): RasterInfo {
  if (b.byteLength > MAX_IMAGE_BYTES) throw bad(`The image is ${(b.byteLength / 1e6).toFixed(1)} MB; the limit is ${MAX_IMAGE_BYTES / 1e6} MB`);
  const info = sniffRaster(b);
  if (!info) throw bad('The file is not a PNG, JPEG or WebP image (its contents do not match any of these formats)');
  if (!(info.width > 0 && info.height > 0) || info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) throw bad(`The image is ${info.width} × ${info.height} px; sides must be 1–${MAX_IMAGE_SIDE} px`);
  return info;
}

/* ------------------------------------------------------------------ SVG */

/** Affine matrix [a, b, c, d, e, f] (SVG matrix order). */
export type Affine = [number, number, number, number, number, number];

export interface VectorShape {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  evenOdd?: boolean;
  tf?: Affine;
}

export interface VectorLayer {
  /** Layer name from id, data-name or inkscape:label (used by the rigging assistant's name mapping). */
  name: string;
  shapes: VectorShape[];
  /** Bounding box in drawing units [x, y, w, h] (approximate: transformed control points). */
  bounds: [number, number, number, number];
}

export interface VectorDrawing {
  width: number;
  height: number;
  /** viewBox origin; shapes are in viewBox units. */
  viewBox: [number, number, number, number];
  layers: VectorLayer[];
}

const ID: Affine = [1, 0, 0, 1, 0, 0];
const mul = (m: Affine, n: Affine): Affine => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function parseTransform(s: string | undefined): Affine {
  let m: Affine = ID;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(s))) {
    const a = x[2]!.split(/[\s,]+/).filter(Boolean).map(Number);
    if (a.some((n) => !Number.isFinite(n))) continue;
    let t: Affine = ID;
    switch (x[1]) {
      case 'matrix': if (a.length === 6) t = a as Affine; break;
      case 'translate': t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; break;
      case 'scale': t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const c = Math.cos(r);
        const sn = Math.sin(r);
        t = [c, sn, -sn, c, 0, 0];
        if (a.length === 3) t = mul(mul([1, 0, 0, 1, a[1]!, a[2]!], t), [1, 0, 0, 1, -a[1]!, -a[2]!]);
        break;
      }
      case 'skewX': t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
  }
  return m;
}

const NAMED: Record<string, string> = { black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', gray: '#808080', grey: '#808080', orange: '#FFA500', purple: '#800080', brown: '#A52A2A', pink: '#FFC0CB' };
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();

/** A paint value as #RRGGBB, 'none', or undefined (inherit / unsupported). */
function color(v: string | undefined, gradients: Map<string, string>): string | undefined {
  if (v === undefined) return undefined;
  const s = v.trim();
  if (s === 'none' || s === 'transparent') return 'none';
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s.slice(1).split('').map((c) => c + c).join('')}`.toUpperCase();
  const rgb = s.match(/^rgba?\(\s*([\d.]+)%?\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?/i);
  if (rgb) return `#${hex2(Number(rgb[1]))}${hex2(Number(rgb[2]))}${hex2(Number(rgb[3]))}`;
  const url = s.match(/^url\(\s*#([^)\s]+)\s*\)/);
  if (url) return gradients.get(url[1]!);
  return NAMED[s.toLowerCase()];
}

function styleOf(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...attrs };
  for (const decl of (attrs.style ?? '').split(';')) {
    const i = decl.indexOf(':');
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

const num = (v: string | undefined, d = 0) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : d;
};

function shapeD(tag: string, a: Record<string, string>): string | undefined {
  switch (tag) {
    case 'path': return a.d && /^[\sMmLlHhVvCcSsQqTtAaZz0-9eE.,+-]+$/.test(a.d) ? a.d : undefined;
    case 'rect': {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      if (!(w > 0 && h > 0)) return undefined;
      const r = Math.min(num(a.rx, num(a.ry)), w / 2, h / 2);
      if (r <= 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(a.cx), cy = num(a.cy);
      const rx = tag === 'circle' ? num(a.r) : num(a.rx);
      const ry = tag === 'circle' ? num(a.r) : num(a.ry);
      if (!(rx > 0 && ry > 0)) return undefined;
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'line': return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
    case 'polyline':
    case 'polygon': {
      const p = (a.points ?? '').trim().split(/[\s,]+/).map(Number);
      if (p.length < 4 || p.some((n) => !Number.isFinite(n))) return undefined;
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      return tag === 'polygon' ? d + 'Z' : d;
    }
    default: return undefined;
  }
}

/** Absolute end and control points of a path (the control polygon contains the curve, so it bounds it). */
function pathPoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  const ARGS: Record<string, number> = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0;
  let cmd = 'M';
  while (i < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    const C = cmd.toUpperCase();
    const rel = cmd !== C;
    const n = ARGS[C];
    if (n === undefined) break;
    if (n === 0) {
      cx = sx;
      cy = sy;
      continue;
    }
    const a = tokens.slice(i, i + n).map(Number);
    if (a.length < n || a.some((x) => !Number.isFinite(x))) break;
    i += n;
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    if (C === 'H') cx = ox + a[0]!;
    else if (C === 'V') cy = (rel ? cy : 0) + a[0]!;
    else if (C === 'A') {
      // An arc stays within its radii of either end point: a safe, slightly loose bound.
      for (const [px, py] of [[cx, cy], [ox + a[5]!, oy + a[6]!]] as [number, number][]) out.push([px - a[0]!, py - a[1]!], [px + a[0]!, py + a[1]!]);
      cx = ox + a[5]!;
      cy = oy + a[6]!;
    } else {
      for (let k = 0; k < n; k += 2) out.push([ox + a[k]!, oy + a[k + 1]!]);
      cx = ox + a[n - 2]!;
      cy = oy + a[n - 1]!;
    }
    if (C === 'H' || C === 'V' || C === 'A') out.push([cx, cy]);
    if (C === 'M') {
      sx = cx;
      sy = cy;
      cmd = rel ? 'l' : 'L';
    }
  }
  return out;
}

const DROPPED = new Set(['script', 'foreignObject', 'image', 'use', 'text', 'style', 'filter', 'mask', 'clipPath', 'pattern', 'symbol', 'marker', 'a', 'iframe', 'video', 'audio', 'animate', 'set', 'animateTransform', 'animateMotion']);

export interface SvgResult {
  drawing: VectorDrawing;
  warnings: string[];
}

/** Parses an SVG document into layers of paths. Throws on malformed or unsafe documents. */
export function parseSvg(text: string): SvgResult {
  if (text.length > 16 * 1024 * 1024) throw bad('The SVG is larger than 16 MB');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw bad('SVG files with a DOCTYPE or entities are not accepted (they can expand to unbounded size)');
  let doc: unknown[];
  try {
    doc = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', processEntities: false, allowBooleanAttributes: true }).parse(text) as unknown[];
  } catch (e) {
    throw bad(`The SVG is not well-formed XML: ${(e as Error).message}`);
  }
  type Node = Record<string, unknown> & { ':@'?: Record<string, string> };
  const tagOf = (n: Node) => Object.keys(n).find((k) => k !== ':@')!;
  const root = (doc as Node[]).find((n) => tagOf(n) === 'svg');
  if (!root) throw bad('The file has no <svg> root element');
  const ra = root[':@'] ?? {};
  const vb = (ra.viewBox ?? '').split(/[\s,]+/).map(Number);
  const width = num(ra.width, vb[2] ?? 0);
  const height = num(ra.height, vb[3] ?? 0);
  const viewBox: [number, number, number, number] = vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0 ? [vb[0]!, vb[1]!, vb[2]!, vb[3]!] : [0, 0, width, height];
  if (!(viewBox[2] > 0 && viewBox[3] > 0)) throw bad('The SVG has no size (width/height or viewBox)');
  const warnings = new Set<string>();

  // Gradients are approximated by their first stop colour (solid paint).
  const gradients = new Map<string, string>();
  const scanDefs = (nodes: Node[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      const kids = (n[tag] as Node[]) ?? [];
      if ((tag === 'linearGradient' || tag === 'radialGradient') && n[':@']?.id) {
        const stop = kids.find((k) => tagOf(k) === 'stop');
        const st = stop ? styleOf(stop[':@'] ?? {}) : {};
        const c = color(st['stop-color'], new Map());
        if (c && c !== 'none') gradients.set(n[':@'].id, c);
        warnings.add('Gradients are imported as solid colours');
      }
      if (Array.isArray(kids)) scanDefs(kids);
    }
  };
  scanDefs((root.svg as Node[]) ?? []);

  interface Inherited { fill: string | undefined; stroke: string | undefined; strokeWidth: number; opacity: number; tf: Affine; evenOdd: boolean }
  const layers: VectorLayer[] = [];
  const walk = (nodes: Node[], inh: Inherited, out: VectorShape[]) => {
    for (const n of nodes) {
      const tag = tagOf(n);
      if (tag === '#text' || tag === '?xml' || tag === '#comment' || tag === 'defs' || tag === 'title' || tag === 'desc' || tag === 'metadata' || tag === 'linearGradient' || tag === 'radialGradient') continue;
      if (DROPPED.has(tag)) {
        warnings.add(`<${tag}> elements are not imported`);
        continue;
      }
      const a = styleOf(n[':@'] ?? {});
      if (a.display === 'none' || a.visibility === 'hidden') continue;
      const tf = mul(inh.tf, parseTransform(a.transform));
      const fill = a.fill !== undefined ? color(a.fill, gradients) : inh.fill;
      if (a.fill !== undefined && fill === undefined) warnings.add(`Unsupported paint "${a.fill}" replaced`);
      const stroke = a.stroke !== undefined ? color(a.stroke, gradients) : inh.stroke;
      const next: Inherited = {
        fill, stroke,
        strokeWidth: a['stroke-width'] !== undefined ? num(a['stroke-width'], 1) : inh.strokeWidth,
        opacity: inh.opacity * num(a.opacity, 1) * num(a['fill-opacity'], 1),
        tf,
        evenOdd: a['fill-rule'] ? a['fill-rule'] === 'evenodd' : inh.evenOdd,
      };
      if (tag === 'g' || tag === 'svg') {
        walk((n[tag] as Node[]) ?? [], next, out);
        continue;
      }
      const d = shapeD(tag, a);
      if (!d) {
        if (!['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tag)) warnings.add(`<${tag}> elements are not imported`);
        continue;
      }
      const f = next.fill === undefined ? '#000000' : next.fill;
      const s = next.stroke;
      if (f === 'none' && (!s || s === 'none')) continue;
      out.push({
        d,
        ...(f !== 'none' ? { fill: f } : {}),
        ...(s && s !== 'none' ? { stroke: s, strokeWidth: next.strokeWidth } : {}),
        ...(next.opacity < 1 ? { opacity: Math.max(0, next.opacity) } : {}),
        ...(next.evenOdd ? { evenOdd: true } : {}),
        ...(tf.some((v, i) => v !== ID[i]) ? { tf } : {}),
      });
    }
  };
  const base: Inherited = { fill: undefined, stroke: undefined, strokeWidth: 1, opacity: 1, tf: ID, evenOdd: false };
  const loose: VectorShape[] = [];
  let n = 0;
  for (const child of (root.svg as Node[]) ?? []) {
    const tag = tagOf(child);
    if (tag === 'g') {
      const a = child[':@'] ?? {};
      const shapes: VectorShape[] = [];
      walk([child], base, shapes);
      n++;
      if (shapes.length) layers.push({ name: a['inkscape:label'] ?? a['data-name'] ?? a.id ?? `Layer ${n}`, shapes, bounds: [0, 0, 0, 0] });
    } else walk([child], base, loose);
  }
  if (loose.length) layers.unshift({ name: 'Background', shapes: loose, bounds: [0, 0, 0, 0] });
  if (!layers.length) throw bad('The SVG contains no shapes Frame can import (paths, rectangles, circles, ellipses, lines, polygons)');
  for (const l of layers) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of l.shapes) for (const [px, py] of pathPoints(s.d)) {
      const [x, y] = apply(s.tf ?? ID, px, py);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    l.bounds = Number.isFinite(x0) ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0];
  }
  return { drawing: { width: width || viewBox[2], height: height || viewBox[3], viewBox, layers }, warnings: [...warnings] };
}
