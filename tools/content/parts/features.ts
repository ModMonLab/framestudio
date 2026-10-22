/** Eyes (A4), brows (A5), noses (A6), mouths with the 9-shape set (A7, A17) and ears (A8). */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, lin, type D, type PS } from '../dsl.js';

const FAMS: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS3: View[] = ['front', 'three', 'side'];

/* ------------------------------------------------------------------ eyes */

export interface EyeShape {
  w: number; // half-width
  h: number; // half-height (openness at rest)
  tilt: number; // outer corner lift
  lid: number; // upper-lid heaviness (hooded/sleepy lower the lid)
  roundness: number; // 0 almond … 1 round
  crease: boolean;
  irisScale: number;
  style?: 'dot' | 'cartoon';
}

export const EYE_SHAPES: Record<string, EyeShape> = {
  almond: { w: 1.05, h: 0.62, tilt: 0.06, lid: 0, roundness: 0.2, crease: true, irisScale: 1 },
  round: { w: 1.0, h: 0.85, tilt: 0, lid: 0, roundness: 0.9, crease: true, irisScale: 1.05 },
  hooded: { w: 1.05, h: 0.55, tilt: 0, lid: 0.28, roundness: 0.25, crease: false, irisScale: 1 },
  monolid: { w: 1.1, h: 0.5, tilt: 0.1, lid: 0.1, roundness: 0.15, crease: false, irisScale: 0.95 },
  downturned: { w: 1.05, h: 0.6, tilt: -0.18, lid: 0.05, roundness: 0.3, crease: true, irisScale: 1 },
  upturned: { w: 1.05, h: 0.6, tilt: 0.22, lid: 0, roundness: 0.25, crease: true, irisScale: 1 },
  narrow: { w: 1.15, h: 0.4, tilt: 0.04, lid: 0.05, roundness: 0.1, crease: true, irisScale: 0.92 },
  'wide-set': { w: 1.05, h: 0.62, tilt: 0.04, lid: 0, roundness: 0.25, crease: true, irisScale: 1 },
  'close-set': { w: 1.0, h: 0.62, tilt: 0.04, lid: 0, roundness: 0.25, crease: true, irisScale: 1 },
  'deep-set': { w: 1.0, h: 0.58, tilt: 0, lid: 0.12, roundness: 0.3, crease: true, irisScale: 0.95 },
  protruding: { w: 1.05, h: 0.78, tilt: 0, lid: 0, roundness: 0.7, crease: true, irisScale: 0.95 },
  sleepy: { w: 1.05, h: 0.6, tilt: -0.04, lid: 0.38, roundness: 0.3, crease: true, irisScale: 1 },
  'large-cartoon': { w: 1.3, h: 1.25, tilt: 0, lid: 0, roundness: 1, crease: false, irisScale: 1.25, style: 'cartoon' },
  dot: { w: 0.42, h: 0.5, tilt: 0, lid: 0, roundness: 1, crease: false, irisScale: 1, style: 'dot' },
};

