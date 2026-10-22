/** Hairstyles (A9) with hair controls (A9b): volume, length, curl, parting; front/back layers for four views. */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, lin, type D, type PS } from '../dsl.js';

export interface HairSpec {
  /** Crown height above the head top (fraction of head half-height). */
  lift: number;
  /** Outward offset of the cap from the head outline. */
  puff: number;
  /** Hairline height (v) at the forehead centre; lower = more forehead covered. */
  hairline: number;
  /** How far down the hair covers the temples (v). */
  temple: number;
  /** Back hair length (v below head centre; 0 = none). */
  back: number;
  /** Width of the back hair at its end (u). */
  backW: number;
  bun?: { u: number; v: number; r: number };
  pony?: boolean;
  pigtails?: boolean;
  curls?: number;
  spikes?: number;
  shaved?: boolean;
  cover?: 'wrap' | 'hijab' | 'durag';
  locs?: boolean;
  braids?: boolean;
  part?: number;
  receding?: boolean;
  undercut?: boolean;
  bald?: boolean;
}

const S = (o: Partial<HairSpec>): HairSpec => ({ lift: 0.12, puff: 0.06, hairline: -0.5, temple: 0.05, back: 0.35, backW: 0.95, ...o });

export const HAIR_STYLES: Record<string, HairSpec> = {
  buzz: S({ lift: 0.02, puff: 0.02, hairline: -0.55, temple: 0.1, back: 0.35, shaved: true }),
  'crew-cut': S({ lift: 0.08, puff: 0.04, hairline: -0.58, temple: 0.0, back: 0.3 }),
  crop: S({ lift: 0.12, puff: 0.05, hairline: -0.45, temple: -0.05, back: 0.3, part: 0.3 }),
  undercut: S({ lift: 0.22, puff: 0.07, hairline: -0.5, temple: -0.2, back: 0.15, undercut: true, part: 0.35 }),
  fade: S({ lift: 0.14, puff: 0.05, hairline: -0.55, temple: -0.1, back: 0.25, undercut: true }),
  spiky: S({ lift: 0.2, puff: 0.06, hairline: -0.5, temple: -0.05, back: 0.3, spikes: 7 }),
  'slick-back': S({ lift: 0.16, puff: 0.04, hairline: -0.68, temple: -0.05, back: 0.4 }),
  'side-part': S({ lift: 0.14, puff: 0.06, hairline: -0.45, temple: 0.0, back: 0.35, part: -0.35 }),
  'short-curls': S({ lift: 0.18, puff: 0.12, hairline: -0.5, temple: 0.05, back: 0.4, curls: 10 }),
  shaved: S({ lift: 0.0, puff: 0.0, hairline: -0.6, temple: 0.1, back: 0.3, shaved: true }),
  bob: S({ lift: 0.16, puff: 0.12, hairline: -0.4, temple: 0.3, back: 0.82, backW: 1.18 }),
  lob: S({ lift: 0.16, puff: 0.1, hairline: -0.42, temple: 0.35, back: 1.35, backW: 1.15 }),
  shag: S({ lift: 0.2, puff: 0.14, hairline: -0.35, temple: 0.4, back: 1.2, backW: 1.22, spikes: 5 }),
  mop: S({ lift: 0.24, puff: 0.16, hairline: -0.2, temple: 0.35, back: 0.7, backW: 1.18, curls: 8 }),
  'wavy-medium': S({ lift: 0.16, puff: 0.12, hairline: -0.42, temple: 0.35, back: 1.3, backW: 1.25, curls: 6 }),
  mullet: S({ lift: 0.14, puff: 0.06, hairline: -0.45, temple: 0.0, back: 1.4, backW: 0.95 }),
  curtains: S({ lift: 0.16, puff: 0.08, hairline: -0.38, temple: 0.25, back: 0.7, backW: 1.08, part: 0 }),
  pixie: S({ lift: 0.14, puff: 0.06, hairline: -0.35, temple: 0.15, back: 0.35, part: 0.35 }),
  'afro-medium': S({ lift: 0.45, puff: 0.35, hairline: -0.5, temple: 0.25, back: 0.6, backW: 1.35, curls: 14 }),
  'two-strand-twists': S({ lift: 0.3, puff: 0.2, hairline: -0.5, temple: 0.3, back: 1.0, backW: 1.25, locs: true }),
  'straight-long': S({ lift: 0.14, puff: 0.08, hairline: -0.45, temple: 0.4, back: 2.6, backW: 1.2, part: 0 }),
  'wavy-long': S({ lift: 0.16, puff: 0.1, hairline: -0.45, temple: 0.4, back: 2.5, backW: 1.35, curls: 6, part: 0.25 }),
  'curly-long': S({ lift: 0.3, puff: 0.22, hairline: -0.42, temple: 0.45, back: 2.3, backW: 1.55, curls: 16 }),
  braids: S({ lift: 0.1, puff: 0.04, hairline: -0.55, temple: 0.1, back: 2.4, backW: 0.7, braids: true, part: 0 }),
  'box-braids': S({ lift: 0.14, puff: 0.06, hairline: -0.55, temple: 0.25, back: 2.6, backW: 1.3, locs: true }),
  ponytail: S({ lift: 0.1, puff: 0.04, hairline: -0.6, temple: 0.0, back: 0.2, pony: true }),
  'high-bun': S({ lift: 0.08, puff: 0.04, hairline: -0.62, temple: 0.0, back: 0.2, bun: { u: 0.05, v: -1.3, r: 0.42 } }),
  'low-bun': S({ lift: 0.08, puff: 0.04, hairline: -0.6, temple: 0.0, back: 0.3, bun: { u: -0.6, v: 0.45, r: 0.36 } }),
  'top-knot': S({ lift: 0.08, puff: 0.04, hairline: -0.6, temple: -0.05, back: 0.2, bun: { u: 0.0, v: -1.25, r: 0.3 }, undercut: true }),
  'half-up': S({ lift: 0.12, puff: 0.06, hairline: -0.5, temple: 0.3, back: 2.0, backW: 1.15, bun: { u: -0.45, v: -0.6, r: 0.25 } }),
  pigtails: S({ lift: 0.1, puff: 0.04, hairline: -0.5, temple: 0.15, back: 0.25, pigtails: true, part: 0 }),
  locs: S({ lift: 0.2, puff: 0.14, hairline: -0.5, temple: 0.3, back: 2.2, backW: 1.45, locs: true }),
  cornrows: S({ lift: 0.02, puff: 0.02, hairline: -0.62, temple: 0.05, back: 0.35, braids: true }),
  afro: S({ lift: 0.7, puff: 0.55, hairline: -0.5, temple: 0.35, back: 0.7, backW: 1.6, curls: 20 }),
  'side-swept-long': S({ lift: 0.14, puff: 0.08, hairline: -0.38, temple: 0.4, back: 2.4, backW: 1.25, part: -0.5 }),
  bald: S({ lift: 0, puff: 0, hairline: -1.2, temple: -1, back: 0, bald: true }),
  receding: S({ lift: 0.04, puff: 0.03, hairline: -0.82, temple: 0.15, back: 0.4, receding: true }),
  headwrap: S({ lift: 0.45, puff: 0.12, hairline: -0.55, temple: -0.1, back: 0.2, cover: 'wrap' }),
  hijab: S({ lift: 0.18, puff: 0.18, hairline: -0.62, temple: 0.9, back: 1.7, backW: 1.35, cover: 'hijab' }),
  durag: S({ lift: 0.06, puff: 0.05, hairline: -0.58, temple: 0.0, back: 0.45, cover: 'durag' }),
};

