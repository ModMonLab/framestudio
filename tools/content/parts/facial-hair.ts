/**
 * Facial hair (Catalog A11) and fringes (A10). Facial hair is drawn in head space around the jaw and mouth; the edge
 * under the lower lip and the moustache's lower edge follow the nine speech mouth shapes (`when: { mouth }`), and
 * jaw, chin and face-length morphs move the outline with the head (FR-CHR-08). Fringes hang over the forehead under
 * the hair cap. Shapes are authored for the front view and mapped to the three-quarter and side views.
 */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, mx, type D, type PS } from '../dsl.js';

const FAMS: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS3: View[] = ['front', 'three', 'side'];
/** Mouth opening per shape letter (matches the mouth parts' 9-shape set). */
const OPEN: Record<string, number> = { X: 0, A: 0, B: 0.16, C: 0.36, D: 0.62, E: 0.38, F: 0.2, G: 0.1, H: 0.34 };

/** Front-view head-space point → view. Negative u is the side nearest the camera in the turned views. */
function place(view: View, p: PS): PS {
  const [u, v, d] = p;
  const k = view === 'front' ? 1 : view === 'three' ? (u < 0 ? 1.28 : 0.45) : u <= 0 ? 1.15 : 0.1;
  const c = view === 'front' ? 0 : view === 'three' ? 0.42 : 0.78;
  const dd = d ? Object.fromEntries(Object.entries(d).map(([key, x]) => [key, [x[0] * k, x[1]]])) as D : undefined;
  return dd ? [c + u * k, v, dd] : [c + u * k, v];
}

/** Points follow the head's morphs: jaw width outward, chin and face length downward. */
const jaw = (u: number, v: number): PS => [u, v, { 'face.jaw': [Math.sign(u) * 0.08, 0], 'face.width': [u * 0.1, 0] }];
const chin = (u: number, v: number): PS => [u, v, { 'face.chin-length': [0, 0.08], 'face.length': [0, 0.05], 'face.jaw': [u * 0.05, 0] }];
/** Marks a point that follows the lower lip (drops as the mouth opens). */
const LIP = 'lip';
const lip = (u: number, v: number): PS => [u, v, { [LIP]: [0, 1] }];
/** Marks a point on the moustache's lower edge (rises a little as the upper lip lifts). */
const ULIP = 'ulip';
const ulip = (u: number, v: number): PS => [u, v, { [ULIP]: [0, 1] }];

/** Resolves the lip markers for one mouth shape and strips them from the deltas. */
function atMouth(p: PS, letter: string): PS {
  const d = (p[2] ?? {}) as D;
  const open = OPEN[letter] ?? 0;
  const dv = (d[LIP] ? open * 0.135 : 0) - (d[ULIP] ? open * 0.06 : 0);
  const rest = Object.fromEntries(Object.entries(d).filter(([k]) => k !== LIP && k !== ULIP)) as D;
  return Object.keys(rest).length ? [p[0], p[1] + dv, rest] : [p[0], p[1] + dv];
}

/** A right half (u ≥ 0) mirrored into a closed outline: right half top → bottom, then the left half back up. */
const sym = (right: PS[], centre: PS[] = []): PS[] => [...right, ...centre, ...right.slice().reverse().map(mx)];

type Region = { pts: PS[]; fill?: string; opacity?: number; stroke?: number };
interface Style {
  regions: Region[];
  /** Hair texture strokes over the regions (illustrated). */
  texture?: boolean;
}

// Common outlines (front view, oval head): sideburn at the ear, jaw, chin; inner edges around the cheek and mouth.
const BEARD_OUTER = (drop = 0): PS[] => [jaw(0.95, 0.02), jaw(0.97, 0.3), jaw(0.88, 0.58), jaw(0.7, 0.82 + drop * 0.3), chin(0.42, 0.98 + drop * 0.7)];
const BEARD_CHIN = (drop = 0): PS[] => [chin(0, 1.05 + drop)];
const BEARD_INNER: PS[] = [[0.18, 0.7], lip(0.3, 0.66), [0.38, 0.58], [0.55, 0.42], [0.72, 0.28], [0.8, 0.02]];
const MOUSTACHE: PS[] = [[0.06, 0.46], [0.24, 0.45], [0.4, 0.52], ulip(0.42, 0.6), ulip(0.3, 0.57), ulip(0.12, 0.555)];