/** Builds the eye art for one view; +u is the outer corner (right-side instances are mirrored). */
function eyeArt(e: EyeShape, fam: StyleFamily, view: View) {
  const a = new Art('e');
  const ill = fam === 'illustrated';
  const sc = fam === 'flat' ? 1.35 : 1;
  const W = e.w * sc;
  const H = e.h * sc * (ill ? 0.85 : 1);
  if (e.style === 'dot') {
    // Minimal dot eyes (Flat emphasis): a filled dot that squashes to a line when closing.
    const dot = a.pt([0, 0, { 'gaze.x': [0.12, 0], 'gaze.y': [0, 0.1], 'eye.happy': [0, -0.2] }]);
    a.layer('eyes', 'eye', [
      { ellipse: { c: dot, rx: W, ry: H, dry: { 'eye.open': H * 0.9, 'eye.happy': -H * 0.6 } }, fill: 'eye.dark' },
    ], { sides: ['L', 'R'] });
    return a.build();
  }
  const side = view === 'side';
  const t = e.tilt;
  // Upper and lower lid curves (inner → outer).
  const lidDrop = (v: number) => v + e.lid * H;
  const upperV = side ? [-0.05, -0.85, -0.7, -0.1] : [0.04, -0.82, -0.86, -0.1];
  const upperU = side ? [-0.75, -0.35, 0.15, 0.55] : [-1, -0.42, 0.42, 1];
  const lowerU = side ? [0.55, 0.0, -0.75] : [1, 0.42, -0.45];
  const lowerV = side ? [0.0, 0.5, 0.05] : [-0.08, 0.62, 0.54];
  const r = e.roundness;
  const closeV = (u: number) => 0.28 + Math.abs(u) * -0.05;
  const upper: PS[] = upperU.map((u, i) => {
    const base = lidDrop(upperV[i]! * H * (1 + r * 0.15)) - t * u * 0.5;
    const target = closeV(u) * H;
    const d: D = {
      'eye.open': [0, base - target],
      'eye.happy': [0, -Math.abs(u) < 0.5 ? -0.55 * H : 0.0],
      'eye.lookdown': [0, 0.22 * H],
      'eye.size': [u * 0.1, 0],
    };
    return [u * W, base, d];
  });
  const lower: PS[] = lowerU.map((u, i) => {
    const base = lowerV[i]! * H * (1 + r * 0.1) - t * u * 0.5;
    const d: D = { 'eye.lower': [0, -0.42 * H * (Math.abs(u) < 0.9 ? 1 : 0.4)], 'eye.happy': [0, Math.abs(u) < 0.9 ? -0.6 * H : 0.12 * H], 'eye.size': [u * 0.1, 0] };
    return [u * W, base, d];
  });
  // White: upper curve then lower curve.
  const white = a.smooth([...upper, ...lower], true, 0.9);
  const irisR = (ill ? 0.5 : 0.6) * e.irisScale * (e.style === 'cartoon' ? 1.2 : 1) * sc;
  // Iris size control (eye.iris −1…1): ±30 % of the iris radius.
  const irisD = (kx: number, ky = 1) => ({ drx: { 'eye.iris': irisR * 0.3 * kx }, dry: { 'eye.iris': irisR * 0.3 * ky } });
  const ic = a.pt([side ? -0.3 * W : 0, 0.05 * H, { 'gaze.x': [0.38 * W, 0], 'gaze.y': [0, 0.22 * H], 'eye.lookdown': [0, 0.2 * H], 'eye.open': [0, 0] }]);
  const hl = a.pt([side ? -0.12 * W : 0.22 * irisR, -0.32 * irisR, { 'gaze.x': [0.38 * W, 0], 'gaze.y': [0, 0.22 * H] }]);
  const shapes: ShapeDef[] = [];
  shapes.push({ id: 'white', path: white, fill: ill ? 'eyewhite' : '#FFFFFF' });
  if (ill) {
    const gt = a.pt([0, -H]);
    const gb = a.pt([0, H * 0.4]);
    shapes.push({ path: white, fill: lin(gt, gb, [[0, '#C9B8AE'], [0.55, '#FFFFFF00']]), clip: 'white' });
  }
  if (ill) {
    const it = a.pt([0, -irisR, { 'gaze.x': [0.38 * W, 0], 'gaze.y': [0, 0.22 * H] }]);
    const ib = a.pt([0, irisR, { 'gaze.x': [0.38 * W, 0], 'gaze.y': [0, 0.22 * H] }]);
    shapes.push({ ellipse: { c: ic, rx: irisR * (side ? 0.55 : 1), ry: irisR, ...irisD(side ? 0.55 : 1) }, fill: lin(it, ib, [[0, 'iris.deep'], [0.6, 'iris'], [1, 'iris.light']]), clip: 'white' });
    shapes.push({ ellipse: { c: ic, rx: irisR * (side ? 0.55 : 1), ry: irisR, ...irisD(side ? 0.55 : 1) }, stroke: { c: 'iris.deep', w: 0.8 }, clip: 'white' });
  } else {
    shapes.push({ ellipse: { c: ic, rx: irisR * (side ? 0.6 : 1), ry: irisR, ...irisD(side ? 0.6 : 1) }, fill: 'iris', clip: 'white' });
  }
  shapes.push({ ellipse: { c: ic, rx: irisR * 0.48 * (side ? 0.6 : 1), ry: irisR * 0.48, ...irisD(0.48 * (side ? 0.6 : 1), 0.48) }, fill: '#15110F', clip: 'white' });
  // Pupil style (eye control): highlighted (default) and cartoon keep the catch light; round has none.
  shapes.push({ ellipse: { c: hl, rx: irisR * (ill ? 0.2 : 0.26), ry: irisR * (ill ? 0.2 : 0.26) }, fill: '#FFFFFF', clip: 'white', when: { pupil: ['', 'highlighted', 'cartoon'] } });
  const second: ShapeDef = { ellipse: { c: a.pt([-0.25 * irisR, 0.38 * irisR, { 'gaze.x': [0.38 * W, 0], 'gaze.y': [0, 0.22 * H] }]), rx: irisR * 0.12, ry: irisR * 0.12 }, fill: '#FFFFFF', clip: 'white' };
  if (e.style === 'cartoon') shapes.push(second);
  else shapes.push({ ...second, when: { pupil: 'cartoon' } });
  // Upper lid line (thick, dark) — doubles as the closed-eye line.
  const lidPath = a.smooth(upper, false, 0.9);
  shapes.push({ path: lidPath, stroke: { c: ill ? 'lash' : 'lash', w: ill ? 2.2 : 3.2 } });
  if (ill) {
    shapes.push({ path: a.smooth(lower, false, 0.9), stroke: { c: 'skin.line', w: 0.7 }, opacity: 0.8 });
  }
  // Lower lash line (eye control).
  shapes.push({ path: a.smooth(lower, false, 0.9), stroke: { c: 'lash', w: ill ? 1.1 : 1.6 }, opacity: 0.85, when: { lowerLash: 'on' } });
  // Eyelid crease (eye control): the shape's own crease unless set to none; double adds a second line.
  const creaseAt = (k: number) => upper.map(([u, v, d]) => [u * 0.92, v - k * H, { ...(d as D), 'eye.open': [0, ((d as D)['eye.open']?.[1] ?? 0) * 0.35] }] as PS);
  if (e.crease && ill) shapes.push({ path: a.smooth(creaseAt(0.42).slice(1), false), stroke: { c: 'skin.line', w: 0.8 }, opacity: 0.6, when: { crease: ['', 'single', 'double'] } });
  else shapes.push({ path: a.smooth(creaseAt(0.42).slice(1), false), stroke: { c: 'skin.line', w: ill ? 0.8 : 1.2 }, opacity: 0.6, when: { crease: ['single', 'double'] } });
  shapes.push({ path: a.smooth(creaseAt(0.62).slice(1), false), stroke: { c: 'skin.line', w: ill ? 0.7 : 1 }, opacity: 0.45, when: { crease: 'double' } });
  // Lashes (option): small strokes at the outer corner.
  const outer = upper[upper.length - 1]!;
  const lashes: ShapeDef = {
    path: a.path([['M', outer], ['L', [outer[0] + 0.32 * W, outer[1] - 0.25 * H, outer[2] as D]]]),
    stroke: { c: 'lash', w: ill ? 1.6 : 2.4 },
    when: { lashes: ['defined', 'bold'] },
  };
  shapes.push(lashes);
  // Bold lashes: a second, longer lash and a heavier lid line.
  const mid = upper[upper.length - 2]!;
  shapes.push({ path: a.path([['M', mid], ['L', [mid[0] + 0.12 * W, mid[1] - 0.42 * H, mid[2] as D]]]), stroke: { c: 'lash', w: ill ? 1.4 : 2 }, when: { lashes: 'bold' } });
  shapes.push({ path: lidPath, stroke: { c: 'lash', w: ill ? 3.4 : 4.6 }, when: { lashes: 'bold' } });
  a.layer('eyes', 'eye', shapes, { sides: ['L', 'R'] });
  return a.build();
}

