/**
 * Identity and access options (A20, FR-CHR-11): first-class options for every character. Each is a part whose art
 * attaches to the rig and whose `variant` data the engine reads generically: a held posture and rolling wheels
 * (wheelchair), limbs that end early (limb difference), prosthetic replacements, body and palette overrides.
 */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, RigVariant, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, type PS } from '../dsl.js';
import { ACCESSORIES } from './accessories.js';

const FAMS: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS: View[] = ['front', 'three', 'side', 'back'];
const ANGLE: Record<View, number> = { front: 0, three: 40, side: 90, back: 180 };

type Ctx = { a: Art; fam: StyleFamily; view: View; ill: boolean };
interface IdSpec { colors: Record<string, string>; draw?: (x: Ctx) => void; variant?: RigVariant; exemptAll?: string; slot?: string }

const ln = (a: Art, pts: PS[], c: string, w: number): ShapeDef => ({ path: a.path([['M', pts[0]!], ...pts.slice(1).map((p) => ['L', p] as ['L', PS])]), stroke: { c, w } });
const ell = (a: Art, u: number, v: number, rx: number, ry: number, fill: string, extra: Partial<ShapeDef> = {}): ShapeDef => ({ ellipse: { c: a.pt([u, v]), rx, ry }, fill, ...extra });
const poly = (a: Art, pts: PS[], fill: string, smooth = 0.3): ShapeDef => ({ path: smooth ? a.smooth(pts, true, smooth) : a.path([['M', pts[0]!], ...pts.slice(1).map((p) => ['L', p] as ['L', PS]), ['Z']]), fill });

/* ------------------------------------------------------------------ wheelchair: 3D frame projected per view (seat space) */

/** Seat space: origin at the pelvis, units of leg length; seated hips sit ≈ 0.63 above the ground. */
const GROUND = 0.63;
const R = 0.31;

