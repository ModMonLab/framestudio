/** Family base body (torso, pelvis, neck and limbs), hand poses (A15) and foot bases (A16). */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, lin, mx, type PS } from '../dsl.js';

const FAMS: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS: View[] = ['front', 'three', 'side', 'back'];

/** Torso silhouette in torso space (u = ±1 at the body surface, v 0 = shoulder line, 1 = hip line). */
export function torsoOutline(scale = 1, top = -0.16): PS[] {
  const s = scale;
  const right: PS[] = [
    [0.32 * s, top],
    [0.72 * s, top + 0.02],
    [0.98 * s, 0.04],
    [1.0 * s, 0.3],
    [0.98 * s, 0.66],
    [1.0 * s, 1.0],
    [0.92 * s, 1.08],
  ];
  return [...right, ...right.slice().reverse().map(mx)];
}

function bodyArt(fam: StyleFamily, view: View) {
  const a = new Art('t');
  const ill = fam === 'illustrated';
  const lineW = ill ? 1.1 : 0;
  // Limbs: skin chains. Garments cover them with their own limb layers.
  const shade = ill ? 'skin.shade' : undefined;
  a.limb('arm.*', { limb: 'arms', from: 0, to: 1, width: 1, fill: 'skin', ...(shade ? { shade } : {}), outline: 'skin.line' });
  a.limb('leg.*', { limb: 'legs', from: 0, to: 1, width: 1, fill: 'skin', ...(shade ? { shade } : {}), outline: 'skin.line' });
  a.limb('neck', { limb: 'neck', from: 0, to: 1, width: 1, fill: 'skin', ...(shade ? { shade } : {}), outline: 'skin.line' });
  const top = a.pt([0, -0.2], 'gt');
  const bot = a.pt([0.3, 1.05], 'gb');
  const torso: ShapeDef = {
    id: 'torso', path: a.smooth(torsoOutline(), true, 0.85),
    fill: ill ? lin(top, bot, [[0, 'skin.light'], [0.6, 'skin'], [1, 'skin.shade']]) : 'skin',
    ...(ill ? { stroke: { c: 'skin.line', w: lineW } } : {}),
  };
  a.layer('body.torso', 'torso', [torso]);
  a.layer('body.pelvis', 'pelvis', [{ path: a.smooth([[-1, -0.1], [1, -0.1], [0.95, 0.6], [0.3, 1.02], [-0.3, 1.02], [-0.95, 0.6]], true, 0.7), fill: 'skin' }]);
  void view;
  return a.build();
}

export function bodyPart(): PartData {
  const families: PartData['families'] = {};
  for (const fam of FAMS) families[fam] = { views: Object.fromEntries(VIEWS.map((v) => [v, bodyArt(fam, v)])) };
  return { slot: 'body', families };
}

/* ------------------------------------------------------------------ hands (A15) */

/** Finger: [u at knuckle, length (0 = curled), angle in degrees from the hand axis]. */
type Finger = [number, number, number];

interface HandPose {
  fingers: [Finger, Finger, Finger, Finger];
  thumb: [number, number];
  /** Palm compression (fist). */
  palm: number;
}

const ext = (u: number, ang = 0): Finger => [u, 1, ang];
const curl = (u: number): Finger => [u, 0, 0];
const half = (u: number, ang = 0): Finger => [u, 0.5, ang];