export function eyesPart(name: string): PartData {
  const e = EYE_SHAPES[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) {
    families[fam] = {
      views: Object.fromEntries(VIEWS3.map((v) => [v, eyeArt(e, fam, v)])),
      exempt: { back: 'Eyes are not visible from behind.' },
    };
  }
  const spacing = name === 'wide-set' ? 0.6 : name === 'close-set' ? -0.6 : 0;
  return { slot: 'eyes', families, ...(spacing ? { params: [{ key: 'eye.spacing.bias', label: 'Spacing preset', type: 'number', default: spacing }] } : {}) };
}

/* ------------------------------------------------------------------ brows */

export interface BrowShape {
  thick: number;
  arch: number;
  peak: number;
  len: number;
  taper: number;
  joined?: boolean;
  gap?: boolean;
  bushy?: boolean;
}

export const BROW_SHAPES: Record<string, BrowShape> = {
  straight: { thick: 0.34, arch: 0.05, peak: 0.5, len: 1.15, taper: 0.5 },
  'soft-arch': { thick: 0.32, arch: 0.25, peak: 0.45, len: 1.15, taper: 0.55 },
  'high-arch': { thick: 0.3, arch: 0.45, peak: 0.55, len: 1.15, taper: 0.6 },
  angled: { thick: 0.32, arch: 0.38, peak: 0.62, len: 1.15, taper: 0.65 },
  thick: { thick: 0.52, arch: 0.15, peak: 0.5, len: 1.2, taper: 0.35 },
  thin: { thick: 0.17, arch: 0.22, peak: 0.5, len: 1.12, taper: 0.6 },
  bushy: { thick: 0.5, arch: 0.12, peak: 0.45, len: 1.2, taper: 0.25, bushy: true },
  unibrow: { thick: 0.38, arch: 0.12, peak: 0.5, len: 1.15, taper: 0.4, joined: true },
  feathered: { thick: 0.36, arch: 0.2, peak: 0.45, len: 1.15, taper: 0.5, bushy: true },
  short: { thick: 0.36, arch: 0.1, peak: 0.5, len: 0.8, taper: 0.3 },
  rounded: { thick: 0.32, arch: 0.32, peak: 0.5, len: 1.12, taper: 0.4 },
  scarred: { thick: 0.34, arch: 0.15, peak: 0.5, len: 1.15, taper: 0.5, gap: true },
};

