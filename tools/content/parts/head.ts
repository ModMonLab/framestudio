/** Head shapes (Catalog A3) with face-structure morphs (A3b) for both families and four views. */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData } from '../../../packages/rig/src/types.js';
import { Art, lin, mx, type D, type PS } from '../dsl.js';

export interface HeadShape {
  /** Half-widths at forehead, temple, cheek, jaw corner; chin half-width and drop. */
  crown: number;
  temple: number;
  cheek: number;
  jaw: number;
  chin: number;
  chinV: number;
  jawV: number;
  /** Vertical stretch (long faces). */
  length: number;
  /** Corner sharpness 0 (round) … 1 (angular). */
  angular: number;
}

export const HEAD_SHAPES: Record<string, HeadShape> = {
  oval: { crown: 0.8, temple: 0.96, cheek: 0.97, jaw: 0.72, chin: 0.22, chinV: 1, jawV: 0.62, length: 1, angular: 0 },
  round: { crown: 0.86, temple: 1, cheek: 1.02, jaw: 0.86, chin: 0.34, chinV: 0.96, jawV: 0.6, length: 0.95, angular: 0 },
  square: { crown: 0.86, temple: 0.98, cheek: 0.98, jaw: 0.92, chin: 0.46, chinV: 0.97, jawV: 0.7, length: 0.98, angular: 0.6 },
  angular: { crown: 0.8, temple: 0.95, cheek: 0.98, jaw: 0.84, chin: 0.3, chinV: 1, jawV: 0.66, length: 1.02, angular: 0.85 },
  long: { crown: 0.76, temple: 0.9, cheek: 0.9, jaw: 0.7, chin: 0.26, chinV: 1.04, jawV: 0.68, length: 1.1, angular: 0.1 },
  heart: { crown: 0.92, temple: 1.02, cheek: 0.96, jaw: 0.62, chin: 0.14, chinV: 1.03, jawV: 0.58, length: 1, angular: 0.15 },
  diamond: { crown: 0.7, temple: 0.88, cheek: 1.04, jaw: 0.66, chin: 0.18, chinV: 1.02, jawV: 0.6, length: 1.02, angular: 0.35 },
  triangle: { crown: 0.68, temple: 0.86, cheek: 0.96, jaw: 0.94, chin: 0.4, chinV: 0.98, jawV: 0.68, length: 1, angular: 0.4 },
  pear: { crown: 0.72, temple: 0.88, cheek: 0.98, jaw: 0.96, chin: 0.42, chinV: 0.98, jawV: 0.64, length: 0.98, angular: 0.1 },
  rectangle: { crown: 0.84, temple: 0.94, cheek: 0.95, jaw: 0.9, chin: 0.42, chinV: 1.03, jawV: 0.72, length: 1.1, angular: 0.65 },
};

/** Face structure morph deltas (keys are engine parameter names bound by Catalog A3b controls). */
function frontOutline(h: HeadShape): PS[] {
  const L = h.length;
  const wD = (u: number): D => ({ 'face.width': [u * 0.12, 0] });
  const right: PS[] = [
    [0.0, -1 * L, { 'face.length': [0, -0.06], 'face.forehead': [0, -0.07] }],
    [h.crown * 0.62, -0.93 * L, { ...wD(h.crown * 0.62), 'face.forehead': [0, -0.06] }],
    [h.crown, -0.6 * L, { ...wD(h.crown), 'face.forehead': [0, -0.04] }],
    [h.temple, -0.15 * L, wD(h.temple)],
    [h.cheek, 0.18 * L, { ...wD(h.cheek), 'face.cheekbone': [0.03, -0.06], 'face.cheeks': [0.05, 0] }],
    [lerp(h.cheek, h.jaw, 0.6), h.jawV * L - 0.1, { ...wD(h.cheek), 'face.cheeks': [0.04, 0.02], 'face.jaw': [0.06, 0] }],
    [h.jaw * (1 - h.angular * 0.08), h.jawV * L + 0.06 * (1 - h.angular), { ...wD(h.jaw), 'face.jaw': [0.1, 0.02], 'face.length': [0, 0.03] }],
    [lerp(h.jaw, h.chin, 0.55), 0.86 * L + h.angular * 0.04, { ...wD(h.jaw * 0.6), 'face.jaw': [0.05, 0], 'face.chin-length': [0, 0.05], 'face.length': [0, 0.05] }],
    [h.chin, h.chinV * L - 0.02, { 'face.chin-shape': [0.12, 0.02], 'face.chin-length': [0, 0.08], 'face.length': [0, 0.06] }],
  ];
  const left = right.slice(1).reverse().map(mx);
  // Chin: centre point plus mirrored chin corner.
  return [...right, [0, h.chinV * L + 0.01, { 'face.chin-length': [0, 0.09], 'face.chin-shape': [0, -0.03], 'face.length': [0, 0.06] }], ...left];
}

