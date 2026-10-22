/**
 * rig.biped@1 — a "3D-lite" skeleton. Joints live in a small 3D body space (X = character's left, Y = up, Z = forward)
 * so one pose drives all four views; each view projects the solved joints to 2D (FR-CHR-03/05, D-04).
 * Character space on screen: origin on the ground between the feet, x right, y down.
 */
import type { View } from '@frame/schema';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const VIEW_ANGLE: Record<View, number> = { front: 0, three: 40, side: 90, back: 180 };

/** Body proportions (all lengths in character units; an adult Flat character is ~600 units tall). */
export interface BodyDims {
  height: number;
  headH: number;
  headW: number;
  neckLen: number;
  neckW: number;
  shoulderW: number;
  chestW: number;
  waistW: number;
  hipW: number;
  torsoLen: number;
  pelvisLen: number;
  upperArm: number;
  foreArm: number;
  armW: number;
  thigh: number;
  shin: number;
  legW: number;
  handSize: number;
  footLen: number;
  stoop: number;
  belly: number;
  bust: number;
}

export const JOINTS = [
  'root', 'pelvis', 'waist', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'toeL', 'hipR', 'kneeR', 'ankleR', 'toeR',
] as const;
export type Joint = (typeof JOINTS)[number];

export type Side = 'L' | 'R';

export interface LimbTarget {
  /** Target in body space relative to the limb root, in units of limb length (|t| ≤ 1). */
  t: Vec3;
  /** Elbow/knee hint direction in body space. */
  pole?: Vec3;
}

/** A solved-able pose. Angles in degrees. Missing fields mean rest. */
export interface Pose {
  posture: 'standing' | 'seated' | 'crouched' | 'kneeling' | 'lying';
  /** Whole-body offset in character units (screen x, screen y) — locomotion bob, jumps. */
  offset: Vec2;
  /** Spine: forward bend (+ bows forward), side tilt (+ leans to character's left), twist. */
  spine: { pitch: number; roll: number; yaw: number };
  head: { yaw: number; pitch: number; roll: number };
  /** Shoulder shrug 0..1. */
  shrug: number;
  /** Breathing 0..1 (chest scale). */
  breath: number;
  armL: LimbTarget;
  armR: LimbTarget;
  legL: LimbTarget;
  legR: LimbTarget;
  handL: string;
  handR: string;
  /** Squash/stretch: >1 stretches vertically (FR-ACT-09). */
  stretch: number;
}

export const REST_POSE: Pose = {
  posture: 'standing',
  offset: [0, 0],
  spine: { pitch: 0, roll: 0, yaw: 0 },
  head: { yaw: 0, pitch: 0, roll: 0 },
  shrug: 0,
  breath: 0,
  armL: { t: [0.14, -0.97, 0.06] },
  armR: { t: [0.14, -0.97, 0.06] },
  legL: { t: [0.02, -1, 0] },
  legR: { t: [0.02, -1, 0] },
  handL: 'relaxed',
  handR: 'relaxed',
  stretch: 1,
};

/* ------------------------------------------------------------------ vector helpers */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mulv = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rad = (d: number) => (d * Math.PI) / 180;

function rotX(p: Vec3, deg: number, about: Vec3): Vec3 {
  const q = sub(p, about);
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return add([q[0], q[1] * c - q[2] * s, q[1] * s + q[2] * c], about);
}
function rotZ(p: Vec3, deg: number, about: Vec3): Vec3 {
  const q = sub(p, about);
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return add([q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2]], about);
}
function rotY(p: Vec3, deg: number, about: Vec3): Vec3 {
  const q = sub(p, about);
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  return add([q[0] * c + q[2] * s, q[1], -q[0] * s + q[2] * c], about);
}