function browArt(b: BrowShape, fam: StyleFamily, view: View) {
  const a = new Art('b');
  const ill = fam === 'illustrated';
  const side = view === 'side';
  const L = b.len * (side ? 0.75 : 1) * (fam === 'flat' ? 1.1 : 1);
  const th = b.thick * (fam === 'flat' ? 1.25 : 1);
  const x0 = side ? -0.9 : -1.0 + (b.joined ? -0.35 : 0);
  const x1 = x0 + 2 * L;
  const at = (t: number) => x0 + (x1 - x0) * t;
  const arch = (t: number) => -b.arch * Math.sin(Math.PI * Math.min(1, t / Math.max(0.2, b.peak)) * 0.5) * (t > b.peak ? 1 - (t - b.peak) / (1 - b.peak) * 0.6 : 1);
  const morph = (t: number): D => ({
    'brow.inner': [0, -0.55 * (1 - t)],
    'brow.outer': [0, -0.55 * t],
    'brow.furrow': [0.2 * (1 - t), 0.3 * (1 - t) * (1 - t)],
  });
  const ts = [0, 0.25, b.peak, 0.8, 1];
  const top: PS[] = ts.map((t) => [at(t), arch(t) - th * (1 - t * b.taper) * 0.5, morph(t)]);
  const bot: PS[] = ts.slice().reverse().map((t) => [at(t), arch(t) + th * (1 - t * b.taper) * 0.5, morph(t)]);
  const shapes: ShapeDef[] = [{ id: 'brow', path: a.smooth([...top, ...bot], true, 0.8), fill: ill ? 'brow' : 'brow' }];
  if (ill || b.bushy) {
    for (let i = 0; i < 6; i++) {
      const t = 0.08 + i * 0.16;
      shapes.push({ path: a.path([['M', [at(t), arch(t) + th * 0.35, morph(t)]], ['L', [at(t + 0.08), arch(t) - th * 0.45, morph(t)]]]), stroke: { c: 'brow.light', w: 0.6 }, opacity: 0.5, clip: 'brow' });
    }
  }
  if (b.gap) shapes.push({ path: a.path([['M', [at(0.55), -0.6, morph(0.55)]], ['L', [at(0.62), 0.6, morph(0.6)]]]), stroke: { c: 'skin', w: 2.4 } });
  a.layer('brows', 'brow', shapes, { sides: ['L', 'R'] });
  return a.build();
}

export function browPart(name: string): PartData {
  const b = BROW_SHAPES[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: Object.fromEntries([...VIEWS3].map((v) => [v, browArt(b, fam, v)])), exempt: { back: 'Brows are not visible from behind.' } };
  return { slot: 'brows', families };
}

/* ------------------------------------------------------------------ nose */

export interface NoseShape {
  len: number;
  width: number;
  bridge: number; // profile bump
  tip: number; // tip roundness
  lift: number; // upturn
  hook: number;
}