function threeOutline(h: HeadShape): PS[] {
  const L = h.length;
  const w: D = { 'face.width': [0.08, 0] };
  return [
    [0.08, -1 * L, { 'face.forehead': [0, -0.07], 'face.length': [0, -0.06] }],
    [0.62 * h.crown + 0.12, -0.86 * L, { ...w, 'face.forehead': [0, -0.05] }],
    [0.9 * h.temple, -0.42 * L, w],
    [0.93 * h.temple, -0.08 * L, w],
    [0.9 * h.cheek + 0.04, 0.2 * L, { ...w, 'face.cheekbone': [0.03, -0.05], 'face.cheeks': [0.05, 0] }],
    [0.82 * lerp(h.cheek, h.jaw, 0.5) + 0.06, 0.55 * L, { 'face.cheeks': [0.04, 0], 'face.jaw': [0.04, 0] }],
    [0.62 + h.chin * 0.25, 0.9 * L, { 'face.chin-length': [0, 0.06], 'face.chin-shape': [0.05, 0], 'face.length': [0, 0.05] }],
    [0.38 + h.chin * 0.2, h.chinV * L + 0.02, { 'face.chin-length': [0, 0.08], 'face.length': [0, 0.06] }],
    [-0.1 - h.jaw * 0.25, 0.86 * L, { 'face.jaw': [-0.05, 0.02], 'face.length': [0, 0.04] }],
    [-0.55 - h.jaw * 0.12, h.jawV * L + 0.02, { 'face.jaw': [-0.08, 0], 'face.width': [-0.04, 0] }],
    [-0.92, 0.2 * L, { 'face.width': [-0.08, 0] }],
    [-1.0, -0.25 * L, { 'face.width': [-0.1, 0] }],
    [-0.72 * h.crown - 0.1, -0.82 * L, { 'face.width': [-0.07, 0], 'face.forehead': [0, -0.05] }],
  ];
}

function sideOutline(h: HeadShape): PS[] {
  const L = h.length;
  return [
    [0.1, -1 * L, { 'face.forehead': [0, -0.06], 'face.length': [0, -0.06] }],
    [0.68, -0.8 * L, { 'face.forehead': [0.02, -0.05] }],
    [0.9, -0.38 * L],
    [0.95, -0.1 * L, { 'face.cheekbone': [0.02, 0] }],
    [0.88, 0.1 * L],
    [0.92, 0.3 * L],
    [0.9, 0.52 * L, { 'face.cheeks': [0.02, 0] }],
    [0.86 + h.chin * 0.06, 0.82 * L, { 'face.chin-length': [0.02, 0.06], 'face.chin-shape': [0.03, 0], 'face.length': [0, 0.05] }],
    [0.6, h.chinV * L + 0.02, { 'face.chin-length': [0, 0.08], 'face.length': [0, 0.06] }],
    [0.12, 0.9 * L - h.angular * 0.06, { 'face.jaw': [-0.04, 0.03], 'face.length': [0, 0.04] }],
    [-0.28, 0.56 * L, { 'face.jaw': [-0.05, 0] }],
    [-0.62, 0.42 * L],
    [-0.98, 0.0 * L],
    [-0.95, -0.5 * L],
    [-0.55, -0.92 * L, { 'face.forehead': [0, -0.04] }],
  ];
}