/** Two-bone IK in 3D with a pole hint; returns the middle joint (elbow/knee) and the clamped end. */
export function ik2(root: Vec3, target: Vec3, a: number, b: number, pole: Vec3): { mid: Vec3; end: Vec3 } {
  let d = sub(target, root);
  let dist = len(d);
  const maxReach = (a + b) * 0.999;
  const minReach = Math.abs(a - b) * 1.001 + 1e-6;
  if (dist > maxReach) {
    d = mulv(norm(d), maxReach);
    dist = maxReach;
  } else if (dist < minReach) {
    d = mulv(norm(d.every((x) => x === 0) ? [0, -1, 0] : d), minReach);
    dist = minReach;
  }
  const dir = norm(d);
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  let n = sub(pole, mulv(dir, dot(pole, dir)));
  if (len(n) < 1e-6) n = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
  n = norm(n);
  const mid = add(root, add(mulv(dir, a * cosA), mulv(n, a * sinA)));
  return { mid, end: add(root, d) };
}

/* ------------------------------------------------------------------ solving */

export type Joints3 = Record<Joint, Vec3>;

/**
 * Solves body-space joint positions for a pose (deterministic, pure).
 * Posture changes set pelvis height and default leg targets; explicit leg targets in the pose still apply.
 */
export function solvePose(dims: BodyDims, pose: Pose): Joints3 {
  const legLen = dims.thigh + dims.shin;
  const ankleH = dims.footLen * 0.18;
  let pelvisY = legLen + ankleH;
  let legL = pose.legL;
  let legR = pose.legR;
  let pelvisZ = 0;
  if (pose.posture === 'seated') {
    // Seat height ≈ knee height; thighs forward, shins down.
    pelvisY = dims.shin + ankleH + dims.legW * 0.4;
    pelvisZ = -dims.thigh * 0.1;
    const t = (side: number): LimbTarget => ({ t: [side * 0.08, -dims.shin / legLen, (dims.thigh * 0.95) / legLen], pole: [0, 0.3, 1] });
    if (pose.legL === REST_POSE.legL) legL = t(1);
    if (pose.legR === REST_POSE.legR) legR = t(1);
  } else if (pose.posture === 'crouched') {
    pelvisY = legLen * 0.55 + ankleH;
    if (pose.legL === REST_POSE.legL) legL = { t: [0.1, -0.55, 0.25], pole: [0.2, 0, 1] };
    if (pose.legR === REST_POSE.legR) legR = { t: [0.1, -0.55, 0.25], pole: [0.2, 0, 1] };
  } else if (pose.posture === 'kneeling') {
    pelvisY = dims.thigh + dims.legW * 0.4;
    if (pose.legL === REST_POSE.legL) legL = { t: [0.05, -dims.thigh / legLen, -0.62], pole: [0, 0, 1] };
    if (pose.legR === REST_POSE.legR) legR = { t: [0.05, -dims.thigh / legLen, -0.62], pole: [0, 0, 1] };
  } else if (pose.posture === 'lying') {
    pelvisY = dims.legW * 0.6;
  }
  const s = pose.stretch;
  const pelvis: Vec3 = [0, pelvisY, pelvisZ];
  const waist: Vec3 = [0, pelvisY + dims.pelvisLen * s, pelvisZ];
  const chest0: Vec3 = [0, pelvisY + (dims.pelvisLen + dims.torsoLen * 0.62) * s, pelvisZ - dims.stoop * 0.3];
  const neck0: Vec3 = [0, pelvisY + (dims.pelvisLen + dims.torsoLen) * s, pelvisZ - dims.stoop];
  const shrug = pose.shrug * dims.headH * 0.12;
  const shY = neck0[1] - dims.torsoLen * 0.06 + shrug;
  const shL0: Vec3 = [dims.shoulderW * 0.42, shY, pelvisZ - dims.stoop * 0.8];
  const shR0: Vec3 = [-dims.shoulderW * 0.42, shY, pelvisZ - dims.stoop * 0.8];
  const head0: Vec3 = [0, neck0[1] + dims.neckLen * s + dims.headH * 0.5, neck0[2] + dims.stoop * 0.6];

  // Spine rotation about the pelvis: pitch (bow forward = rotate toward +Z), roll, yaw.
  const sp = pose.spine;
  const xf = (p: Vec3) => rotY(rotZ(rotX(p, -sp.pitch, waist), sp.roll, waist), sp.yaw, waist);
  let chest = xf(chest0);
  let neck = xf(neck0);
  let shL = xf(shL0);
  let shR = xf(shR0);
  let head = xf(head0);
  if (pose.posture === 'lying') {
    // Lying: rotate the whole upper body to horizontal (head toward -Z… shown in side view).
    const r = (p: Vec3) => rotX(p, 90, pelvis);
    chest = r(chest);
    neck = r(neck);
    shL = r(shL);
    shR = r(shR);
    head = r(head);
  }

  const armLen = dims.upperArm + dims.foreArm;
  const arm = (sh: Vec3, tg: LimbTarget, side: number) => {
    const target = add(sh, mulv([tg.t[0] * side, tg.t[1], tg.t[2]], armLen));
    const pole = tg.pole ? ([tg.pole[0] * side, tg.pole[1], tg.pole[2]] as Vec3) : ([side * 0.35, -0.2, -1] as Vec3);
    return ik2(sh, target, dims.upperArm, dims.foreArm, pole);
  };
  const aL = arm(shL, pose.armL, 1);
  const aR = arm(shR, pose.armR, -1);

  const hipL: Vec3 = [dims.hipW * 0.32, pelvisY - dims.legW * 0.15, pelvisZ];
  const hipR: Vec3 = [-dims.hipW * 0.32, pelvisY - dims.legW * 0.15, pelvisZ];
  const leg = (hip: Vec3, tg: LimbTarget, side: number) => {
    const target = add(hip, mulv([tg.t[0] * side, tg.t[1], tg.t[2]], legLen));
    const pole = tg.pole ? ([tg.pole[0] * side, tg.pole[1], tg.pole[2]] as Vec3) : ([side * 0.05, 0, 1] as Vec3);
    return ik2(hip, target, dims.thigh, dims.shin, pole);
  };
  const lL = leg(hipL, legL, 1);
  const lR = leg(hipR, legR, -1);
  const toe = (ankle: Vec3): Vec3 => [ankle[0], ankle[1] - ankleH * 0.6, ankle[2] + dims.footLen * 0.75];

  const j: Joints3 = {
    root: [0, 0, 0], pelvis, waist, chest, neck, head,
    shoulderL: shL, elbowL: aL.mid, wristL: aL.end, shoulderR: shR, elbowR: aR.mid, wristR: aR.end,
    hipL, kneeL: lL.mid, ankleL: lL.end, toeL: toe(lL.end), hipR, kneeR: lR.mid, ankleR: lR.end, toeR: toe(lR.end),
  };
  // Feet never go below the ground.
  for (const k of ['ankleL', 'ankleR'] as const) if (j[k][1] < ankleH) j[k] = [j[k][0], ankleH, j[k][2]];
  for (const k of ['toeL', 'toeR'] as const) if (j[k][1] < 0) j[k] = [j[k][0], 0, j[k][2]];
  return j;
}