export const NOSE_SHAPES: Record<string, NoseShape> = {
  button: { len: 0.7, width: 0.7, bridge: 0, tip: 0.8, lift: 0.3, hook: 0 },
  straight: { len: 1, width: 0.8, bridge: 0.1, tip: 0.5, lift: 0, hook: 0 },
  roman: { len: 1.1, width: 0.85, bridge: 0.45, tip: 0.4, lift: -0.05, hook: 0.1 },
  aquiline: { len: 1.1, width: 0.8, bridge: 0.35, tip: 0.35, lift: -0.1, hook: 0.25 },
  snub: { len: 0.7, width: 0.85, bridge: -0.1, tip: 0.6, lift: 0.45, hook: 0 },
  wide: { len: 0.95, width: 1.25, bridge: 0, tip: 0.7, lift: 0.05, hook: 0 },
  narrow: { len: 1, width: 0.6, bridge: 0.1, tip: 0.35, lift: 0, hook: 0 },
  hooked: { len: 1.15, width: 0.85, bridge: 0.3, tip: 0.4, lift: -0.25, hook: 0.45 },
  upturned: { len: 0.85, width: 0.8, bridge: 0, tip: 0.5, lift: 0.4, hook: 0 },
  flat: { len: 0.8, width: 1.1, bridge: -0.2, tip: 0.6, lift: 0.05, hook: 0 },
  long: { len: 1.3, width: 0.8, bridge: 0.15, tip: 0.45, lift: 0, hook: 0.05 },
  rounded: { len: 0.95, width: 0.95, bridge: 0.05, tip: 1, lift: 0.05, hook: 0 },
};

function noseArt(n: NoseShape, fam: StyleFamily, view: View) {
  const a = new Art('n');
  const ill = fam === 'illustrated';
  const L = n.len * (ill ? 1.3 : 1);
  const W = n.width * (ill ? 0.9 : 0.85);
  const shapes: ShapeDef[] = [];
  if (view === 'front') {
    if (ill) {
      shapes.push({ path: a.smooth([[0.2, -1.6 * L], [0.45 * W, -0.3 * L], [0.65 * W, 0.15], [0.2, 0.32], [0.25, -0.4 * L]]), fill: 'skin.shade', opacity: 0.45, blend: 'multiply' });
      shapes.push({ path: a.path([['M', [-0.62 * W, 0.08]], ['Q', [-0.45 * W, 0.42], [-0.12 * W, 0.28]]]), stroke: { c: 'skin.line', w: 1.1 } });
      shapes.push({ path: a.path([['M', [0.62 * W, 0.08]], ['Q', [0.45 * W, 0.42], [0.12 * W, 0.28]]]), stroke: { c: 'skin.line', w: 1.1 } });
      shapes.push({ ellipse: { c: a.pt([0, 0.05]), rx: 0.3 * n.tip + 0.15, ry: 0.18 }, fill: 'skin.light', opacity: 0.6 });
    } else {
      shapes.push({ path: a.path([['M', [-0.38 * W, 0.12 - n.lift * 0.2]], ['Q', [0, 0.42], [0.38 * W, 0.12 - n.lift * 0.2]]]), stroke: { c: 'skin.deep', w: 2.6 } });
    }
  } else if (view === 'three' || view === 'side') {
    // Profile nose (facing +u). Filled so it extends the silhouette in side view.
    const s = view === 'side' ? 1.25 : 1;
    const pts: PS[] = [
      [-0.2, -1.7 * L * s],
      [0.25 + n.bridge * 0.4, -0.9 * L * s],
      [0.55 + n.hook * 0.3, -0.1 * L * s + n.lift * 0.1],
      [0.62 + n.tip * 0.12, 0.12 - n.lift * 0.25],
      [0.35, 0.3 - n.lift * 0.1],
      [0.05, 0.32],
      [-0.25, 0.3],
    ];
    shapes.push({ id: 'n', path: a.smooth(pts, true, 0.7), fill: view === 'side' ? 'skin' : 'skin', ...(ill ? { stroke: { c: 'skin.line', w: 1 } } : {}) });
    shapes.push({ path: a.smooth([[0.1, 0.06], [0.5, 0.05], [0.55, 0.22], [0.1, 0.3]]), fill: 'skin.shade', opacity: ill ? 0.6 : 1, clip: 'n' });
    shapes.push({ path: a.path([['M', [0.08, 0.16]], ['Q', [0.2, 0.08], [0.3, 0.2]]]), stroke: { c: ill ? 'skin.line' : 'skin.deep', w: ill ? 1 : 2 } });
  }
  a.layer('nose', 'nose', shapes);
  return a.build();
}

