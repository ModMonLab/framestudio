/**
 * Part editing helpers (FR-PED-01/04): pure operations the part editor applies to part data — moving points or
 * their parameter bindings, mirroring and copying views, and drafting the other style family from one family.
 */
import type { FamilyArt, FillDef, LayerDef, MPoint, PartData, ShapeDef, ViewArt } from './types.js';
import { evalPoint, type Params } from './geometry.js';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Moves a point so it evaluates to `target` under `params`. With `binding`, only that parameter's delta changes
 * (per unit of the parameter's value), which is how a slider's effect on a point is drawn (FR-PED-01 bindings).
 */
export function movePoint(mp: MPoint, params: Params, target: [number, number], binding?: string): MPoint {
  const now = evalPoint(mp, params);
  const dx = target[0] - now[0];
  const dy = target[1] - now[1];
  const out = clone(mp);
  if (binding) {
    const w = params[binding] ?? 0;
    if (Math.abs(w) < 1e-6) return out; // a binding can only be drawn with the parameter away from its rest value
    const d = out.d?.[binding] ?? [0, 0];
    out.d = { ...(out.d ?? {}), [binding]: [round(d[0] + dx / w), round(d[1] + dy / w)] };
    return out;
  }
  out.p = [round(mp.p[0] + dx), round(mp.p[1] + dy)];
  return out;
}

/** Point names used by shapes, ellipses, gradients and clips of a view. */
export function usedPoints(art: ViewArt): Set<string> {
  const used = new Set<string>();
  const fill = (f: FillDef | undefined) => {
    if (f && typeof f !== 'string') {
      if ('lin' in f) used.add(f.lin.from).add(f.lin.to);
      else used.add(f.rad.c);
    }
  };
  for (const l of art.layers) for (const s of l.shapes ?? []) {
    for (const seg of s.path ?? []) for (const r of seg.slice(1) as string[]) used.add(r);
    if (s.ellipse) used.add(s.ellipse.c);
    fill(s.fill);
  }
  return used;
}

/** A fresh point name not used in the view (`p1`, `p2`, …). */
export function newPointName(art: ViewArt, prefix = 'p'): string {
  let i = Object.keys(art.points).length + 1;
  while (art.points[`${prefix}${i}`]) i++;
  return `${prefix}${i}`;
}

/** Mirrors a view left↔right: point and anchor u flip sign, as do u deltas; L/R anchor names swap. */
export function mirrorView(art: ViewArt): ViewArt {
  const out = clone(art);
  for (const mp of Object.values(out.points)) {
    mp.p = [round(-mp.p[0]), mp.p[1]];
    if (mp.d) for (const k of Object.keys(mp.d)) mp.d[k] = [round(-mp.d[k]![0]), mp.d[k]![1]];
  }
  for (const l of out.layers) for (const s of l.shapes ?? []) if (s.art) s.art.box = [-s.art.box[2], s.art.box[1], -s.art.box[0], s.art.box[3]];
  if (out.anchors) {
    const swapped: NonNullable<ViewArt['anchors']> = {};
    for (const [name, a] of Object.entries(out.anchors)) {
      const n = name.endsWith('L') ? `${name.slice(0, -1)}R` : name.endsWith('R') ? `${name.slice(0, -1)}L` : name;
      swapped[n] = { ...a, at: [round(-a.at[0]), a.at[1]] };
    }
    out.anchors = swapped;
  }
  return out;
}

/* ------------------------------------------------------------------ family conversion (FR-PED-04) */

const SHADE = /\.(shade|deep)$/;
const baseSlot = (c: string) => c.replace(/\.(shade|deep|light)$/, '');

function topBottom(s: ShapeDef, art: ViewArt): [string, string] | undefined {
  const names = [...new Set((s.path ?? []).flatMap((seg) => seg.slice(1) as string[]))].filter((n) => art.points[n]);
  if (names.length < 2) return undefined;
  const sorted = names.sort((a, b) => art.points[a]!.p[1] - art.points[b]!.p[1]);
  return [sorted[0]!, sorted[sorted.length - 1]!];
}

function toIllustrated(art: ViewArt): ViewArt {
  const out = clone(art);
  for (const l of out.layers) {
    for (const s of l.shapes ?? []) {
      // Soft painted shading: palette fills become a light-to-shade gradient down the shape.
      if (typeof s.fill === 'string' && !s.fill.startsWith('#') && !SHADE.test(s.fill) && s.path) {
        const tb = topBottom(s, out);
        if (tb) s.fill = { lin: { from: tb[0], to: tb[1], stops: [[0, `${baseSlot(s.fill)}.light`], [0.55, s.fill], [1, `${baseSlot(s.fill)}.shade`]] } };
      }
      // Thin warm line work.
      if (!s.stroke && typeof s.fill !== 'undefined' && s.path && !s.blend) s.stroke = { c: 'line', w: 0.6, cap: 'round' };
    }
  }
  return out;
}

function toFlat(art: ViewArt): ViewArt {
  const out = clone(art);
  for (const l of out.layers) {
    // Cel shading with one shadow tone: shade-only and multiply shapes go; gradients become their base colour.
    l.shapes = (l.shapes ?? []).filter((s) => !(s.blend === 'multiply' || (typeof s.fill === 'string' && SHADE.test(s.fill) && !s.stroke)));
    for (const s of l.shapes) {
      if (s.fill && typeof s.fill !== 'string') {
        const stops = 'lin' in s.fill ? s.fill.lin.stops : s.fill.rad.stops;
        s.fill = baseSlot(stops[Math.floor(stops.length / 2)]![1]);
      }
      if (s.stroke && s.stroke.c === 'line' && s.stroke.w < 1) delete s.stroke;
    }
  }
  out.layers = out.layers.filter((l: LayerDef) => l.limb || (l.shapes ?? []).length > 0);
  return out;
}

/**
 * Drafts the other family from one family's artwork (FR-PED-04): Illustrated gains gradient shading and thin line
 * work; Flat loses shade layers and gradients. The result is a starting point for review, never saved unreviewed.
 */
export function convertFamily(from: FamilyArt, to: 'flat' | 'illustrated'): FamilyArt {
  const conv = to === 'illustrated' ? toIllustrated : toFlat;
  const views: FamilyArt['views'] = {};
  for (const [v, art] of Object.entries(from.views)) if (art) views[v as keyof FamilyArt['views']] = conv(art);
  return { views, ...(from.exempt ? { exempt: clone(from.exempt) } : {}) };
}

/** A duplicate of a part for "new part from existing" (FR-PED-02). */
export function duplicatePart(p: PartData): PartData {
  return clone(p);
}