export interface Projected {
  /** Screen position in character space (y down). */
  p: Vec2;
  /** Depth toward the camera (larger = nearer). */
  depth: number;
}

/** Projects a body-space point for a view; `flip` mirrors for left-facing (FR-CHR-03). */
export function project(v: Vec3, view: View, flip: boolean): Projected {
  const th = rad(VIEW_ANGLE[view]);
  const x = v[0] * Math.cos(th) + v[2] * Math.sin(th);
  const depth = v[2] * Math.cos(th) - v[0] * Math.sin(th);
  return { p: [flip ? -x : x, -v[1]], depth };
}

export function projectAll(j: Joints3, view: View, flip: boolean, offset: Vec2 = [0, 0]): Record<Joint, Projected> {
  const out = {} as Record<Joint, Projected>;
  for (const k of JOINTS) {
    const pr = project(j[k], view, flip);
    out[k] = { p: [pr.p[0] + offset[0], pr.p[1] + offset[1]], depth: pr.depth };
  }
  return out;
}

/** Width of a horizontal body measure seen from a view (front width w, side depth d). */
export function viewWidth(w: number, d: number, view: View): number {
  const th = rad(VIEW_ANGLE[view]);
  return Math.abs(w * Math.cos(th)) + Math.abs(d * Math.sin(th));
}