export function nosePart(name: string): PartData {
  const n = NOSE_SHAPES[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: Object.fromEntries(VIEWS3.map((v) => [v, noseArt(n, fam, v)])), exempt: { back: 'The nose is not visible from behind.' } };
  return { slot: 'nose', families };
}

/* ------------------------------------------------------------------ mouths and the 9-shape set */

export interface MouthShape {
  w: number;
  upper: number; // upper lip fullness
  lower: number; // lower lip fullness
  bow: number;
  rest: number; // rest curvature (+ up)
  asym: number;
  gap?: boolean;
  overbite?: boolean;
}

export const MOUTH_SHAPES_DEF: Record<string, MouthShape> = {
  full: { w: 1.5, upper: 0.32, lower: 0.42, bow: 0.12, rest: 0, asym: 0 },
  thin: { w: 1.45, upper: 0.14, lower: 0.2, bow: 0.05, rest: 0, asym: 0 },
  wide: { w: 1.85, upper: 0.26, lower: 0.34, bow: 0.1, rest: 0.02, asym: 0 },
  small: { w: 1.15, upper: 0.24, lower: 0.32, bow: 0.1, rest: 0, asym: 0 },
  bow: { w: 1.4, upper: 0.32, lower: 0.36, bow: 0.28, rest: 0, asym: 0 },
  downturned: { w: 1.5, upper: 0.24, lower: 0.32, bow: 0.08, rest: -0.18, asym: 0 },
  upturned: { w: 1.5, upper: 0.24, lower: 0.32, bow: 0.08, rest: 0.18, asym: 0 },
  asymmetric: { w: 1.5, upper: 0.26, lower: 0.34, bow: 0.1, rest: 0.05, asym: 0.18 },
  'gap-toothed': { w: 1.5, upper: 0.26, lower: 0.34, bow: 0.1, rest: 0.02, asym: 0, gap: true },
  overbite: { w: 1.45, upper: 0.28, lower: 0.3, bow: 0.1, rest: 0, asym: 0, overbite: true },
};

/** Opening (half-height) and width factor per mouth shape letter (Catalog A17). */
const LETTERS: Record<string, { open: number; wide: number; teeth: 'none' | 'top' | 'both' | 'onlip'; tongue: 'none' | 'low' | 'up'; round: number }> = {
  X: { open: 0, wide: 1, teeth: 'none', tongue: 'none', round: 0 },
  A: { open: 0, wide: 0.92, teeth: 'none', tongue: 'none', round: 0 },
  B: { open: 0.16, wide: 0.95, teeth: 'both', tongue: 'none', round: 0 },
  C: { open: 0.36, wide: 0.92, teeth: 'top', tongue: 'low', round: 0.1 },
  D: { open: 0.62, wide: 0.9, teeth: 'top', tongue: 'low', round: 0.15 },
  E: { open: 0.38, wide: 0.66, teeth: 'none', tongue: 'low', round: 0.55 },
  F: { open: 0.2, wide: 0.42, teeth: 'none', tongue: 'none', round: 0.9 },
  G: { open: 0.1, wide: 0.82, teeth: 'onlip', tongue: 'none', round: 0 },
  H: { open: 0.34, wide: 0.88, teeth: 'top', tongue: 'up', round: 0.1 },
};