function backOutline(h: HeadShape): PS[] {
  const L = h.length;
  const right: PS[] = [
    [0, -1 * L, { 'face.length': [0, -0.06] }],
    [h.crown * 0.66, -0.93 * L, { 'face.width': [0.08, 0] }],
    [h.crown + 0.06, -0.55 * L, { 'face.width': [0.12, 0] }],
    [h.temple + 0.04, -0.05 * L, { 'face.width': [0.12, 0] }],
    [h.cheek * 0.95, 0.4 * L, { 'face.width': [0.1, 0], 'face.jaw': [0.05, 0] }],
    [0.6, 0.78 * L, { 'face.jaw': [0.05, 0] }],
    [0.3, 0.9 * L],
  ];
  return [...right, [0, 0.92 * L], ...right.slice(1).reverse().map(mx)];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface Layout {
  eye: [number, number];
  brow: number;
  nose: number;
  mouth: number;
  ear: [number, number];
}

/** Feature placement per family (Flat: big eyes, low features; Illustrated: realistic thirds). */
const LAYOUT: Record<StyleFamily, Layout> = {
  flat: { eye: [0.4, 0.12], brow: -0.18, nose: 0.36, mouth: 0.6, ear: [0.97, 0.14] },
  illustrated: { eye: [0.38, 0.02], brow: -0.2, nose: 0.34, mouth: 0.6, ear: [0.95, 0.08] },
};

export function headArt(shape: HeadShape, family: StyleFamily, view: View) {
  const a = new Art('h');
  const lay = LAYOUT[family];
  const outline = view === 'front' ? frontOutline(shape) : view === 'three' ? threeOutline(shape) : view === 'side' ? sideOutline(shape) : backOutline(shape);
  const ill = family === 'illustrated';
  const outlinePath = a.smooth(outline);
  const top = a.pt([-0.3, -0.95], 'gTop');
  const bottom = a.pt([0.35, 0.95], 'gBottom');
  const shapes = [];
  if (ill) {
    shapes.push({ id: 'skin', path: outlinePath, fill: lin(top, bottom, [[0, 'skin.light'], [0.55, 'skin'], [1, 'skin']]), stroke: { c: 'skin.line', w: 1.1 } });
  } else {
    shapes.push({ id: 'skin', path: outlinePath, fill: 'skin' });
  }
  // One-tone cel shade (Flat) or soft multiply shade (Illustrated) on the side away from the light.
  if (view !== 'back') {
    const L = shape.length;
    const shadeSide: PS[] = view === 'front'
      ? [[-1.02, 0.05], [-0.94, 0.45 * L], [-0.6, 0.86 * L], [-0.15, 1.02 * L], [-0.5, 0.82 * L], [-0.8, 0.45 * L]]
      : view === 'three'
        ? [[-1.0, -0.2], [-0.94, 0.3], [-0.62, 0.72 * L], [-0.2, 0.9 * L], [-0.5, 0.62 * L], [-0.72, 0.15]]
        : [[-0.95, -0.1], [-0.6, 0.45 * L], [0.1, 0.88 * L], [-0.2, 0.45 * L], [-0.6, 0.05]];
    shapes.push({ path: a.smooth(shadeSide), fill: 'skin.shade', opacity: ill ? 0.55 : 1, clip: 'skin', ...(ill ? { blend: 'multiply' as const } : {}) });
  } else {
    shapes.push({ path: a.smooth([[-0.9, 0.3], [0, 0.95], [0.9, 0.3], [0, 0.6]]), fill: 'skin.shade', opacity: ill ? 0.5 : 1, clip: 'skin' });
  }
  // Cheek warmth (expression cheek raise / blush slot handled by overlays).
  if (view !== 'back' && view !== 'side') {
    const cx = view === 'front' ? [lay.eye[0] + 0.05, -(lay.eye[0] + 0.05)] : [0.62, -0.05];
    for (const x of cx) {
      shapes.push({ ellipse: { c: a.pt([x, lay.nose + 0.08, { cheek: [0, -0.06] }]), rx: 0.17, ry: 0.1 }, fill: 'skin.blush', opacity: ill ? 0.25 : 0.0001, opacityParam: 'cheek' });
    }
  }
  a.layer('head', 'head', shapes);

  // Neck shadow under the jaw (part of the head so it follows head shape).
  if (view !== 'back') {
    const L = shape.length;
    const jawShadow: PS[] = view === 'front'
      ? [[-0.45, 0.8 * L], [0, 1.02 * L], [0.45, 0.8 * L], [0.36, 1.25 * L], [-0.36, 1.25 * L]]
      : view === 'three' ? [[-0.4, 0.75 * L], [0.4, 1.02 * L], [0.2, 1.3 * L], [-0.45, 1.2 * L]] : [[-0.3, 0.6 * L], [0.5, 1.0 * L], [0.0, 1.3 * L], [-0.4, 1.1 * L]];
    a.layer('neck', 'head', [{ path: a.smooth(jawShadow), fill: 'skin.shade', opacity: ill ? 0.45 : 1, ...(ill ? { blend: 'multiply' as const } : {}) }]);
  }

  // Feature layout anchors (face space).
  const [ex, ey] = lay.eye;
  if (view === 'front') {
    a.anchor('eyeL', 'face', [ex, ey]).anchor('eyeR', 'face', [-ex, ey]);
    a.anchor('browL', 'face', [ex, lay.brow]).anchor('browR', 'face', [-ex, lay.brow]);
    a.anchor('nose', 'face', [0, lay.nose]).anchor('mouth', 'face', [0, lay.mouth]);
    a.anchor('earL', 'face', [lay.ear[0], lay.ear[1]]).anchor('earR', 'face', [-lay.ear[0], lay.ear[1]]);
  } else if (view === 'three') {
    a.anchor('eyeR', 'face', [ex * 0.05, ey]).anchor('eyeL', 'face', [ex * 1.62, ey], { sx: 0.72 });
    a.anchor('browR', 'face', [ex * 0.05, lay.brow]).anchor('browL', 'face', [ex * 1.6, lay.brow], { sx: 0.72 });
    a.anchor('nose', 'face', [0.62, lay.nose]).anchor('mouth', 'face', [0.42, lay.mouth], { sx: 0.86 });
    a.anchor('earR', 'face', [-0.58, lay.ear[1]]);
  } else if (view === 'side') {
    a.anchor('eyeR', 'face', [0.62, ey], { sx: 0.58 }).anchor('browR', 'face', [0.6, lay.brow], { sx: 0.62 });
    a.anchor('nose', 'face', [0.9, lay.nose]).anchor('mouth', 'face', [0.74, lay.mouth], { sx: 0.5 });
    a.anchor('earR', 'face', [-0.12, lay.ear[1]]);
  } else {
    a.anchor('earL', 'face', [-lay.ear[0], lay.ear[1]]).anchor('earR', 'face', [lay.ear[0], lay.ear[1]]);
  }
  return a.build();
}

export function headPart(name: string): PartData {
  const shape = HEAD_SHAPES[name]!;
  const families: PartData['families'] = {};
  for (const fam of ['flat', 'illustrated'] as const) {
    families[fam] = { views: { front: headArt(shape, fam, 'front'), three: headArt(shape, fam, 'three'), side: headArt(shape, fam, 'side'), back: headArt(shape, fam, 'back') } };
  }
  return { slot: 'head', families };
}
