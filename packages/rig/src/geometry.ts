import type { Paint } from '@frame/render';
import type { FillDef, MPoint, Seg, ShapeDef } from './types.js';

export type Pt = [number, number];
export type Mapper = (u: number, v: number) => Pt;
export type Params = Record<string, number>;

/** Evaluates a control point: base + Σ delta·param (FR-CHR-02 parametric parts). */
export function evalPoint(mp: MPoint, params: Params): Pt {
  let x = mp.p[0];
  let y = mp.p[1];
  if (mp.d) {
    for (const k in mp.d) {
      const w = params[k];
      if (w) {
        const d = mp.d[k]!;
        x += d[0] * w;
        y += d[1] * w;
      }
    }
  }
  return [x, y];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;

export function buildPath(segs: Seg[], points: Record<string, MPoint>, params: Params, map: Mapper, missing: (name: string) => void): string {
  const at = (name: string): Pt => {
    const mp = points[name];
    if (!mp) {
      missing(name);
      return map(0, 0);
    }
    const [u, v] = evalPoint(mp, params);
    return map(u, v);
  };
  const out: string[] = [];
  for (const s of segs) {
    switch (s[0]) {
      case 'M': out.push(`M ${fmt(at(s[1]))}`); break;
      case 'L': out.push(`L ${fmt(at(s[1]))}`); break;
      case 'Q': out.push(`Q ${fmt(at(s[1]))} ${fmt(at(s[2]))}`); break;
      case 'C': out.push(`C ${fmt(at(s[1]))} ${fmt(at(s[2]))} ${fmt(at(s[3]))}`); break;
      case 'Z': out.push('Z'); break;
    }
  }
  return out.join(' ');
}

const KAPPA = 0.5522847498;

/** Ellipse as four cubic arcs, mapped point-by-point through the fit space. */
export function ellipsePath(shape: NonNullable<ShapeDef['ellipse']>, points: Record<string, MPoint>, params: Params, map: Mapper, missing: (n: string) => void): string {
  const mp = points[shape.c];
  if (!mp) missing(shape.c);
  const [cu, cv] = mp ? evalPoint(mp, params) : [0, 0];
  let rx = shape.rx;
  let ry = shape.ry;
  for (const k in shape.drx ?? {}) rx += (shape.drx![k] ?? 0) * (params[k] ?? 0);
  for (const k in shape.dry ?? {}) ry += (shape.dry![k] ?? 0) * (params[k] ?? 0);
  rx = Math.max(0.0001, rx);
  ry = Math.max(0.0001, ry);
  const P = (u: number, v: number) => fmt(map(cu + u, cv + v));
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return [
    `M ${P(rx, 0)}`,
    `C ${P(rx, ky)} ${P(kx, ry)} ${P(0, ry)}`,
    `C ${P(-kx, ry)} ${P(-rx, ky)} ${P(-rx, 0)}`,
    `C ${P(-rx, -ky)} ${P(-kx, -ry)} ${P(0, -ry)}`,
    `C ${P(kx, -ry)} ${P(rx, -ky)} ${P(rx, 0)} Z`,
  ].join(' ');
}

/* ------------------------------------------------------------------ colour */

export function hexToRgb(h: string): [number, number, number] {
  const m = h.match(/^#([0-9a-f]{6})/i);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

/** f < 1 darkens toward black, f > 1 lightens toward white. */
export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const ch = (x: number) => (f < 1 ? x * f : x + (255 - x) * (f - 1));
  return rgbToHex(ch(r), ch(g), ch(b));
}

export function withAlpha(hex: string, a: number): string {
  const al = Math.max(0, Math.min(255, Math.round(a * 255))).toString(16).padStart(2, '0');
  return `${hex.slice(0, 7)}${al}`.toUpperCase();
}

export type Palette = Record<string, string>;

export function resolveColor(ref: string, palette: Palette): string {
  if (ref.startsWith('#')) return ref;
  const direct = palette[ref];
  if (direct) return direct;
  const [base, mod] = ref.split('.') as [string, string | undefined];
  const b = palette[base];
  if (!b) return '#FF00FF';
  switch (mod) {
    case 'shade': return palette[`${base}.shade`] ?? shade(b, 0.82);
    case 'deep': return shade(b, 0.66);
    case 'light': return shade(b, 1.14);
    case 'line': return shade(b, 0.5);
    case 'soft': return mix(b, palette.skin ?? b, 0.5);
    default: return b;
  }
}

export function resolveFill(f: FillDef, palette: Palette, at: (name: string) => Pt, op = 1): Paint {
  const col = (c: string) => (op >= 1 ? resolveColor(c, palette) : withAlpha(resolveColor(c, palette), op));
  if (typeof f === 'string') return { color: col(f) };
  if ('lin' in f) {
    return { linear: { from: at(f.lin.from), to: at(f.lin.to), stops: f.lin.stops.map(([o, c]) => ({ offset: o, color: col(c) })) } };
  }
  return { radial: { center: at(f.rad.c), radius: f.rad.r, stops: f.rad.stops.map(([o, c]) => ({ offset: o, color: col(c) })) } };
}

/** Path for a tapered limb through 2–3 joints with round ends (clean bends without tearing). */
export function limbPath(pts: Pt[], widths: number[]): string {
  // Build offset polylines on both sides, joining with round caps via arcs.
  const n = pts.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(n - 1, i + 1)]!;
    let dx = next[0] - prev[0];
    let dy = next[1] - prev[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const w = widths[i]! / 2;
    left.push([pts[i]![0] - dy * w, pts[i]![1] + dx * w]);
    right.push([pts[i]![0] + dy * w, pts[i]![1] - dx * w]);
  }
  const wEnd = widths[n - 1]! / 2;
  const wStart = widths[0]! / 2;
  const s: string[] = [`M ${fmt(left[0]!)}`];
  for (let i = 1; i < n; i++) {
    // Smooth through the middle point with a quadratic.
    if (i < n - 1) {
      const mid: Pt = [(left[i]![0] + left[i + 1]![0]) / 2, (left[i]![1] + left[i + 1]![1]) / 2];
      s.push(`Q ${fmt(left[i]!)} ${fmt(mid)}`);
    } else s.push(`L ${fmt(left[i]!)}`);
  }
  s.push(`A ${r2(wEnd)} ${r2(wEnd)} 0 0 0 ${fmt(right[n - 1]!)}`);
  for (let i = n - 2; i >= 0; i--) {
    if (i > 0) {
      const mid: Pt = [(right[i]![0] + right[i - 1]![0]) / 2, (right[i]![1] + right[i - 1]![1]) / 2];
      s.push(`Q ${fmt(right[i]!)} ${fmt(mid)}`);
    } else s.push(`L ${fmt(right[i]!)}`);
  }
  s.push(`A ${r2(wStart)} ${r2(wStart)} 0 0 0 ${fmt(left[0]!)} Z`);
  return s.join(' ');
}

/** Point along a polyline at parameter t ∈ [0,1] where each segment covers an equal share. */
export function along(pts: Pt[], t: number): Pt {
  const segs = pts.length - 1;
  const x = Math.max(0, Math.min(1, t)) * segs;
  const i = Math.min(segs - 1, Math.floor(x));
  const f = x - i;
  const a = pts[i]!;
  const b = pts[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Sub-polyline between t0 and t1 (keeps interior joints). */
export function subChain(pts: Pt[], t0: number, t1: number): Pt[] {
  const segs = pts.length - 1;
  const out: Pt[] = [along(pts, t0)];
  for (let i = 1; i < segs; i++) {
    const ti = i / segs;
    if (ti > t0 && ti < t1) out.push(pts[i]!);
  }
  out.push(along(pts, t1));
  return out;
}