function mouthArt(m: MouthShape, fam: StyleFamily, view: View) {
  const a = new Art('m');
  const ill = fam === 'illustrated';
  const side = view === 'side';
  const W0 = m.w * (side ? 0.55 : 1) * (ill ? 0.95 : 1.05);
  for (const [letter, spec] of Object.entries(LETTERS)) {
    const when = { mouth: letter };
    const W = W0 * spec.wide;
    const O = spec.open * (ill ? 0.95 : 1.15);
    // Corners with curvature and width morphs (expression survives speech, FR-CHR-08).
    const cd = (s: number): D => ({ 'mouth.curve': [s * 0.06, -0.42], 'mouth.width': [s * 0.35, 0] });
    const rest = (s: number) => -m.rest + s * m.asym;
    const cx = side ? 0.05 : 0;
    const L: PS = [cx - W, rest(-1), cd(-1)];
    const R: PS = [cx + W, rest(1), cd(1)];
    const shapes: ShapeDef[] = [];
    if (O <= 0.001) {
      // Closed: lips meet in a line (A presses lips).
      const press = letter === 'A' ? 0.6 : 1;
      if (ill) {
        const up: PS[] = [L, [cx - W * 0.45, -m.upper * press - m.bow * 0.3, { 'mouth.curve': [0, -0.15] }], [cx, -m.upper * press * 0.7 + m.bow * 0.2], [cx + W * 0.45, -m.upper * press - m.bow * 0.3, { 'mouth.curve': [0, -0.15] }], R, [cx, 0.02, { 'mouth.curve': [0, 0.12] }]];
        const lo: PS[] = [L, [cx, 0.02, { 'mouth.curve': [0, 0.12] }], R, [cx + W * 0.4, m.lower * press, { 'mouth.curve': [0, 0.05] }], [cx - W * 0.4, m.lower * press, { 'mouth.curve': [0, 0.05] }]];
        shapes.push({ path: a.smooth(up, true, 0.7), fill: 'lip.shade' });
        shapes.push({ path: a.smooth(lo, true, 0.8), fill: 'lip' });
        shapes.push({ path: a.smooth([L, [cx, 0.03, { 'mouth.curve': [0, 0.12] }], R], false, 0.9), stroke: { c: 'mouth.line', w: 1.2 } });
        shapes.push({ ellipse: { c: a.pt([cx + W * 0.15, m.lower * press * 0.55]), rx: W * 0.2, ry: m.lower * 0.18 }, fill: 'lip.light', opacity: 0.6 });
      } else {
        shapes.push({ path: a.smooth([L, [cx, 0.08 * (letter === 'A' ? 0 : 1), { 'mouth.curve': [0, 0.14] }], R], false, 0.9), stroke: { c: 'mouth.line', w: letter === 'A' ? 3.6 : 3 } });
      }
    } else {
      const r = spec.round;
      const top: PS[] = [L, [cx - W * 0.5, -O * 0.5 * (1 - r * 0.2) - 0.05, { 'mouth.curve': [0, -0.2] }], [cx, -O * 0.55 - 0.04], [cx + W * 0.5, -O * 0.5 * (1 - r * 0.2) - 0.05, { 'mouth.curve': [0, -0.2] }], R];
      const bot: PS[] = [[cx + W * 0.5, O * 0.9 * (1 + r * 0.2), { 'mouth.curve': [0, 0.08] }], [cx, O * 1.1 + 0.02, { 'mouth.curve': [0, 0.15] }], [cx - W * 0.5, O * 0.9 * (1 + r * 0.2), { 'mouth.curve': [0, 0.08] }]];
      shapes.push({ id: 'hole', path: a.smooth([...top, ...bot], true, 0.85), fill: 'mouth' });
      if (spec.teeth !== 'none') {
        const tH = spec.teeth === 'onlip' ? 0.24 : 0.2;
        const ty = -O * 0.55 - 0.04;
        shapes.push({ path: a.smooth([[cx - W * 0.8, ty - 0.1], [cx + W * 0.8, ty - 0.1], [cx + W * 0.7, ty + tH], [cx - W * 0.7, ty + tH]], true, 0.4), fill: 'teeth', clip: 'hole' });
        if (spec.teeth === 'both') shapes.push({ path: a.smooth([[cx - W * 0.7, O * 1.15], [cx + W * 0.7, O * 1.15], [cx + W * 0.6, O * 0.75], [cx - W * 0.6, O * 0.75]], true, 0.4), fill: 'teeth', clip: 'hole' });
        if (m.gap) shapes.push({ path: a.path([['M', [cx, ty - 0.1]], ['L', [cx, ty + tH]]]), stroke: { c: 'mouth', w: 1.6 }, clip: 'hole' });
      }
      if (spec.tongue !== 'none') {
        const up = spec.tongue === 'up';
        shapes.push({ ellipse: { c: a.pt([cx, up ? -O * 0.1 : O * 0.85]), rx: W * 0.55, ry: up ? O * 0.5 : O * 0.5 }, fill: 'tongue', clip: 'hole' });
      }
      if (ill) {
        shapes.push({ path: a.smooth([L, [cx - W * 0.45, -O * 0.5 - m.upper - 0.05, { 'mouth.curve': [0, -0.2] }], [cx, -O * 0.55 - m.upper * 0.7], [cx + W * 0.45, -O * 0.5 - m.upper - 0.05, { 'mouth.curve': [0, -0.2] }], R, ...top.slice(1, -1).reverse()], true, 0.7), fill: 'lip.shade' });
        shapes.push({ path: a.smooth([R, [cx + W * 0.45, O * 0.95 + m.lower, { 'mouth.curve': [0, 0.08] }], [cx, O * 1.15 + m.lower], [cx - W * 0.45, O * 0.95 + m.lower, { 'mouth.curve': [0, 0.08] }], L, ...bot.slice().reverse()], true, 0.7), fill: 'lip' });
      } else {
        shapes.push({ path: a.smooth([...top, ...bot], true, 0.85), stroke: { c: 'mouth.line', w: 2 } });
      }
      if (m.overbite && spec.teeth === 'none') shapes.push({ path: a.smooth([[cx - W * 0.4, -O * 0.5], [cx + W * 0.4, -O * 0.5], [cx + W * 0.35, -O * 0.2], [cx - W * 0.35, -O * 0.2]], true, 0.4), fill: 'teeth', clip: 'hole' });
    }
    a.layer('mouth', 'mouth', shapes, { when });
  }
  return a.build();
}