/** Stubble follows the skin: inside the jaw line rather than a beard's volume. */
const STUBBLE_OUTER: PS[] = [jaw(0.8, 0.04), jaw(0.84, 0.3), jaw(0.72, 0.58), jaw(0.52, 0.8), chin(0.28, 0.94)];

function beardWith(drop: number, chinPts: PS[] = BEARD_CHIN(drop), outerR: PS[] = BEARD_OUTER(drop)): PS[] {
  // Outer edge down the right side, round the chin, up the left; inner edge back across under the mouth.
  const outer = [...outerR, ...chinPts, ...outerR.slice().reverse().map(mx)];
  const innerL = BEARD_INNER.slice().reverse().map(mx); // left side, top → under the lip
  const inner = [...innerL, lip(0, 0.72), ...BEARD_INNER];
  return [...outer, ...inner];
}

const STYLES: Record<string, Style> = {
  none: { regions: [] },
  stubble: { regions: [{ pts: beardWith(0, [chin(0, 1.0)], STUBBLE_OUTER), opacity: 0.22 }, { pts: sym([[0.08, 0.46], [0.36, 0.48], ulip(0.38, 0.58), ulip(0.1, 0.56)]), opacity: 0.22 }] },
  'short-beard': { regions: [{ pts: beardWith(0.02) }, { pts: sym(MOUSTACHE) }], texture: true },
  'full-beard': { regions: [{ pts: beardWith(0.14) }, { pts: sym(MOUSTACHE.map(([u, v, d]) => [u * 1.08, v - 0.01, d ?? {}] as PS)) }], texture: true },
  'long-beard': { regions: [{ pts: beardWith(0.3, [chin(0.2, 1.5), chin(0, 1.66), chin(-0.2, 1.5)]) }, { pts: sym(MOUSTACHE) }], texture: true },
  goatee: { regions: [{ pts: [lip(0.26, 0.7), chin(0.3, 0.9), chin(0.14, 1.02), chin(0, 1.05), chin(-0.14, 1.02), chin(-0.3, 0.9), lip(-0.26, 0.7), lip(0, 0.73)] }, { pts: sym(MOUSTACHE) }], texture: true },
  'van-dyke': { regions: [{ pts: [lip(0.12, 0.72), chin(0.16, 0.9), chin(0, 1.12), chin(-0.16, 0.9), lip(-0.12, 0.72)] }, { pts: sym([[0.06, 0.47], [0.26, 0.46], [0.44, 0.53], ulip(0.4, 0.58), ulip(0.22, 0.56), ulip(0.08, 0.555)]) }], texture: true },
  'chin-strap': { regions: [{ pts: [jaw(0.95, 0.02), jaw(0.97, 0.3), jaw(0.88, 0.58), jaw(0.7, 0.82), chin(0.42, 0.98), chin(0, 1.05), chin(-0.42, 0.98), jaw(-0.7, 0.82), jaw(-0.88, 0.58), jaw(-0.97, 0.3), jaw(-0.95, 0.02), jaw(-0.88, 0.02), jaw(-0.88, 0.3), jaw(-0.8, 0.55), jaw(-0.64, 0.74), chin(-0.38, 0.9), chin(0, 0.96), chin(0.38, 0.9), jaw(0.64, 0.74), jaw(0.8, 0.55), jaw(0.88, 0.3), jaw(0.88, 0.02)] }] },
  'mutton-chops': { regions: [{ pts: [jaw(0.95, 0.02), jaw(0.97, 0.3), jaw(0.9, 0.58), jaw(0.74, 0.74), [0.44, 0.62], ulip(0.42, 0.58), ulip(0.3, 0.56), [0.36, 0.48], [0.6, 0.4], [0.8, 0.2], [0.82, 0.02]] }, { pts: [jaw(-0.95, 0.02), jaw(-0.97, 0.3), jaw(-0.9, 0.58), jaw(-0.74, 0.74), [-0.44, 0.62], ulip(-0.42, 0.58), ulip(-0.3, 0.56), [-0.36, 0.48], [-0.6, 0.4], [-0.8, 0.2], [-0.82, 0.02]] }, { pts: sym([[0.06, 0.46], [0.3, 0.47], ulip(0.3, 0.56), ulip(0.1, 0.555)]) }], texture: true },
  moustache: { regions: [{ pts: sym(MOUSTACHE) }], texture: true },
  handlebar: { regions: [{ pts: sym([[0.05, 0.46], [0.24, 0.46], [0.42, 0.52], [0.56, 0.5], [0.64, 0.42], [0.6, 0.38], [0.62, 0.46], ulip(0.46, 0.57), ulip(0.26, 0.56), ulip(0.08, 0.555)]) }], texture: true },
  'pencil-moustache': { regions: [{ pts: sym([[0.05, 0.525], [0.3, 0.52], [0.4, 0.55], ulip(0.38, 0.565), ulip(0.06, 0.555)]) }] },
  horseshoe: { regions: [{ pts: sym([[0.06, 0.46], [0.3, 0.46], [0.44, 0.52], [0.46, 0.95], chin(0.38, 0.97), [0.36, 0.62], ulip(0.3, 0.57), ulip(0.08, 0.555)]) }], texture: true },
  'soul-patch': { regions: [{ pts: [lip(0.07, 0.715), [0.06, 0.8], [0, 0.84], [-0.06, 0.8], lip(-0.07, 0.715)] }] },
  sideburns: { regions: [{ pts: [jaw(0.95, -0.02), jaw(0.97, 0.3), jaw(0.93, 0.45), [0.84, 0.42], [0.83, 0.02]] }, { pts: [jaw(-0.95, -0.02), jaw(-0.97, 0.3), jaw(-0.93, 0.45), [-0.84, 0.42], [-0.83, 0.02]] }] },
};