const VOL = (u: number, v: number): D => ({ 'hair.volume': [u * 0.12, v * 0.12], 'face.width': [u * 0.12, 0] });

function capFront(h: HairSpec, view: View): PS[] {
  const top = -1 - h.lift;
  const p = h.puff;
  const hl = h.hairline;
  const t = h.temple;
  if (view === 'front' || view === 'back') {
    const outer: PS[] = [
      [-(1.02 + p), t, VOL(-1, 0)],
      [-(1.04 + p), -0.45, VOL(-1, 0)],
      [-(0.72 + p * 0.8), -0.9 - h.lift * 0.6, VOL(-0.7, -0.6)],
      [0, top - p * 0.4, VOL(0, -1)],
      [0.72 + p * 0.8, -0.9 - h.lift * 0.6, VOL(0.7, -0.6)],
      [1.04 + p, -0.45, VOL(1, 0)],
      [1.02 + p, t, VOL(1, 0)],
    ];
    if (view === 'back') {
      return [...outer, [0.9, 0.5, VOL(0.9, 0)], [0, 0.62], [-0.9, 0.5, VOL(-0.9, 0)]];
    }
    const part = h.part ?? 0;
    const inner: PS[] = [
      [0.86, t - 0.05],
      [0.8, hl * 0.55],
      [0.35 + part * 0.2, hl - 0.04],
      [part * 0.5, hl + 0.02 + (h.part !== undefined ? -0.08 : 0)],
      [-0.35 + part * 0.2, hl - 0.02],
      [-0.8, hl * 0.55],
      [-0.86, t - 0.05],
    ];
    return [...outer, ...inner];
  }
  if (view === 'three') {
    return [
      [-(1.02 + p), 0.3 + Math.max(0, t), VOL(-1, 0)],
      [-(1.06 + p), -0.3, VOL(-1, 0)],
      [-(0.7 + p), -0.92 - h.lift * 0.6, VOL(-0.7, -0.6)],
      [0.1, top - p * 0.4, VOL(0, -1)],
      [0.8 + p * 0.7, -0.82 - h.lift * 0.5, VOL(0.7, -0.6)],
      [0.98 + p * 0.6, -0.35, VOL(0.8, 0)],
      [0.92, -0.2 + Math.min(0, t)],
      [0.75, hl * 0.7],
      [0.35, hl],
      [-0.1, hl * 0.8],
      [-0.45, -0.1],
      [-0.48, t + 0.15],
      [-0.7, 0.25],
    ];
  }
  // side (facing right)
  return [
    [-(1.0 + p), 0.25 + Math.max(0, t) * 0.5, VOL(-1, 0)],
    [-(1.02 + p), -0.4, VOL(-1, 0)],
    [-(0.55 + p), -0.95 - h.lift * 0.6, VOL(-0.6, -0.7)],
    [0.25, top - p * 0.3, VOL(0.2, -1)],
    [0.75 + p * 0.5, -0.78 - h.lift * 0.4, VOL(0.6, -0.5)],
    [0.82, hl * 0.9],
    [0.45, hl * 0.6],
    [0.1, -0.15],
    [0.12, t + 0.1],
    [-0.35, 0.3],
  ];
}