export const HAND_POSES: Record<string, HandPose> = {
  relaxed: { fingers: [half(-0.32, 4), half(-0.1, 2), half(0.12, -2), half(0.32, -6)], thumb: [-30, 0.7], palm: 1 },
  'open-palm': { fingers: [ext(-0.36, 12), ext(-0.12, 4), ext(0.12, -4), ext(0.36, -12)], thumb: [-55, 1], palm: 1 },
  fist: { fingers: [curl(-0.3), curl(-0.1), curl(0.1), curl(0.3)], thumb: [-10, 0.4], palm: 0.85 },
  point: { fingers: [ext(-0.3, 0), curl(-0.1), curl(0.1), curl(0.3)], thumb: [-20, 0.5], palm: 0.9 },
  'thumbs-up': { fingers: [curl(-0.3), curl(-0.1), curl(0.1), curl(0.3)], thumb: [-95, 1], palm: 0.85 },
  'thumbs-down': { fingers: [curl(-0.3), curl(-0.1), curl(0.1), curl(0.3)], thumb: [85, 1], palm: 0.85 },
  peace: { fingers: [ext(-0.32, 10), ext(-0.1, -6), curl(0.12), curl(0.32)], thumb: [-15, 0.5], palm: 0.9 },
  ok: { fingers: [half(-0.32, -25), ext(-0.1, 2), ext(0.12, -4), ext(0.34, -10)], thumb: [-25, 0.6], palm: 1 },
  grip: { fingers: [half(-0.3, 30), half(-0.1, 30), half(0.1, 30), half(0.3, 30)], thumb: [-40, 0.7], palm: 0.95 },
  pinch: { fingers: [half(-0.3, -20), curl(-0.1), curl(0.1), curl(0.3)], thumb: [-25, 0.65], palm: 0.92 },
  'wave-flat': { fingers: [ext(-0.33, 6), ext(-0.11, 2), ext(0.11, -2), ext(0.33, -6)], thumb: [-40, 0.9], palm: 1 },
  'count-one': { fingers: [ext(-0.3, 0), curl(-0.1), curl(0.1), curl(0.3)], thumb: [-5, 0.4], palm: 0.9 },
  'count-two': { fingers: [ext(-0.32, 6), ext(-0.1, -2), curl(0.12), curl(0.32)], thumb: [-5, 0.4], palm: 0.9 },
  'count-three': { fingers: [ext(-0.33, 8), ext(-0.11, 0), ext(0.11, -6), curl(0.32)], thumb: [-5, 0.4], palm: 0.95 },
  'count-four': { fingers: [ext(-0.35, 10), ext(-0.12, 3), ext(0.12, -3), ext(0.35, -10)], thumb: [-5, 0.4], palm: 1 },
  'count-five': { fingers: [ext(-0.36, 12), ext(-0.12, 4), ext(0.12, -4), ext(0.36, -14)], thumb: [-60, 1], palm: 1 },
  clasped: { fingers: [half(-0.3, 50), half(-0.1, 50), half(0.1, 50), half(0.3, 50)], thumb: [-20, 0.6], palm: 0.9 },
  cupped: { fingers: [half(-0.34, 15), half(-0.12, 8), half(0.12, -8), half(0.34, -15)], thumb: [-45, 0.8], palm: 1 },
  typing: { fingers: [half(-0.33, 0), half(-0.11, 0), half(0.11, 0), half(0.33, 0)], thumb: [-35, 0.6], palm: 1 },
  'phone-hold': { fingers: [half(-0.3, 40), half(-0.1, 40), half(0.1, 40), half(0.3, 40)], thumb: [-70, 0.85], palm: 0.95 },
};

function fingerPath(f: Finger, width: number, palmEnd: number): PS[] {
  const [u, l, ang] = f;
  const len = 0.15 + l * 0.42;
  const r = (ang * Math.PI) / 180;
  const base: PS = [u, palmEnd - 0.05];
  const tip: PS = [u + Math.sin(r) * len, palmEnd + Math.cos(r) * len];
  const nx = Math.cos(r) * width;
  const ny = -Math.sin(r) * width;
  return [[base[0] - nx, base[1] - ny], [tip[0] - nx, tip[1] - ny], [tip[0] + Math.sin(r) * width * 0.9, tip[1] + Math.cos(r) * width * 0.9], [tip[0] + nx, tip[1] + ny], [base[0] + nx, base[1] + ny]];
}

export function handsPart(): PartData {
  const families: PartData['families'] = {};
  for (const fam of FAMS) {
    families[fam] = {
      views: Object.fromEntries(VIEWS.map((v) => {
        const out = new Art('k');
        for (const [name, pose] of Object.entries(HAND_POSES)) {
          // A prefixed Art per pose keeps point names unique; points are merged into the view art.
          const part = new Art(`${name.replace(/-/g, '')}_`);
          const shapes = handArtInto(part, pose, fam, v);
          Object.assign(out.points, part.points);
          out.layer('hand.*', 'hand', shapes, { sides: ['L', 'R'], when: { hand: name } });
        }
        out.anchor('grip', 'hand', [0, 0.72]);
        return [v, out.build()];
      })),
    };
  }
  return { slot: 'hands', families };
}