function wheelchair({ a, view }: Ctx) {
  const th = (ANGLE[view] * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  // Body space: x across, y up, z forward → seat-space (u right, v down) and depth (larger is nearer).
  const P = (x: number, y: number, z: number): PS => [x * cos + z * sin, -y];
  const depth = (x: number, z: number) => z * cos - x * sin;
  const near: ShapeDef[] = [];
  const far: ShapeDef[] = [];
  const put = (s: ShapeDef, x: number, z: number) => (depth(x, z) > 0.02 ? near : far).push(s);
  const W = 0.4;
  const cy = -GROUND + R;
  const cz = -0.06;
  for (const x of [-W, W]) {
    const [u, v] = P(x, cy, cz);
    const rx = Math.max(0.035, R * Math.abs(sin));
    put(ell(a, u, v, rx, R, 'chair.deep'), x, cz);
    put(ell(a, u, v, rx * 0.86, R * 0.86, 'chair.light', { opacity: 0.35 }), x, cz);
    // Spokes turn with the distance rolled: rim point = centre + cos·(z axis) + sin·(y axis).
    const spokes: ShapeDef[] = [];
    for (const [c, s] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const rim: PS = [u, v, { 'wheel.cos': [c * R * 0.84 * sin, -s * R * 0.84], 'wheel.sin': [-s * R * 0.84 * sin, -c * R * 0.84] }];
      spokes.push({ path: a.path([['M', [u, v]], ['L', rim]]), stroke: { c: 'chair.line', w: 1.4 } });
    }
    for (const s of spokes) put(s, x, cz);
    put(ell(a, u, v, Math.max(0.02, 0.05 * Math.abs(sin)), 0.05, 'chair'), x, cz);
    // Push rim.
    put({ ellipse: { c: a.pt([u, v]), rx: Math.max(0.03, R * 0.92 * Math.abs(sin)), ry: R * 0.92 }, stroke: { c: 'chair.line', w: 2 } }, x * 1.05, cz);
    // Front caster.
    const [cu, cv] = P(x * 0.8, -GROUND + 0.07, 0.46);
    put(ell(a, cu, cv, Math.max(0.025, 0.07 * Math.abs(sin)), 0.07, 'chair.deep'), x, 0.46);
  }
  // Seat, backrest, frame and footrest (behind the body except from the back).
  const seat = poly(a, [P(-0.3, -0.06, -0.16), P(0.3, -0.06, -0.16), P(0.3, -0.1, 0.36), P(-0.3, -0.1, 0.36)], 'seat', 0);
  const back: ShapeDef[] = [poly(a, [P(-0.3, -0.04, -0.2), P(0.3, -0.04, -0.2), P(0.3, 0.46, -0.24), P(-0.3, 0.46, -0.24)], 'seat', 0)];
  for (const x of [-0.31, 0.31]) back.push(ln(a, [P(x, -0.12, -0.2), P(x, 0.52, -0.25), P(x, 0.52, -0.36)], 'chair', 3));
  const frame: ShapeDef[] = [];
  for (const x of [-0.3, 0.3]) {
    frame.push(ln(a, [P(x, -0.1, 0.36), P(x, -GROUND + 0.14, 0.5)], 'chair', 2.6));
    frame.push(ln(a, [P(x, -0.1, -0.16), P(x, -0.1, 0.36)], 'chair', 2.6));
  }
  frame.push(poly(a, [P(-0.26, -GROUND + 0.16, 0.48), P(0.26, -GROUND + 0.16, 0.48), P(0.26, -GROUND + 0.12, 0.62), P(-0.26, -GROUND + 0.12, 0.62)], 'chair.deep', 0));
  if (view === 'back') {
    a.layer('acc.back', 'seat', [seat, ...frame, ...far]);
    a.layer('acc.waist', 'seat', [...back, ...near]);
  } else {
    a.layer('acc.back', 'seat', [...back, seat, ...frame, ...far]);
    if (near.length) a.layer('acc.waist', 'seat', near);
  }
}

/* ------------------------------------------------------------------ mobility aids held in the hand */

/** Wrist-to-ground length in hand units for each family's proportions (standing, arm relaxed). */
const REACH: Record<StyleFamily, number> = { flat: 6.0, illustrated: 9.6 };

function cane({ a, fam }: Ctx) {
  const L = REACH[fam];
  a.layer('acc.hand.*', 'handR', [ln(a, [[0, 0.72], [0, L]], 'aid', 7), { path: a.smooth([[0, 0.72], [-0.45, 0.6], [-0.7, 0.8]], false, 0.8), stroke: { c: 'aid', w: 5 } }, ell(a, 0, L, 0.12, 0.06, 'aid.deep')]);
}

function crutches({ a, fam }: Ctx) {
  const L = REACH[fam];
  a.layer('acc.hand.*', 'hand', [
    ln(a, [[0.05, -1.6], [0.05, L]], 'aid', 4.2),
    poly(a, [[-0.35, -1.75], [0.45, -1.75], [0.45, -1.3], [-0.35, -1.3]], 'aid.deep', 0.3),
    ln(a, [[-0.4, 0.7], [0.5, 0.7]], 'aid.deep', 5),
    ell(a, 0.05, L, 0.14, 0.07, 'aid.deep'),
  ], { sides: ['L', 'R'] });
}

/* ------------------------------------------------------------------ hearing */

function hearing(kind: 'aid' | 'implant'): (x: Ctx) => void {
  return ({ a, view }) => {
    const sides: ('L' | 'R')[] = view === 'front' || view === 'back' ? ['L', 'R'] : ['R'];
    if (kind === 'aid') a.layer('acc.ears', 'ear', [poly(a, [[0.45, -0.9], [0.75, -0.7], [0.72, 0.1], [0.5, 0.15]], 'device', 0.6), ln(a, [[0.48, -0.88], [0.2, -0.5], [0.15, -0.1]], 'device.deep', 1.2)], { sides });
    else a.layer('acc.ears', 'ear', [ell(a, 0.9, -1.25, 0.42, 0.42, 'device'), ell(a, 0.9, -1.25, 0.16, 0.16, 'device.deep'), ln(a, [[0.75, -0.9], [0.6, -0.3]], 'device.deep', 1.4), poly(a, [[0.45, -0.7], [0.72, -0.55], [0.7, 0.2], [0.5, 0.2]], 'device', 0.6)], { sides });
  };
}

/* ------------------------------------------------------------------ prosthetics */

function prostheticArm({ a, ill }: Ctx) {
  a.limb('arm.*', { limb: 'armR', from: 0.5, to: 1, width: 0.86, fill: 'metal', ...(ill ? { shade: 'metal.shade' } : {}), outline: 'metal.line', cap: 'round' });
  a.limb('arm.*', { limb: 'armR', from: 0.48, to: 0.56, width: 1.12, fill: 'socket', cap: 'butt' });
}

function prostheticLeg({ a, ill }: Ctx) {
  a.limb('leg.*', { limb: 'legR', from: 0.48, to: 0.58, width: 1.1, fill: 'socket', cap: 'butt' });
  a.limb('leg.*', { limb: 'legR', from: 0.56, to: 1, width: 0.42, fill: 'metal', ...(ill ? { shade: 'metal.shade' } : {}), outline: 'metal.line', cap: 'round' });
}

/* ------------------------------------------------------------------ guide dog (character space, beside the owner) */

function guideDog({ a, view }: Ctx) {
  // A seated guide dog in profile beside the owner's feet, with its harness handle (character units, y down).
  const x0 = view === 'side' ? 70 : 95;
  const shapes: ShapeDef[] = [
    poly(a, [[x0, -8], [x0 + 18, -70], [x0 + 70, -88], [x0 + 112, -60], [x0 + 118, -8]], 'dog', 0.5),
    ell(a, x0 + 40, -112, 28, 24, 'dog'),
    poly(a, [[x0 + 18, -112], [x0 + 6, -100], [x0 + 8, -82], [x0 + 22, -92]], 'dog.deep', 0.5),
    ell(a, x0 + 20, -108, 9, 6, 'dog.deep'),
    ell(a, x0 + 46, -116, 3, 3, 'eye'),
    ell(a, x0 + 15, -104, 4, 3, 'nose'),
    ln(a, [[x0 + 40, -76], [x0 + 92, -76]], 'harness', 5),
    ln(a, [[x0 + 66, -80], [x0 + 52, -150], [x0 + 20, -168]], 'harness', 4),
    ell(a, x0 + 30, -6, 14, 6, 'dog.deep'),
    ell(a, x0 + 100, -6, 14, 6, 'dog.deep'),
  ];
  a.layer('acc.back', 'stage', shapes);
}

export const IDENTITY: Record<string, IdSpec> = {
  wheelchair: { colors: { chair: '#3A3F48', seat: '#2B2F36' }, draw: wheelchair, variant: { posture: 'seated', rolling: { radius: R } } },
  'walking-cane': { colors: { aid: '#5A3E2B' }, draw: cane },
  crutches: { colors: { aid: '#A9B0BA' }, draw: crutches },
  'hearing-aid': { colors: { device: '#C9B9A8' }, draw: hearing('aid') },
  'cochlear-implant': { colors: { device: '#4A4E58' }, draw: hearing('implant') },
  'prosthetic-arm': { colors: { metal: '#A9B0BA', socket: '#2E323A' }, draw: prostheticArm, variant: { replace: { armR: 0.5 } } },
  'prosthetic-leg': { colors: { metal: '#A9B0BA', socket: '#2E323A' }, draw: prostheticLeg, variant: { replace: { legR: 0.56 } } },
  'glasses-prescription': { colors: ACCESSORIES['rectangular-glasses']!.colors, draw: (x) => ACCESSORIES['rectangular-glasses']!.draw({ ...x, line: () => ({}) }) },
  'guide-dog-companion': { colors: { dog: '#D8B07A', 'dog.deep': '#A87F4F', harness: '#2E2E34', eye: '#1A1410', nose: '#1A1410' }, draw: guideDog },
  'visible-pregnancy': { colors: {}, variant: { body: { belly: 100, bust: 62 } }, exemptAll: 'A body variant: the character’s own body shape changes; nothing extra is drawn.' },
  'albinism-palette': { colors: {}, variant: { palette: { skin: '#F6E4DB', hair: '#F2ECE1', brow: '#EAE1D2', lash: '#E0D5C3', eye: '#9DB8CC' } }, exemptAll: 'A palette variant: skin, hair, brow, lash and eye colours change; nothing extra is drawn.' },
  'limb-difference': { colors: {}, variant: { truncate: { armL: 0.62 } }, exemptAll: 'An arm variant: the left forearm ends below the elbow; nothing extra is drawn.' },
};

export function identityPart(name: string): PartData {
  const spec = IDENTITY[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) {
    if (spec.exemptAll) {
      families[fam] = { views: {}, exempt: Object.fromEntries(VIEWS.map((v) => [v, spec.exemptAll!])) };
      continue;
    }
    const views: Record<string, ReturnType<Art['build']>> = {};
    for (const view of VIEWS) {
      const a = new Art('i');
      spec.draw!({ a, fam, view, ill: fam === 'illustrated' });
      views[view] = a.build();
    }
    families[fam] = { views };
  }
  const main = Object.keys(spec.colors)[0];
  return { slot: 'identity', families, ...(main ? { colorSlot: main } : {}), colors: spec.colors, ...(spec.variant ? { variant: spec.variant } : {}) };
}
