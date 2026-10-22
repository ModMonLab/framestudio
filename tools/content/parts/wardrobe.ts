/** Wardrobe generators: tops (B1), outerwear (B2), bottoms (B3), dresses (B4), footwear (B5). */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, lin, type PS } from '../dsl.js';
import { footShape } from './body.js';

const FAMS: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS: View[] = ['front', 'three', 'side', 'back'];

export interface TopSpec {
  sleeve: number;
  neck: 'crew' | 'v' | 'collar' | 'turtle' | 'scoop' | 'hood' | 'henley' | 'tank' | 'open';
  hem: number;
  fit: number;
  ribs?: boolean;
  buttons?: boolean;
  pocket?: boolean;
  print?: boolean;
  stripes?: boolean;
  check?: boolean;
  badge?: boolean;
  open?: boolean;
  cuff?: boolean;
  slot?: 'top' | 'outer' | 'dress';
  color: string;
  colorSlot?: string;
  lapels?: boolean;
  zip?: boolean;
  puffy?: boolean;
  hood?: boolean;
  vest?: boolean;
  cape?: boolean;
  apron?: boolean;
  hiVis?: boolean;
  skirt?: number;
  /** Full outfits with trouser legs (jumpsuit, suit, scrubs). */
  legs?: number;
  wrap?: boolean;
  belt?: boolean;
  options?: Record<string, string[]>;
}

/** Neckline centre u per view: the garment front faces the character's facing direction. */
const CENTER: Record<View, number> = { front: 0, three: 0.4, side: 0.82, back: 0 };

function topOutline(t: TopSpec, view: View): PS[] {
  const f = t.fit;
  const c = CENTER[view];
  const back = view === 'back';
  const dip = back ? -0.02 : t.neck === 'v' ? 0.32 : t.neck === 'scoop' ? 0.2 : t.neck === 'tank' ? 0.18 : t.neck === 'turtle' ? -0.26 : t.neck === 'open' ? 0.45 : 0.05;
  const neckW = t.neck === 'turtle' ? 0.3 : t.neck === 'scoop' || t.neck === 'tank' ? 0.46 : 0.34;
  const shoulderTop = t.neck === 'tank' ? -0.05 : -0.18;
  const sh = t.neck === 'tank' ? 0.68 : 1.0;
  const hem = t.hem;
  const pts: PS[] = [
    [c + neckW * 0.9, shoulderTop - (t.neck === 'turtle' ? 0.12 : 0)],
    [0.74 * f * sh, shoulderTop + 0.02],
    [1.0 * f * sh, 0.05],
    [1.03 * f, 0.32],
    [1.02 * f * (t.puffy ? 1.08 : 1), 0.68],
    [1.05 * f * (t.puffy ? 1.08 : 1), hem - 0.06],
    [0.95 * f, hem + 0.02],
    [c * 0.3, hem + 0.04],
    [-0.95 * f, hem + 0.02],
    [-1.05 * f * (t.puffy ? 1.08 : 1), hem - 0.06],
    [-1.02 * f * (t.puffy ? 1.08 : 1), 0.68],
    [-1.03 * f, 0.32],
    [-1.0 * f * sh, 0.05],
    [-0.74 * f * sh, shoulderTop + 0.02],
    [c - neckW * 0.9, shoulderTop - (t.neck === 'turtle' ? 0.12 : 0)],
    [c, shoulderTop + dip + 0.12],
  ];
  return pts;
}