/* ------------------------------------------------------------------ dimensions from parameters */

export interface BodyParams {
  /** Head-to-body ratio (e.g. 4 for Flat adult, 7.5 for Illustrated adult). */
  headRatio: number;
  /** Overall height in character units for an adult reference. */
  height: number;
  /** 0–100 sliders, default 50. */
  shoulders: number;
  chest: number;
  waist: number;
  hips: number;
  armLength: number;
  legLength: number;
  limbThickness: number;
  belly: number;
  bust: number;
  stoop: number;
  headSize: number;
  neckLength: number;
  neckWidth: number;
}

export const DEFAULT_BODY: BodyParams = {
  headRatio: 4, height: 600, shoulders: 50, chest: 50, waist: 50, hips: 50, armLength: 50, legLength: 50, limbThickness: 50,
  belly: 0, bust: 0, stoop: 0, headSize: 50, neckLength: 50, neckWidth: 50,
};

const k = (v: number, lo: number, hi: number) => lo + ((hi - lo) * v) / 100;

/** Converts body parameters to dimensions. Stylised ratio: smaller head ratio ⇒ larger head, chunkier body. */
export function bodyDims(b: BodyParams): BodyDims {
  const H = b.height;
  const headH = (H / b.headRatio) * k(b.headSize, 0.88, 1.12);
  // Stylisation factor: 0 at realistic (7.5), 1 at chibi (2.5).
  const sty = Math.max(0, Math.min(1, (7.5 - b.headRatio) / 5));
  const bodyH = H - headH;
  const legShare = k(b.legLength, 0.44, 0.54) - sty * 0.04;
  const legLen = bodyH * legShare;
  const neckLen = headH * k(b.neckLength, 0.12, 0.3) * (1 - sty * 0.45);
  const torsoAndPelvis = bodyH - legLen - neckLen;
  const unit = H / 7.5; // realistic head unit for widths
  const wScale = 1 + sty * 0.35;
  const thick = k(b.limbThickness, 0.82, 1.25);
  return {
    height: H,
    headH,
    headW: headH * (0.78 + sty * 0.1),
    neckLen,
    neckW: headH * k(b.neckWidth, 0.24, 0.42) * (1 + sty * 0.1),
    shoulderW: unit * 1.75 * k(b.shoulders, 0.82, 1.2) * wScale,
    chestW: unit * 1.45 * k(b.chest, 0.85, 1.2) * wScale,
    waistW: unit * 1.15 * k(b.waist, 0.8, 1.35) * wScale,
    hipW: unit * 1.4 * k(b.hips, 0.82, 1.3) * wScale,
    torsoLen: torsoAndPelvis * 0.74,
    pelvisLen: torsoAndPelvis * 0.26,
    upperArm: bodyH * k(b.armLength, 0.165, 0.2),
    foreArm: bodyH * k(b.armLength, 0.15, 0.18),
    armW: unit * 0.36 * thick * (1 + sty * 0.25),
    thigh: legLen * 0.5,
    shin: legLen * 0.5,
    legW: unit * 0.5 * thick * (1 + sty * 0.2),
    handSize: unit * 0.42 * (1 + sty * 0.3),
    footLen: unit * 0.55 * (1 + sty * 0.25),
    stoop: (b.stoop / 100) * headH * 0.4,
    belly: b.belly / 100,
    bust: b.bust / 100,
  };
}