function backHair(h: HairSpec, view: View): PS[] | undefined {
  if (h.back <= 0.45 && !h.cover) return undefined;
  const L = h.back;
  const W = h.backW;
  const LD = (u: number): D => ({ 'hair.length': [0, 0.35 * Math.max(0, L - 0.5)], ...VOL(u, 0) });
  if (view === 'front' || view === 'back') {
    return [
      [-(1.06 + h.puff), -0.5, VOL(-1, 0)],
      [-(1.0 + h.puff * 1.1), -1.0 - h.lift * 0.5, VOL(-1, -1)],
      [0, -1.12 - h.lift, VOL(0, -1)],
      [1.0 + h.puff * 1.1, -1.0 - h.lift * 0.5, VOL(1, -1)],
      [1.06 + h.puff, -0.5, VOL(1, 0)],
      [W * 1.04, L * 0.55, VOL(W, 0)],
      [W, L, LD(W)],
      [0, L + 0.08, LD(0)],
      [-W, L, LD(-W)],
      [-W * 1.04, L * 0.55, VOL(-W, 0)],
    ];
  }
  const fwd = view === 'three' ? 0.15 : 0.0;
  return [
    [-(1.06 + h.puff), -0.6, VOL(-1, 0)],
    [-(0.6 + h.puff), -1.05 - h.lift * 0.6, VOL(-0.6, -1)],
    [0.3, -1.05 - h.lift * 0.5, VOL(0.3, -1)],
    [0.5 + fwd, -0.4],
    [0.2 + fwd, L * 0.6, LD(0.3)],
    [0.1 + fwd, L, LD(0.1)],
    [-W * 0.95, L + 0.05, LD(-W)],
    [-W * 1.1, L * 0.5, VOL(-W, 0)],
  ];
}