function topArt(t: TopSpec, fam: StyleFamily, view: View) {
  const a = new Art('w');
  const ill = fam === 'illustrated';
  const slot = t.slot ?? 'top';
  const col = t.colorSlot ?? slot;
  const g0 = a.pt([-0.6, -0.2], 'g0');
  const g1 = a.pt([0.7, t.hem], 'g1');
  const fill = ill ? lin(g0, g1, [[0, `${col}.light`], [0.55, col], [1, `${col}.shade`]]) : col;
  const line = ill ? { stroke: { c: `${col}.line`, w: 1.1 } } : {};
  const sleeveSlot = slot === 'outer' ? 'outer.sleeve.*' : 'sleeve.*';
  if (t.sleeve > 0 && !t.vest && !t.cape && !t.apron) {
    a.limb(sleeveSlot, { limb: 'arms', from: 0, to: t.sleeve, width: 1.24 * (t.puffy ? 1.25 : 1) * (slot === 'outer' ? 1.08 : 1), flare: t.sleeve < 0.5 ? 0.15 : 0, fill: col, ...(ill ? { shade: `${col}.shade` } : {}), outline: `${col}.line` }, t.options?.sleeves ? { sleeves: 'down' } : undefined);
    if (t.options?.sleeves) a.limb(sleeveSlot, { limb: 'arms', from: 0, to: 0.62, width: 1.3, fill: col, ...(ill ? { shade: `${col}.shade` } : {}), outline: `${col}.line` }, { sleeves: 'rolled' });
    if (t.cuff || t.ribs) a.limb(sleeveSlot, { limb: 'arms', from: Math.max(0, t.sleeve - 0.07), to: t.sleeve, width: 1.2, fill: `${col}.shade`, outline: `${col}.line` }, t.options?.sleeves ? { sleeves: 'down' } : undefined);
  }
  const shapes: ShapeDef[] = [];
  const outline = topOutline(t, view);
  if (t.cape) {
    const c: PS[] = [[-1.1, -0.15], [1.1, -0.15], [1.5, 2.3], [-1.5, 2.3]];
    a.layer(view === 'back' ? 'outer' : 'hair.back', 'torso', [{ path: a.smooth(c, true, 0.6), fill, ...line }]);
    a.layer('collar', 'torso', [{ path: a.smooth([[-0.75, -0.2], [0.75, -0.2], [0.6, 0.05], [-0.6, 0.05]], true, 0.6), fill, ...line }]);
    return a.build();
  }
  if (t.apron) {
    const c = CENTER[view];
    if (view !== 'back') a.layer(slot, 'torso', [{ path: a.smooth([[c - 0.55, 0.05], [c + 0.55, 0.05], [c + 0.75, 1.0], [c + 0.85, 1.9], [c - 0.85, 1.9], [c - 0.75, 1.0]], true, 0.5), fill, ...line }, { path: a.path([['M', [c - 0.5, 0.05]], ['L', [c - 0.25, -0.18]], ['M', [c + 0.5, 0.05]], ['L', [c + 0.25, -0.18]]]), stroke: { c: `${col}.shade`, w: 3 } }]);
    a.layer('acc.waist', 'torso', [{ path: a.path([['M', [-1.02, 0.72]], ['L', [1.02, 0.72]]]), stroke: { c: `${col}.shade`, w: 4 } }]);
    return a.build();
  }
  shapes.push({ id: 'body', path: a.smooth(outline, true, 0.75), fill, ...line });
  // One-tone side shade (Flat) / soft multiply (Illustrated) on the far side.
  shapes.push({ path: a.smooth([[-1.1, 0.0], [-0.55, 0.15], [-0.6, 0.6], [-0.7, t.hem + 0.05], [-1.1, t.hem + 0.05]], true, 0.6), fill: `${col}.shade`, opacity: ill ? 0.55 : 1, clip: 'body', ...(ill ? { blend: 'multiply' as const } : {}) });
  const c = CENTER[view];
  if (t.stripes) for (let i = 1; i < 7; i++) shapes.push({ path: a.path([['M', [-1.2, i * 0.16]], ['L', [1.2, i * 0.16]]]), stroke: { c: `${col}.deep`, w: 3.5 }, opacity: 0.55, clip: 'body' });
  if (t.check) for (let i = -4; i <= 4; i++) {
    shapes.push({ path: a.path([['M', [i * 0.25, -0.3]], ['L', [i * 0.25, t.hem + 0.1]]]), stroke: { c: `${col}.deep`, w: 3 }, opacity: 0.45, clip: 'body' });
    shapes.push({ path: a.path([['M', [-1.2, 0.1 + (i + 4) * 0.13]], ['L', [1.2, 0.1 + (i + 4) * 0.13]]]), stroke: { c: `${col}.deep`, w: 3 }, opacity: 0.35, clip: 'body' });
  }
  if (t.ribs) for (let i = -6; i <= 6; i++) shapes.push({ path: a.path([['M', [i * 0.15, 0.05]], ['L', [i * 0.13, t.hem]]]), stroke: { c: `${col}.shade`, w: ill ? 0.9 : 1.6 }, opacity: ill ? 0.4 : 0.5, clip: 'body' });
  if (ill && !t.puffy) {
    shapes.push({ path: a.path([['M', [-0.5, 0.35]], ['Q', [-0.35, 0.6], [-0.42, 0.95]]]), stroke: { c: `${col}.shade`, w: 1.2 }, opacity: 0.6, clip: 'body' });
    shapes.push({ path: a.path([['M', [0.45, 0.5]], ['Q', [0.32, 0.72], [0.4, 0.98]]]), stroke: { c: `${col}.shade`, w: 1.2 }, opacity: 0.6, clip: 'body' });
  }
  if (t.puffy) for (let i = 1; i < 5; i++) shapes.push({ path: a.path([['M', [-1.1, i * 0.22]], ['Q', [0, i * 0.22 + 0.05], [1.1, i * 0.22]]]), stroke: { c: `${col}.shade`, w: 2 }, opacity: 0.8, clip: 'body' });
  if (view !== 'back') {
    if (t.buttons || t.zip || t.open) {
      const placket: PS[] = [[c, -0.02], [c + 0.02 * (view === 'front' ? 0 : 1), t.hem]];
      shapes.push({ path: a.path([['M', placket[0]!], ['L', placket[1]!]]), stroke: { c: `${col}.deep`, w: t.open ? 0 : 1.6 } });
      if (t.buttons) for (let i = 0; i < 5; i++) shapes.push({ ellipse: { c: a.pt([c + 0.07, 0.08 + i * 0.2]), rx: 0.035, ry: 0.025 }, fill: `${col}.deep` });
    }
    if (t.pocket) shapes.push({ path: a.smooth([[c + 0.3, 0.2], [c + 0.6, 0.2], [c + 0.6, 0.45], [c + 0.3, 0.45]], true, 0.2), stroke: { c: `${col}.deep`, w: 1.4 } });
    if (t.print) shapes.push({ ellipse: { c: a.pt([c, 0.38]), rx: 0.32, ry: 0.2 }, fill: '#F2E7D3', opacity: 0.92 });
    if (t.badge) shapes.push({ path: a.smooth([[c - 0.62, 0.18], [c - 0.38, 0.18], [c - 0.38, 0.34], [c - 0.62, 0.34]], true, 0.3), fill: '#E8C64A' });
    if (t.hiVis) for (const v of [0.35, 0.75]) shapes.push({ path: a.path([['M', [-1.1, v]], ['L', [1.1, v]]]), stroke: { c: '#D9DCE0', w: 5 }, clip: 'body' });
    if (t.lapels) {
      shapes.push({ path: a.smooth([[c - 0.08, -0.14], [c - 0.45, 0.0], [c - 0.32, 0.38], [c - 0.02, 0.52]], true, 0.4), fill: `${col}.shade`, ...line });
      shapes.push({ path: a.smooth([[c + 0.08, -0.14], [c + 0.45, 0.0], [c + 0.32, 0.38], [c + 0.02, 0.52]], true, 0.4), fill: `${col}.shade`, ...line });
    }
    if (t.belt) shapes.push({ path: a.path([['M', [-1.1, 0.72]], ['L', [1.1, 0.72]]]), stroke: { c: `${col}.deep`, w: 5 }, clip: 'body' });
  }
  a.layer(slot, 'torso', shapes);
  // Collars and hoods drawn over the neck.
  if (t.neck === 'collar' && view !== 'back') {
    a.layer('collar', 'torso', [
      { path: a.smooth([[c - 0.02, -0.06], [c - 0.36, -0.2], [c - 0.44, -0.04], [c - 0.12, 0.08]], true, 0.4), fill: col, ...line },
      { path: a.smooth([[c + 0.02, -0.06], [c + 0.36, -0.2], [c + 0.44, -0.04], [c + 0.12, 0.08]], true, 0.4), fill: col, ...line },
    ]);
  }
  if (t.neck === 'turtle') {
    a.layer('collar', 'torso', [{ path: a.smooth([[c - 0.34, -0.42], [c + 0.34, -0.42], [c + 0.38, -0.12], [c - 0.38, -0.12]], true, 0.5), fill: col, ...line }]);
  }
  if (t.hood) {
    const hu = view === 'back' ? 0 : view === 'side' ? -0.4 : view === 'three' ? -0.2 : 0;
    a.layer(view === 'back' ? 'collar' : 'collar', 'torso', [{ path: a.smooth([[hu - 0.55, -0.25], [hu + 0.55, -0.25], [hu + 0.62, 0.02], [hu, 0.12], [hu - 0.62, 0.02]], true, 0.7), fill: `${col}.shade`, ...line }], { when: { hood: 'down' } });
  }
  if (t.legs) {
    a.limb('legwear.*', { limb: 'legs', from: 0, to: t.legs, width: 1.2, fill: col, ...(ill ? { shade: `${col}.shade` } : {}), outline: `${col}.line`, cap: 'butt' });
    a.layer('bottom', 'pelvis', [{ path: a.smooth([[-1.06, -0.15], [1.06, -0.15], [1.08, 0.5], [0.8, 1.05], [-0.8, 1.05], [-1.08, 0.5]], true, 0.6), fill, ...line }]);
  }
  if (t.skirt) {
    // Dress skirt hangs from the hips and follows the thighs (seated drapes over the legs).
    a.limb('legwear.*', { limb: 'legs', from: 0, to: t.skirt, width: 1.7, flare: 0.9, fill: col, ...(ill ? { shade: `${col}.shade` } : {}), outline: `${col}.line`, cap: 'butt' });
    a.layer('bottom', 'pelvis', [{ path: a.smooth([[-1.1, -0.15], [1.1, -0.15], [1.25, 1.1], [-1.25, 1.1]], true, 0.5), fill, ...line }]);
  }
  return a.build();
}