function handArtInto(a: Art, pose: HandPose, fam: StyleFamily, view: View): ShapeDef[] {
  const ill = fam === 'illustrated';
  const squeeze = view === 'side' ? 0.72 : 1;
  const P = pose.palm;
  const palmEnd = 0.62 * P;
  const shapes: ShapeDef[] = [];
  const palm: PS[] = [[-0.36 * squeeze, 0.0], [0.36 * squeeze, 0.0], [0.44 * squeeze, palmEnd * 0.6], [0.4 * squeeze, palmEnd], [-0.42 * squeeze, palmEnd], [-0.46 * squeeze, palmEnd * 0.55]];
  const fw = (ill ? 0.085 : 0.1) * squeeze;
  const stroke = ill ? { stroke: { c: 'skin.line', w: 0.9 } } : {};
  for (const f of pose.fingers) {
    const sf: Finger = [f[0] * squeeze, f[1], f[2]];
    if (f[1] <= 0.01) shapes.push({ ellipse: { c: a.pt([sf[0], palmEnd + 0.02]), rx: fw * 1.15, ry: fw * 1.05 }, fill: 'skin', ...stroke });
    else shapes.push({ path: a.smooth(fingerPath(sf, fw, palmEnd), true, 0.6), fill: 'skin', ...stroke });
  }
  shapes.push({ id: 'palm', path: a.smooth(palm, true, 0.7), fill: 'skin', ...stroke });
  const [tAng, tLen] = pose.thumb;
  const r = (tAng * Math.PI) / 180;
  const tb: PS = [-0.36 * squeeze, palmEnd * 0.35];
  const L = 0.2 + tLen * 0.3;
  const tt: PS = [tb[0] + Math.sin(r) * L, tb[1] + Math.cos(r) * L];
  const tw = fw * 1.15;
  shapes.push({ path: a.smooth([[tb[0] - tw, tb[1] - tw], [tt[0] - tw * 0.8, tt[1]], [tt[0], tt[1] + tw], [tt[0] + tw * 0.8, tt[1]], [tb[0] + tw, tb[1] + tw]], true, 0.6), fill: 'skin', ...stroke });
  shapes.push({ path: a.smooth([[0.12 * squeeze, 0.05], [0.42 * squeeze, 0.08], [0.38 * squeeze, palmEnd * 0.95], [0.14 * squeeze, palmEnd * 0.7]], true, 0.8), fill: 'skin.shade', ...(ill ? { opacity: 0.6, blend: 'multiply' as const } : {}), clip: 'palm' });
  return shapes;
}

/* ------------------------------------------------------------------ feet (A16) */

export const FOOT_BASES: Record<string, { heel: number; toe: number; height: number; bare: boolean }> = {
  barefoot: { heel: 0, toe: 1, height: 0.22, bare: true },
  flat: { heel: 0, toe: 1, height: 0.22, bare: false },
  heel: { heel: 0.35, toe: 0.95, height: 0.2, bare: false },
  boot: { heel: 0.08, toe: 1.02, height: 0.3, bare: false },
  sneaker: { heel: 0.04, toe: 1.04, height: 0.26, bare: false },
};

/** Foot shape in foot space (origin ankle, +u forward, v down, unit = foot length). */
export function footShape(view: View, heel: number, toe: number, height: number, widen = 1): PS[] {
  if (view === 'side' || view === 'three') {
    const k = view === 'three' ? 0.75 : 1;
    return [[-0.22 * k, -0.08], [0.1 * k, -0.1], [0.5 * toe * k, height * 0.3 - heel * 0.2], [0.82 * toe * k, height * 0.75 - heel * 0.2], [0.85 * toe * k, height + 0.04 - heel * 0.1], [-0.2 * k, height + 0.04], [-0.26 * k, height * 0.5]].map(([u, v]) => [u, (v ?? 0) * widen] as PS);
  }
  const w = 0.2 * widen;
  return [[-w, -0.06], [w, -0.06], [w * 1.15, height * 0.8], [w * 0.9, height + 0.05], [-w * 0.9, height + 0.05], [-w * 1.15, height * 0.8]];
}

export function feetPart(name: string): PartData {
  const fb = FOOT_BASES[name]!;
  const families: PartData['families'] = {};
  for (const fam of FAMS) {
    families[fam] = {
      views: Object.fromEntries(VIEWS.map((v) => {
        const a = new Art('f');
        const ill = fam === 'illustrated';
        a.layer('foot.*', 'foot', [{ path: a.smooth(footShape(v, fb.heel, fb.toe, fb.height), true, 0.7), fill: 'skin', ...(ill ? { stroke: { c: 'skin.line', w: 0.9 } } : {}) }], { sides: ['L', 'R'] });
        return [v, a.build()];
      })),
    };
  }
  return { slot: 'feet', families, params: [{ key: 'heelLift', label: 'Heel lift', type: 'number', default: fb.heel }] };
}