function hairArt(h: HairSpec, fam: StyleFamily, view: View) {
  const a = new Art('x');
  const ill = fam === 'illustrated';
  const fill = (from: string, to: string) => (ill ? lin(from, to, [[0, 'hair.light'], [0.5, 'hair'], [1, 'hair.shade']]) : 'hair');
  const g0 = a.pt([-0.4, -1.2], 'g0');
  const g1 = a.pt([0.5, 1.2], 'g1');
  const coverColor = h.cover ? 'acc' : 'hair';
  const cfill = h.cover ? (ill ? lin(g0, g1, [[0, 'acc.light'], [0.6, 'acc'], [1, 'acc.shade']]) : 'acc') : fill(g0, g1);
  const line = ill ? { stroke: { c: `${coverColor}.line`, w: 1 } } : {};

  if (h.bald) {
    if (ill) a.layer('hair.front', 'head', [{ ellipse: { c: a.pt([0.25, -0.7]), rx: 0.35, ry: 0.15 }, fill: 'skin.light', opacity: 0.6 }]);
    return a.build();
  }

  // Back layer (behind head and body).
  const back = backHair(h, view);
  const backShapes: ShapeDef[] = [];
  if (back) {
    backShapes.push({ id: 'back', path: a.smooth(back, true, 0.85), fill: h.cover ? cfill : fill(g0, g1), ...line });
    if (!h.cover) backShapes.push({ path: a.smooth(back, true, 0.85), fill: 'hair.shade', opacity: ill ? 0.45 : 0.55, clip: 'back' });
    if (!h.cover) backShapes.push({ path: a.smooth(back, true, 0.85), fill: 'hairGrey', opacity: 0.85, opacityParam: 'hair.grey' });
    if (h.locs || h.braids) {
      for (let i = -3; i <= 3; i++) {
        const u = (i / 3.4) * h.backW;
        backShapes.push({ path: a.path([['M', [u * 0.8, -0.2]], ['L', [u, h.back - 0.05, { 'hair.length': [0, 0.35] }]]]), stroke: { c: 'hair.deep', w: h.braids ? 1.4 : 2 }, opacity: 0.7, clip: 'back' });
      }
    }
  }
  if (h.bun && (view !== 'front' || h.bun.v < -0.8)) {
    const b = h.bun;
    const bu = view === 'side' ? b.u - 0.35 : view === 'three' ? b.u - 0.2 : view === 'back' ? -b.u : b.u;
    const behind = b.v > -0.8 && view !== 'back';
    const bunShapes: ShapeDef[] = [
      { id: 'bun', ellipse: { c: a.pt([bu, b.v, VOL(0, -1)]), rx: b.r, ry: b.r * 0.92 }, fill: fill(g0, g1), ...line },
      { path: a.path([['M', [bu - b.r * 0.6, b.v + b.r * 0.15]], ['Q', [bu, b.v - b.r * 0.4], [bu + b.r * 0.6, b.v + b.r * 0.15]]]), stroke: { c: 'hair.deep', w: 1.6 }, opacity: 0.7, clip: 'bun' },
      { ellipse: { c: a.pt([bu, b.v, VOL(0, -1)]), rx: b.r, ry: b.r * 0.92 }, fill: 'hairGrey', opacity: 0.85, opacityParam: 'hair.grey' },
    ];
    a.layer(behind ? 'hair.back' : 'hair.front', 'head', bunShapes);
  }
  if (h.pony) {
    const pu = view === 'front' ? 0 : view === 'back' ? 0 : -0.95;
    const pts: PS[] = view === 'front'
      ? [[-0.35, -0.9], [0.35, -0.9], [0.4, 0.9, { 'hair.length': [0, 0.4] }], [0, 1.4, { 'hair.length': [0, 0.6] }], [-0.4, 0.9, { 'hair.length': [0, 0.4] }]]
      : [[pu + 0.15, -0.55], [pu - 0.3, -0.75], [pu - 0.65, 0.2, { 'hair.length': [0, 0.3] }], [pu - 0.45, 1.3, { 'hair.length': [-0.1, 0.6] }], [pu - 0.1, 0.4]];
    a.layer('hair.back', 'head', [{ path: a.smooth(pts, true, 0.9), fill: fill(g0, g1), ...line }]);
  }
  if (h.pigtails && view !== 'side') {
    for (const s of view === 'three' ? [-1] : [-1, 1]) {
      a.layer('hair.back', 'head', [{ path: a.smooth([[s * 0.95, -0.35], [s * 1.35, -0.1], [s * 1.45, 0.8, { 'hair.length': [s * 0.1, 0.4] }], [s * 1.15, 1.0, { 'hair.length': [0, 0.45] }], [s * 1.0, 0.1]], true, 0.9), fill: fill(g0, g1), ...line }]);
    }
  }
  if (backShapes.length) a.layer('hair.back', 'head', backShapes);

  // Front cap.
  const cap = capFront(h, view);
  const capShapes: ShapeDef[] = [];
  if (h.shaved || h.receding) {
    capShapes.push({ id: 'cap', path: a.smooth(cap, true, 0.85), fill: h.shaved ? 'hair' : fill(g0, g1), opacity: h.shaved ? 0.55 : 1 });
  } else {
    capShapes.push({ id: 'cap', path: a.smooth(cap, true, 0.85), fill: h.cover ? cfill : fill(g0, g1), ...line });
    if (!h.cover) {
      // Shine band (Illustrated: soft highlight; Flat: one-tone highlight shape).
      const shine: PS[] = view === 'side'
        ? [[-0.6, -0.9], [0.1, -1.05], [0.3, -0.95], [-0.5, -0.78]]
        : [[-0.55, -0.92], [0.0, -1.08], [0.45, -0.95], [0.0, -0.95]];
      capShapes.push({ path: a.smooth(shine, true, 0.9), fill: 'hair.light', opacity: ill ? 0.55 : 0.8, clip: 'cap' });
      // Hair controls (Catalog A9b): highlights, greying, a parting, curl texture and flyaways.
      capShapes.push({ path: a.smooth(shine.map(([u, v]) => [u * 1.25, v + 0.12] as PS), true, 0.9), fill: 'hairHighlight', opacity: 0.6, opacityParam: 'hair.highlight', clip: 'cap' });
      capShapes.push({ path: a.smooth(cap, true, 0.85), fill: 'hairGrey', opacity: 0.85, opacityParam: 'hair.grey' });
      if (view !== 'back') {
        for (const [opt, pu] of [['left', -0.38], ['centre', 0], ['right', 0.38]] as const) {
          const u = view === 'side' ? pu * 0.5 - 0.2 : pu;
          capShapes.push({ path: a.path([['M', [u, h.hairline - 0.02]], ['Q', [u * 0.9, (h.hairline - 1.05) / 2], [u * 0.6, -1.0 - h.lift * 0.6]]]), stroke: { c: 'hair.deep', w: ill ? 1.2 : 1.8 }, opacity: 0.8, clip: 'cap', when: { parting: opt } });
        }
      }
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const ang = Math.PI * (1.12 + t * 0.76);
        const rr = 1.0 + h.puff + h.lift * 0.3;
        const u = Math.cos(ang) * rr;
        const v = Math.sin(ang) * (1 + h.lift * 0.7);
        if ((view === 'side' && u > 0.6) || (view === 'three' && u > 0.8)) continue;
        capShapes.push({ path: a.path([['M', [u * 0.97, v * 0.97, VOL(u, v)]], ['Q', [u * 1.12 + 0.05, v * 1.1, VOL(u, v)], [u * 1.18 - 0.04, v * 1.2, VOL(u, v)]]]), stroke: { c: 'hair', w: ill ? 0.8 : 1.2 }, opacity: 0.9, opacityParam: 'hair.flyaways' });
      }
      if (ill) {
        for (let i = 0; i < 6; i++) {
          const u = -0.75 + i * 0.3;
          capShapes.push({ path: a.path([['M', [u * 0.4, -1.05 - h.lift * 0.6]], ['Q', [u * 0.9, -0.8], [u * 1.05, -0.35]]]), stroke: { c: 'hair.light', w: 0.9 }, opacity: 0.45, clip: 'cap' });
        }
      }
    }
  }
  if (!h.curls && !h.cover && !h.shaved) {
    // Curl texture (hair control): small curls along the silhouette, stronger with the control.
    for (let i = 0; i <= 10; i++) {
      const ang = Math.PI * (1.02 + (i / 10) * 0.96);
      const rr = 1.0 + h.puff + h.lift * 0.3;
      const u = Math.cos(ang) * rr * (view === 'side' ? 0.95 : 1);
      const v = Math.sin(ang) * (1 + h.lift * 0.7) - 0.05;
      if ((view === 'side' && u > 0.6) || (view === 'three' && u > 0.8)) continue;
      capShapes.push({ ellipse: { c: a.pt([u, v, VOL(Math.cos(ang), Math.sin(ang))]), rx: 0.1, ry: 0.095 }, fill: i % 2 ? 'hair' : 'hair.shade', opacityParam: 'hair.curl' });
    }
  }
  if (h.curls) {
    // Curl bumps along the cap silhouette.
    const n = h.curls;
    const r = 0.12 + h.puff * 0.2;
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI * (1.02 + (i / n) * 0.96);
      const rr = 1.0 + h.puff + h.lift * 0.3;
      const u = Math.cos(ang) * rr * (view === 'side' ? 0.95 : 1);
      const v = Math.sin(ang) * (1 + h.lift * 0.7) - 0.05;
      if ((view === 'side' && u > 0.6) || (view === 'three' && u > 0.8)) continue;
      capShapes.push({ ellipse: { c: a.pt([u, v, VOL(Math.cos(ang), Math.sin(ang))]), rx: r, ry: r * 0.95 }, fill: i % 2 ? 'hair' : 'hair.shade' });
    }
  }
  if (h.spikes) {
    for (let i = 0; i < h.spikes; i++) {
      const t = (i + 0.5) / h.spikes;
      const u = -0.9 + t * 1.8;
      const base = -0.85 - Math.cos((u * Math.PI) / 2) * (0.2 + h.lift);
      capShapes.push({ path: a.path([['M', [u - 0.14, base + 0.15]], ['L', [u + 0.05, base - 0.25, VOL(u, -1)]], ['L', [u + 0.16, base + 0.15]], ['Z']]), fill: fill(g0, g1) });
    }
  }
  if (h.cover === 'hijab' && view !== 'back') {
    // Hijab frames the face: wrap around the jaw.
    const wrap: PS[] = view === 'front'
      ? [[-1.18, -0.5], [-1.15, 0.6], [-0.6, 1.25], [0, 1.4], [0.6, 1.25], [1.15, 0.6], [1.18, -0.5], [0.92, -0.2], [0.85, 0.55], [0.4, 0.98], [0, 1.08], [-0.4, 0.98], [-0.85, 0.55], [-0.92, -0.2]]
      : [[-1.15, -0.3], [-1.05, 0.9], [-0.3, 1.35], [0.55, 1.2], [0.75, 0.95], [0.4, 1.0], [-0.1, 0.92], [-0.45, 0.55], [-0.6, -0.1]];
    capShapes.push({ path: a.smooth(wrap, true, 0.8), fill: cfill, ...line });
  }
  if (h.cover === 'durag' && view !== 'front') {
    capShapes.push({ path: a.smooth([[-0.8, 0.4], [-0.6, 1.4], [-0.3, 1.5], [-0.35, 0.5]], true, 0.8), fill: cfill });
  }
  a.layer('hair.front', 'head', capShapes);
  return a.build();
}

export function hairPart(name: string): PartData {
  const h = HAIR_STYLES[name]!;
  const families: PartData['families'] = {};
  for (const fam of ['flat', 'illustrated'] as const) {
    families[fam] = { views: { front: hairArt(h, fam, 'front'), three: hairArt(h, fam, 'three'), side: hairArt(h, fam, 'side'), back: hairArt(h, fam, 'back') } };
  }
  return {
    slot: 'hair',
    families,
    mirror: h.part !== undefined && h.part !== 0 ? 'keep' : 'mirror',
    ...(h.cover ? { colorSlot: 'acc', colors: { acc: h.cover === 'hijab' ? '#3F6E73' : h.cover === 'wrap' ? '#C4553A' : '#2B2B33' } } : {}),
    params: [
      { key: 'hair.volume', label: 'Volume', type: 'number', default: 0, range: [-1, 1], endLabels: ['Close', 'Full'] },
      { key: 'hair.length', label: 'Length', type: 'number', default: 0, range: [-1, 1], endLabels: ['Shorter', 'Longer'] },
    ],
  };
}