export function topPart(t: TopSpec): PartData {
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: Object.fromEntries(VIEWS.map((v) => [v, topArt(t, fam, v)])) };
  const slot = t.slot ?? 'top';
  return {
    slot,
    families,
    colorSlot: t.colorSlot ?? slot,
    colors: { [t.colorSlot ?? slot]: t.color },
    patternable: !t.puffy,
    ...(slot === 'dress' ? { hides: ['top', 'bottom'] } : {}),
    ...(t.options ? { options: t.options } : {}),
  };
}

/* ------------------------------------------------------------------ bottoms */

export interface BottomSpec {
  leg: number; // 0 (no legs, skirt) … 1 (full length)
  width: number;
  skirt?: number;
  bib?: boolean;
  color: string;
  pockets?: boolean;
  seams?: boolean;
  pleats?: boolean;
  cuffs?: boolean;
}

function bottomArt(b: BottomSpec, fam: StyleFamily, view: View) {
  const a = new Art('q');
  const ill = fam === 'illustrated';
  const col = 'bottom';
  const line = ill ? { stroke: { c: `${col}.line`, w: 1.1 } } : {};
  if (b.leg > 0) a.limb('legwear.*', { limb: 'legs', from: 0, to: b.leg, width: b.width, flare: b.cuffs ? 0.1 : 0, fill: col, ...(ill ? { shade: `${col}.shade` } : {}), outline: `${col}.line`, cap: 'butt' });
  if (b.cuffs && b.leg > 0.9) a.limb('legwear.*', { limb: 'legs', from: b.leg - 0.05, to: b.leg, width: b.width * 1.06, fill: `${col}.shade`, cap: 'butt' });
  const g0 = a.pt([0, -0.1], 'g0');
  const g1 = a.pt([0, 1], 'g1');
  const fill = ill ? lin(g0, g1, [[0, col], [1, `${col}.shade`]]) : col;
  const shapes: ShapeDef[] = [{ id: 'p', path: a.smooth([[-1.06, -0.12], [1.06, -0.12], [1.08, 0.5], [0.8, 1.05], [-0.8, 1.05], [-1.08, 0.5]], true, 0.6), fill, ...line }];
  shapes.push({ path: a.path([['M', [-1.06, 0.0]], ['L', [1.06, 0.0]]]), stroke: { c: `${col}.shade`, w: 2.2 }, clip: 'p' });
  if (b.seams && view !== 'back') shapes.push({ path: a.path([['M', [CENTER[view] * 0.6, 0]], ['L', [CENTER[view] * 0.6, 0.9]]]), stroke: { c: `${col}.deep`, w: 1.2 }, opacity: 0.7, clip: 'p' });
  if (b.pockets && view !== 'back') shapes.push({ path: a.path([['M', [0.55, 0.0]], ['Q', [0.75, 0.3], [1.0, 0.35]]]), stroke: { c: `${col}.deep`, w: 1.2 }, opacity: 0.7, clip: 'p' });
  a.layer('bottom', 'pelvis', shapes);
  if (b.skirt) {
    a.limb('legwear.*', { limb: 'legs', from: 0, to: b.skirt, width: 1.65, flare: 0.8, fill: col, ...(ill ? { shade: `${col}.shade` } : {}), outline: `${col}.line`, cap: 'butt' });
    if (b.pleats) a.limb('legwear.*', { limb: 'legs', from: 0.05, to: b.skirt, width: 0.25, fill: `${col}.shade`, cap: 'butt' });
  }
  if (b.bib && view !== 'back') a.layer('top', 'torso', [{ path: a.smooth([[CENTER[view] - 0.5, 0.25], [CENTER[view] + 0.5, 0.25], [CENTER[view] + 0.62, 1.05], [CENTER[view] - 0.62, 1.05]], true, 0.3), fill, ...line }, { path: a.path([['M', [CENTER[view] - 0.45, 0.27]], ['L', [-0.62, -0.15]], ['M', [CENTER[view] + 0.45, 0.27]], ['L', [0.62, -0.15]]]), stroke: { c: col, w: 4 } }]);
  return a.build();
}