export function mouthPart(name: string): PartData {
  const m = MOUTH_SHAPES_DEF[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: Object.fromEntries(VIEWS3.map((v) => [v, mouthArt(m, fam, v)])), exempt: { back: 'The mouth is not drawn in back view (FR-LIP-05).' } };
  return { slot: 'mouth', families };
}

/* ------------------------------------------------------------------ ears */

export interface EarShape {
  size: number;
  width: number;
  point: number;
  lobe: number;
  out: number;
}

export const EAR_SHAPES: Record<string, EarShape> = {
  small: { size: 0.8, width: 0.9, point: 0, lobe: 0.3, out: 0 },
  average: { size: 1, width: 1, point: 0, lobe: 0.35, out: 0 },
  large: { size: 1.25, width: 1.1, point: 0, lobe: 0.4, out: 0.1 },
  pointed: { size: 1.05, width: 0.95, point: 0.5, lobe: 0.3, out: 0 },
  round: { size: 1, width: 1.15, point: 0, lobe: 0.3, out: 0 },
  'attached-lobe': { size: 1, width: 1, point: 0, lobe: 0, out: 0 },
  protruding: { size: 1.1, width: 1.2, point: 0, lobe: 0.35, out: 0.45 },
  elf: { size: 1.3, width: 0.9, point: 1.2, lobe: 0.3, out: 0.2 },
};

function earArt(e: EarShape, fam: StyleFamily, view: View) {
  const a = new Art('r');
  const ill = fam === 'illustrated';
  const s = e.size;
  const w = e.width * (view === 'front' || view === 'back' ? 0.62 + e.out * 0.4 : 0.85);
  const pts: PS[] = [
    [-0.35 * w, -0.9 * s],
    [0.3 * w, -1.05 * s - e.point * 0.6],
    [0.9 * w + e.point * 0.15, -0.7 * s - e.point * 0.7],
    [1.0 * w, 0.0],
    [0.7 * w, 0.6 * s],
    [0.25 * w, 0.95 * s + e.lobe * 0.2],
    [-0.25 * w, 0.75 * s],
  ];
  const shapes: ShapeDef[] = [
    { id: 'ear', path: a.smooth(pts, true, 0.9), fill: 'skin', ...(ill ? { stroke: { c: 'skin.line', w: 1 } } : {}) },
    { path: a.smooth([[0.05 * w, -0.55 * s], [0.6 * w, -0.45 * s], [0.62 * w, 0.2 * s], [0.25 * w, 0.4 * s], [0.25 * w, -0.1 * s]], true, 0.8), fill: 'skin.shade', opacity: ill ? 0.7 : 1, clip: 'ear' },
  ];
  a.layer('ears', 'ear', shapes, { sides: view === 'front' || view === 'back' ? ['L', 'R'] : ['R'] });
  a.anchor('earring', 'ear', [0.25 * w, 0.95 * s]);
  return a.build();
}

export function earsPart(name: string): PartData {
  const e = EAR_SHAPES[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: { front: earArt(e, fam, 'front'), three: earArt(e, fam, 'three'), side: earArt(e, fam, 'side'), back: earArt(e, fam, 'back') } };
  return { slot: 'ears', families };
}