function facialHairArt(style: Style, fam: StyleFamily, view: View) {
  const a = new Art('f');
  const ill = fam === 'illustrated';
  // Regions with lip-following points get one layer per mouth shape; others one layer.
  const follows = style.regions.some((r) => r.pts.some((p) => p[2] && (LIP in (p[2] as D) || ULIP in (p[2] as D))));
  const letters = follows ? Object.keys(OPEN) : ['*'];
  for (const letter of letters) {
    const shapes: ShapeDef[] = [];
    for (const r of style.regions) {
      // In the side view only the near half shows: drop far-side points that would fold back across the face.
      const pts = r.pts.map((p) => place(view, letter === '*' ? p : atMouth(p, letter)));
      const path = a.smooth(pts, true, 0.75);
      shapes.push({ path, fill: r.fill ?? 'hair', opacity: r.opacity ?? 1, ...(ill && (r.opacity ?? 1) === 1 ? { stroke: { c: 'hair.line', w: 0.9 } } : {}) });
      if (style.texture && ill && (r.opacity ?? 1) === 1) shapes.push({ path, fill: 'hair.shade', opacity: 0.35, blend: 'multiply' });
    }
    if (shapes.length) a.layer('facial-hair', 'head', shapes, letter === '*' ? {} : { when: { mouth: letter } });
  }
  return a.build();
}

export function facialHairPart(name: string): PartData {
  const style = STYLES[name]!;
  const families: PartData['families'] = {};
  const none = !style.regions.length;
  for (const fam of FAMS) {
    families[fam] = none
      ? { views: {}, exempt: { front: 'No facial hair.', three: 'No facial hair.', side: 'No facial hair.', back: 'No facial hair.' } }
      : { views: Object.fromEntries(VIEWS3.map((v) => [v, facialHairArt(style, fam, v)])), exempt: { back: 'Facial hair is not visible from behind.' } };
  }
  return { slot: 'facial-hair', families, colorSlot: 'hair' };
}

export const FACIAL_HAIR = Object.keys(STYLES);