export function bottomPart(b: BottomSpec): PartData {
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: Object.fromEntries(VIEWS.map((v) => [v, bottomArt(b, fam, v)])) };
  return { slot: 'bottom', families, colorSlot: 'bottom', colors: { bottom: b.color }, patternable: true };
}

/* ------------------------------------------------------------------ footwear */

export interface ShoeSpec {
  base: 'sneaker' | 'flat' | 'boot' | 'heel';
  color: string;
  sole: string;
  shaft?: number; // boot shaft height on the leg (0..0.5 of shin)
  laces?: boolean;
  open?: boolean;
}

function shoeArt(s: ShoeSpec, fam: StyleFamily, view: View) {
  const a = new Art('s');
  const ill = fam === 'illustrated';
  const heel = s.base === 'heel' ? 0.3 : s.base === 'boot' ? 0.06 : 0.03;
  const h = s.base === 'boot' ? 0.32 : s.base === 'sneaker' ? 0.27 : 0.2;
  const shape = footShape(view, heel, s.base === 'sneaker' ? 1.08 : 1.02, h, 1.12);
  const line = ill ? { stroke: { c: 'shoe.line', w: 1 } } : {};
  const shapes: ShapeDef[] = [{ id: 'shoe', path: a.smooth(shape, true, 0.6), fill: s.open ? 'skin' : 'shoe', ...line }];
  if (s.open) shapes.push({ path: a.smooth(shape.map(([u, v]) => [u, v] as PS), true, 0.6), stroke: { c: 'shoe', w: 3 } });
  const side = view === 'side' || view === 'three';
  shapes.push({ path: a.path([['M', [side ? -0.3 : -0.3, h + 0.02]], ['L', [side ? 0.95 : 0.3, h + 0.02]]]), stroke: { c: s.sole, w: s.base === 'sneaker' ? 4 : 2.5 }, clip: 'shoe' });
  if (s.laces && view !== 'back') shapes.push({ path: a.path([['M', [side ? 0.15 : -0.08, 0.05]], ['L', [side ? 0.45 : 0.08, 0.12]]]), stroke: { c: '#F4F1EA', w: 1.6 } });
  a.layer('shoe.*', 'foot', shapes, { sides: ['L', 'R'] });
  if (s.shaft) a.limb('legwear.*', { limb: 'legs', from: 1 - s.shaft, to: 1, width: 1.25, fill: 'shoe', outline: 'shoe.line', cap: 'butt' });
  return a.build();
}

export function shoePart(s: ShoeSpec): PartData {
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: Object.fromEntries(VIEWS.map((v) => [v, shoeArt(s, fam, v)])) };
  return { slot: 'shoe', families, colorSlot: 'shoe', colors: { shoe: s.color }, hides: ['feet'] };
}