/* ------------------------------------------------------------------ fringes (A10) */

/** Fringe outlines (front view, head space): hairline at v ≈ −0.62, hanging down over the forehead. */
const FRINGES: Record<string, PS[][]> = {
  none: [],
  straight: [[[-0.82, -0.66], [0.82, -0.66], [0.84, -0.3], [0.4, -0.27], [0, -0.27], [-0.4, -0.27], [-0.84, -0.3]]],
  'side-swept': [[[-0.86, -0.68], [0.8, -0.7], [0.86, -0.38], [0.4, -0.5], [-0.1, -0.36], [-0.5, -0.24], [-0.86, -0.3]]],
  curtain: [[[-0.82, -0.66], [-0.04, -0.7], [-0.12, -0.5], [-0.4, -0.32], [-0.75, -0.2], [-0.86, -0.3]], [[0.82, -0.66], [0.04, -0.7], [0.12, -0.5], [0.4, -0.32], [0.75, -0.2], [0.86, -0.3]]],
  wispy: [[[-0.8, -0.66], [0.8, -0.66], [0.8, -0.36], [0.62, -0.28], [0.5, -0.4], [0.34, -0.26], [0.18, -0.4], [0, -0.27], [-0.18, -0.4], [-0.34, -0.26], [-0.5, -0.4], [-0.62, -0.28], [-0.8, -0.36]]],
  choppy: [[[-0.82, -0.66], [0.82, -0.66], [0.84, -0.32], [0.62, -0.3], [0.52, -0.38], [0.36, -0.26], [0.2, -0.34], [0.05, -0.24], [-0.12, -0.34], [-0.3, -0.25], [-0.48, -0.36], [-0.64, -0.28], [-0.84, -0.32]]],
  curled: [[[-0.82, -0.66], [0.82, -0.66], [0.86, -0.4], [0.66, -0.3], [0.46, -0.4], [0.26, -0.3], [0.06, -0.4], [-0.14, -0.3], [-0.34, -0.4], [-0.54, -0.3], [-0.74, -0.4], [-0.86, -0.36]]],
  'long-over-eye': [[[-0.86, -0.68], [0.84, -0.68], [0.86, -0.4], [0.3, -0.42], [-0.1, -0.2], [-0.45, 0.12], [-0.7, 0.3], [-0.9, 0.1]]],
};

function placeFringe(view: View, p: PS): PS {
  const [u, v] = p;
  if (view === 'front') return [u, v];
  // The forehead turns with the head: the near half widens, the far half narrows.
  if (view === 'three') return [0.3 + u * (u < 0 ? 1.05 : 0.62), v];
  return [0.52 + u * 0.48, v];
}

function fringeArt(shapes: PS[][], fam: StyleFamily, view: View) {
  const a = new Art('g');
  const ill = fam === 'illustrated';
  const out: ShapeDef[] = [];
  for (const s of shapes) {
    const path = a.smooth(s.map((p) => placeFringe(view, p)), true, 0.7);
    out.push({ path, fill: 'hair', ...(ill ? { stroke: { c: 'hair.line', w: 0.9 } } : {}) });
    if (ill) out.push({ path, fill: 'hair.shade', opacity: 0.3, blend: 'multiply' });
    // Hair controls: greying reaches the fringe too.
    out.push({ path, fill: 'hairGrey', opacity: 0.85, opacityParam: 'hair.grey' });
  }
  if (out.length) a.layer('fringe', 'head', out);
  return a.build();
}

export function fringePart(name: string): PartData {
  const s = FRINGES[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) {
    families[fam] = !s.length
      ? { views: {}, exempt: { front: 'No fringe.', three: 'No fringe.', side: 'No fringe.', back: 'No fringe.' } }
      : { views: Object.fromEntries(VIEWS3.map((v) => [v, fringeArt(s, fam, v)])), exempt: { back: 'A fringe is hidden by the hair from behind.' } };
  }
  return { slot: 'fringe', families, colorSlot: 'hair' };
}

export const FRINGE_STYLES = Object.keys(FRINGES);
