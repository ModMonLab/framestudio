import type { StyleFamily, View } from '@frame/schema';
import type { GroupItem, Item, Mat, Paint } from '@frame/render';
import { bodyDims, projectAll, solvePose, VIEW_ANGLE, type BodyDims, type BodyParams, type Joint, type Pose, type Projected, type Vec2 } from './skeleton.js';
import { along, buildPath, ellipsePath, evalPoint, limbPath, resolveColor, resolveFill, subChain, type Mapper, type Palette, type Params, type Pt } from './geometry.js';
import type { FamilyArt, FitSpace, LayerDef, LimbLayerDef, MouthLetter, PartData, PatternUse, ShapeDef, ViewArt, When } from './types.js';

/** Family style guide values that the engine applies generically (Vision §7). */
export interface FamilyStyle {
  family: StyleFamily;
  headRatio: number;
  height: number;
  /** Outline colour slot suffix and width for limbs/garments (0 = no outlines). */
  lineWidth: number;
  shadeFactor: number;
  lightFactor: number;
  /** Shadow tint mixed into shade colours (warm/cool shading). */
  shadeTint: string;
  shadeTintAmount: number;
}

export interface ResolvedPart {
  ref: string;
  data: PartData;
  /** Option states (sleeves rolled, hood up…). */
  options?: Record<string, string>;
  /**
   * An accessory taken off and held (FR-WRD-04): drawn at its natural size, moved from where it is worn to that
   * hand's grip, in front of the hand.
   */
  heldIn?: 'L' | 'R';
  /** Fabric pattern over this garment's fills (FR-WRD-02); ignored unless the part is patternable. */
  pattern?: PatternUse;
}

export interface CharacterSpec {
  family: StyleFamily;
  style: FamilyStyle;
  body: BodyParams;
  /** Morph parameters, normalised (sliders → −1…1). */
  params: Params;
  /** Base colours: skin, hair, eye, lip, brow, top, bottom, outer, dress, shoe, acc, … */
  colors: Record<string, string>;
  parts: ResolvedPart[];
  /** Character-level option states (eyelashes, parting, …) visible to every part's `when` conditions. */
  options?: Record<string, string>;
}

/** Face controls (A18 eye states, A19 brow states, mouth curvature/width, cheek). */
export interface FaceState {
  eyeOpenL: number;
  eyeOpenR: number;
  eyeHappy: number;
  eyeLower: number;
  browInnerL: number;
  browInnerR: number;
  browOuterL: number;
  browOuterR: number;
  browFurrow: number;
  mouthCurve: number;
  mouthWidth: number;
  /** Mouth shape used when not speaking (expression mouth). */
  restMouth: MouthLetter;
  cheek: number;
  lookDown: number;
}

export const NEUTRAL_FACE: FaceState = {
  eyeOpenL: 1, eyeOpenR: 1, eyeHappy: 0, eyeLower: 0, browInnerL: 0, browInnerR: 0, browOuterL: 0, browOuterR: 0,
  browFurrow: 0, mouthCurve: 0, mouthWidth: 0, restMouth: 'X', cheek: 0, lookDown: 0,
};

export interface PerformState {
  view: View;
  /** Facing left (mirrors right-facing art). */
  flip: boolean;
  pose: Pose;
  face: FaceState;
  /** Lip-sync shape while speaking (null = expression mouth). */
  mouth: MouthLetter | null;
  /** Gaze offset −1…1 (screen x toward facing direction, y down). */
  gaze: Vec2;
  /** Overlay intensities (blush, tears…) keyed by overlay part slot or id. */
  overlays: Record<string, number>;
}

export interface Composed {
  item: GroupItem;
  /** Anchor positions in character space (y down, origin on the ground). */
  anchors: Record<string, Pt>;
  joints: Record<Joint, Projected>;
  bounds: { x: number; y: number; w: number; h: number };
  dims: BodyDims;
  /** Problems found while composing (missing points, unknown slots) — fed to the rig check. */
  issues: string[];
}

/** Draw order back → front (FR-CHR-07). `*.far`/`*.near` are resolved per pose. */
export const SLOT_ORDER = [
  'shadow', 'hair.back', 'acc.back',
  'arm.far', 'sleeve.far', 'outer.sleeve.far', 'hand.far', 'acc.hand.far',
  'leg.far', 'legwear.far', 'foot.far', 'shoe.far',
  'leg.near', 'legwear.near', 'foot.near', 'shoe.near',
  'body.pelvis', 'bottom', 'body.torso', 'neck', 'top', 'dress', 'outer', 'acc.waist', 'collar', 'acc.neck',
  'ears', 'acc.ears', 'head', 'face.skin', 'makeup', 'nose', 'mouth', 'facial-hair', 'eyes', 'brows', 'face.overlay', 'acc.face',
  'hair.front', 'fringe', 'acc.head',
  'arm.near', 'sleeve.near', 'outer.sleeve.near', 'hand.near', 'acc.hand.near', 'overlay',
] as const;
const slotIndex = new Map<string, number>(SLOT_ORDER.map((s, i) => [s, i]));

/* ------------------------------------------------------------------ palette */

export function buildPalette(colors: Record<string, string>, style: FamilyStyle): Palette {
  const p: Palette = { white: '#FFFFFF', black: '#141414', mouth: '#5A1F24', teeth: '#FBF8F2', tongue: '#C9545E' };
  const sh = (c: string, f: number) => {
    const tinted = mixHex(c, style.shadeTint, style.shadeTintAmount);
    return scale(tinted, f);
  };
  for (const [k, v] of Object.entries(colors)) {
    p[k] = v;
    p[`${k}.shade`] = sh(v, style.shadeFactor);
    p[`${k}.deep`] = sh(v, style.shadeFactor * 0.8);
    p[`${k}.light`] = lighten(v, style.lightFactor);
    p[`${k}.line`] = sh(v, 0.5);
  }
  p.line = p['skin.line'] ?? '#3A2A22';
  if (colors.skin) p['skin.blush'] = mixHex(colors.skin, '#E2555A', 0.55);
  p.eyewhite = '#F8F4EF';
  p.lash = colors.lash ?? (colors.hair ? scale(mixHex(colors.hair, '#1A1210', 0.6), 0.8) : '#231815');
  if (!colors.brow && colors.hair) {
    p.brow = scale(colors.hair, 0.92);
    p['brow.light'] = lighten(colors.hair, 1.3);
  }
  const iris = colors.eye ?? '#5A3A26';
  for (const [k, c] of [['iris', iris], ['iris2', colors.eye2 ?? iris]] as const) {
    p[k] = c;
    p[`${k}.deep`] = scale(c, 0.55);
    p[`${k}.light`] = lighten(c, 1.35);
  }
  p['eye.dark'] = '#1E1714';
  p['lip'] = colors.lip ?? (colors.skin ? mixHex(colors.skin, '#B04A50', 0.45) : '#A65B4F');
  p['lip.shade'] = scale(p.lip, 0.8);
  p['lip.light'] = lighten(p.lip, 1.25);
  p['mouth.line'] = scale(colors.lip ?? p.lip, 0.5);
  return p;
}

function mixHex(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1, 7), 16);
  const y = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) + ((((y >> s) & 255) - ((x >> s) & 255)) * t));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
function scale(c: string, f: number): string {
  const x = parseInt(c.slice(1, 7), 16);
  return `#${[16, 8, 0].map((s) => Math.round(((x >> s) & 255) * f).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
function lighten(c: string, f: number): string {
  const x = parseInt(c.slice(1, 7), 16);
  return `#${[16, 8, 0].map((s) => { const v = (x >> s) & 255; return Math.round(v + (255 - v) * (f - 1)).toString(16).padStart(2, '0'); }).join('')}`.toUpperCase();
}

/* ------------------------------------------------------------------ fit spaces */

interface Frames {
  map: (space: FitSpace, side?: 'L' | 'R', mirror?: 'mirror' | 'keep') => Mapper | undefined;
  limbChain: (limb: string) => { pts: Pt[]; widths: [number, number, number] } | undefined;
  nearSide: (pair: 'arm' | 'leg') => 'L' | 'R' | 'both';
  joints: Record<Joint, Projected>;
}

function rotate(v: Pt, a: number): Pt {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Smooth width profile through key heights (Catmull-Rom on v). */
function profile(keys: [number, number][], v: number): number {
  if (v <= keys[0]![0]) return keys[0]![1];
  if (v >= keys[keys.length - 1]![0]) return keys[keys.length - 1]![1];
  let i = 0;
  while (keys[i + 1]![0] < v) i++;
  const p0 = keys[Math.max(0, i - 1)]![1];
  const p1 = keys[i]![1];
  const p2 = keys[i + 1]![1];
  const p3 = keys[Math.min(keys.length - 1, i + 2)]![1];
  const t = (v - keys[i]![0]) / (keys[i + 1]![0] - keys[i]![0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function makeFrames(d: BodyDims, st: PerformState, headArt: ViewArt | undefined, params: Params): Frames {
  const joints3 = solvePose(d, st.pose);
  const J = projectAll(joints3, st.view, st.flip, st.pose.offset);
  const flipS = st.flip ? -1 : 1;
  const th = (VIEW_ANGLE[st.view] * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);

  // Head frame: centre, half sizes, roll from neck direction + head roll.
  const head = J.head.p;
  const neck = J.neck.p;
  const neckDir = Math.atan2(head[0] - neck[0], -(head[1] - neck[1]));
  const roll = neckDir + ((st.pose.head.roll * Math.PI) / 180) * flipS;
  const hw = d.headW / 2;
  const hh = d.headH / 2;
  const headMap = (keep: boolean): Mapper => (u, v) => {
    const r = rotate([u * hw * (st.flip && !keep ? -1 : 1), v * hh], roll);
    return [head[0] + r[0], head[1] + r[1]];
  };
  // Face: features shift with head yaw/pitch inside the view (looking at someone).
  const yaw = Math.max(-1, Math.min(1, st.pose.head.yaw / 45));
  const pitch = Math.max(-1, Math.min(1, st.pose.head.pitch / 30));
  const faceShift: Pt = [yaw * 0.16, pitch * 0.12];
  const faceMap = (keep: boolean): Mapper => {
    const m = headMap(keep);
    // headMap negates u when flipped; pre-negate so the shift stays in screen direction.
    const su = faceShift[0] * (st.flip && !keep ? -1 : 1);
    return (u, v) => m(u + su, v + faceShift[1]);
  };

  // Feature anchors come from the head art (layout), adjusted by face controls.
  const anchor = (name: string): { at: Pt; sx: number; sy: number } | undefined => {
    const a = headArt?.anchors?.[name] as unknown as { at: [number, number]; sx?: number; sy?: number } | undefined;
    if (!a) return undefined;
    let [u, v] = a.at;
    const isEye = name.startsWith('eye');
    const isBrow = name.startsWith('brow');
    if (isEye || isBrow) {
      const spacing = params['eye.spacing'] ?? 0;
      const height = params['eye.height'] ?? 0;
      u += Math.sign(u - 0) * spacing * 0.06;
      v -= height * 0.06;
      if (isBrow) v -= height * 0.0;
    }
    if (name === 'mouth') v += (params['face.length'] ?? 0) * 0.03;
    return { at: [u, v], sx: a.sx ?? 1, sy: a.sy ?? 1 };
  };
  const featureMap = (name: string, unit: number, keep: boolean, mirrorX: boolean, extraRot = 0): Mapper | undefined => {
    const a = anchor(name);
    if (!a) return undefined;
    const fm = faceMap(keep);
    const c = fm(a.at[0], a.at[1]);
    const ux = fm(a.at[0] + 0.01, a.at[1]);
    const vx = fm(a.at[0], a.at[1] + 0.01);
    // Local basis from the face map (includes roll and mirroring), scaled to the feature unit.
    const bu: Pt = [(ux[0] - c[0]) / (0.01 * hw), (ux[1] - c[1]) / (0.01 * hw)];
    const bv: Pt = [(vx[0] - c[0]) / (0.01 * hh), (vx[1] - c[1]) / (0.01 * hh)];
    const mx = mirrorX ? -1 : 1;
    return (u, v) => {
      const r = rotate([u * mx, v], extraRot);
      const x = r[0] * unit * a.sx;
      const y = r[1] * unit * a.sy;
      return [c[0] + bu[0] * x + bv[0] * y, c[1] + bu[1] * x + bv[1] * y];
    };
  };

  // Torso: axis from shoulder line to hip line, width from a body profile per view.
  const shoulderMid: Pt = [(J.shoulderL.p[0] + J.shoulderR.p[0]) / 2, (J.shoulderL.p[1] + J.shoulderR.p[1]) / 2];
  const hipMid: Pt = [(J.hipL.p[0] + J.hipR.p[0]) / 2, J.pelvis.p[1]];
  const breath = 1 + st.pose.breath * 0.03;
  const half = (w: number, front: number, back: number, sign: number) => {
    // Projected extent of an elliptical cross-section (half-width w, front depth, back depth).
    const depth = sign > 0 ? front : back;
    return Math.sqrt((w * cos) ** 2 + (depth * sin) ** 2);
  };
  const chestDepth = d.chestW * 0.36 + d.bust * d.chestW * 0.22;
  const bellyDepth = d.waistW * 0.4 + d.belly * d.waistW * 0.5;
  const torsoKeys = (sign: number): [number, number][] => [
    [0, half(d.shoulderW * 0.47, chestDepth * 0.8, chestDepth * 0.7, sign) * breath],
    [0.3, half(d.chestW * 0.5, chestDepth, chestDepth * 0.75, sign) * breath],
    [0.68, half(d.waistW * 0.5 * (1 + d.belly * 0.3), bellyDepth, d.waistW * 0.32, sign)],
    [1, half(d.hipW * 0.5, d.hipW * 0.32, d.hipW * 0.42, sign)],
  ];
  const keysPos = torsoKeys(1);
  const keysNeg = torsoKeys(-1);
  const torsoMap = (keep: boolean): Mapper => {
    const axis: Pt = [hipMid[0] - shoulderMid[0], hipMid[1] - shoulderMid[1]];
    const L = Math.hypot(axis[0], axis[1]) || 1;
    // Unit perpendicular pointing to screen +x for an upright torso.
    const perp: Pt = [axis[1] / L, -axis[0] / L];
    return (u, v) => {
      // Art u ≥ 0 is the facing side (front extents in side views).
      const w = profile(u >= 0 ? keysPos : keysNeg, v);
      const su = (st.flip && !keep ? -u : u) * w;
      return [shoulderMid[0] + axis[0] * v + perp[0] * su, shoulderMid[1] + axis[1] * v + perp[1] * su];
    };
  };
  // Pelvis: from hip line down to the crotch.
  const crotch = d.pelvisLen * 0.75 + d.legW * 0.2;
  const pelvisMap = (keep: boolean): Mapper => (u, v) => {
    const uu = st.flip && !keep ? -u : u;
    const w = lerp(profile(keysPos, 1), profile(keysPos, 1) * 0.92, v);
    return [hipMid[0] + uu * w, hipMid[1] + v * crotch];
  };

  // Hands and feet: origin at wrist/ankle, v along the forearm/foot, u across.
  const handMap = (side: 'L' | 'R'): Mapper => {
    const w = J[`wrist${side}`].p;
    const e = J[`elbow${side}`].p;
    const a = Math.atan2(w[1] - e[1], w[0] - e[0]) - Math.PI / 2;
    const mirror = (side === 'R') !== st.flip ? -1 : 1;
    const s = d.handSize;
    return (u, v) => {
      const r = rotate([u * s * mirror, v * s], a);
      return [w[0] + r[0], w[1] + r[1]];
    };
  };
  const footMap = (side: 'L' | 'R'): Mapper => {
    const an = J[`ankle${side}`].p;
    const s = d.footLen;
    return (u, v) => [an[0] + u * s * flipS, an[1] + v * s];
  };

  // Limb segment frames: v along the bone, u across in half-widths; u ≥ 0 is the screen-right side of the bone.
  const segmentMap = (a: Pt, b: Pt, half: number): Mapper => {
    const ax: Pt = [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(ax[0], ax[1]) || 1;
    const perp: Pt = [-ax[1] / L, ax[0] / L];
    const s = st.flip ? -1 : 1;
    return (u, v) => [a[0] + ax[0] * v + perp[0] * u * half * s, a[1] + ax[1] * v + perp[1] * u * half * s];
  };

  const featureUnit = d.headW * 0.11 * (1 + (params['eye.size'] ?? 0) * 0.18);
  const map: Frames['map'] = (space, side, mirror) => {
    const keep = mirror === 'keep';
    switch (space) {
      case 'head': return headMap(keep);
      case 'face': return faceMap(keep);
      case 'torso': return torsoMap(keep);
      case 'pelvis': return pelvisMap(keep);
      case 'neck': return headMap(keep);
      case 'handL': return handMap('L');
      case 'handR': return handMap('R');
      case 'hand': return handMap(side ?? 'R');
      case 'footL': return footMap('L');
      case 'footR': return footMap('R');
      case 'foot': return footMap(side ?? 'R');
      case 'eyeL': return featureMap('eyeL', featureUnit, keep, false, (params['eye.tilt'] ?? 0) * -0.18);
      case 'eyeR': return featureMap('eyeR', featureUnit, keep, true, (params['eye.tilt'] ?? 0) * 0.18);
      case 'browL': return featureMap('browL', featureUnit * 1.15, keep, false);
      case 'browR': return featureMap('browR', featureUnit * 1.15, keep, true);
      case 'earL': return featureMap('earL', featureUnit * 1.4, keep, false);
      case 'earR': return featureMap('earR', featureUnit * 1.4, keep, true);
      case 'mouth': return featureMap('mouth', featureUnit * 1.25 * (1 + (params['mouth.size'] ?? 0) * 0.15), keep, false);
      case 'nose': return featureMap('nose', featureUnit * 1.1, keep, false);
      case 'stage': return (u, v) => [u, v];
      case 'seat': {
        const L = d.thigh + d.shin;
        const o = J.pelvis.p;
        return (u, v) => [o[0] + u * L * flipS, o[1] + v * L];
      }
      case 'upperArmL': return segmentMap(J.shoulderL.p, J.elbowL.p, d.armW / 2);
      case 'upperArmR': return segmentMap(J.shoulderR.p, J.elbowR.p, d.armW / 2);
      case 'foreArmL': return segmentMap(J.elbowL.p, J.wristL.p, d.armW / 2);
      case 'foreArmR': return segmentMap(J.elbowR.p, J.wristR.p, d.armW / 2);
      case 'thighL': return segmentMap(J.hipL.p, J.kneeL.p, d.legW / 2);
      case 'thighR': return segmentMap(J.hipR.p, J.kneeR.p, d.legW / 2);
      case 'shinL': return segmentMap(J.kneeL.p, J.ankleL.p, d.legW / 2);
      case 'shinR': return segmentMap(J.kneeR.p, J.ankleR.p, d.legW / 2);
      default: return undefined;
    }
  };

  const limbChain: Frames['limbChain'] = (limb) => {
    if (limb === 'neck') {
      return { pts: [J.neck.p, [lerp(J.neck.p[0], J.head.p[0], 0.55), lerp(J.neck.p[1], J.head.p[1], 0.55)]], widths: [d.neckW * 1.05, d.neckW, d.neckW] };
    }
    const side = limb.endsWith('L') ? 'L' : 'R';
    if (limb.startsWith('arm')) {
      return { pts: [J[`shoulder${side}`].p, J[`elbow${side}`].p, J[`wrist${side}`].p], widths: [d.armW * 1.08, d.armW * 0.9, d.armW * 0.72] };
    }
    if (limb.startsWith('leg')) {
      return { pts: [J[`hip${side}`].p, J[`knee${side}`].p, J[`ankle${side}`].p], widths: [d.legW * 1.15, d.legW * 0.85, d.legW * 0.62] };
    }
    return undefined;
  };

  const nearSide: Frames['nearSide'] = (pair) => {
    if (st.view === 'front' || st.view === 'back') return 'both';
    // Facing right, the character's right side faces the camera.
    const a = pair === 'arm' ? J.shoulderL.depth : J.hipL.depth;
    const b = pair === 'arm' ? J.shoulderR.depth : J.hipR.depth;
    return a > b ? 'L' : 'R';
  };

  return { map, limbChain, nearSide, joints: J };
}

/* ------------------------------------------------------------------ composition */

function whenOk(when: When | undefined, state: Record<string, string>): boolean {
  if (!when) return true;
  for (const [k, v] of Object.entries(when)) {
    const cur = state[k];
    if (Array.isArray(v) ? !v.includes(cur ?? '') : cur !== v) return false;
  }
  return true;
}

function artFor(part: PartData, family: StyleFamily, view: View): { art?: ViewArt; fam?: FamilyArt } {
  const fam = part.families[family];
  return { fam, art: fam?.views[view] };
}

/**
 * Composes a character for one view, pose and face state into a display-list group (character space).
 * Pure and deterministic (FR-RND-02). Expression and mouth shape combine (FR-CHR-08); back view omits the mouth (FR-LIP-05).
 */
export function composeCharacter(spec: CharacterSpec, st: PerformState): Composed {
  const issues: string[] = [];
  const d = bodyDims({ ...spec.body, headRatio: spec.body.headRatio, height: spec.body.height });
  const palette = buildPalette(spec.colors, spec.style);
  const visible = spec.parts.filter((p) => !spec.parts.some((o) => o !== p && o.data.hides?.includes(p.data.slot)));
  const headPart = visible.find((p) => p.data.slot === 'head');
  const headArt = headPart ? artFor(headPart.data, spec.family, st.view).art : undefined;
  if (!headPart) issues.push('No head part');

  // Per-side face parameters.
  const f = st.face;
  // Gaze is given in screen space; face art is drawn facing right, so flip for left-facing characters.
  const gx = Math.max(-1, Math.min(1, st.gaze[0])) * (st.flip ? -1 : 1);
  const gy = Math.max(-1, Math.min(1, st.gaze[1] + f.lookDown * 0.6));
  const sideParams = (side: 'L' | 'R'): Params => ({
    ...spec.params,
    'eye.open': (side === 'L' ? f.eyeOpenL : f.eyeOpenR) - 1,
    'eye.happy': f.eyeHappy,
    'eye.lower': f.eyeLower,
    'eye.lookdown': f.lookDown,
    // Gaze moves both irises the same way on screen; the right-side instance is mirrored so its x is negated.
    'gaze.x': side === 'R' ? -gx : gx,
    'gaze.y': gy,
    'brow.inner': side === 'L' ? f.browInnerL : f.browInnerR,
    'brow.outer': side === 'L' ? f.browOuterL : f.browOuterR,
    'brow.furrow': f.browFurrow,
  });
  const baseParams: Params = { ...spec.params, 'mouth.curve': f.mouthCurve, 'mouth.width': f.mouthWidth, cheek: f.cheek };
  const frames = makeFrames(d, st, headArt, spec.params);
  const mouthLetter: MouthLetter = st.mouth ?? f.restMouth;
  const nearArm = frames.nearSide('arm');
  const nearLeg = frames.nearSide('leg');

  const buckets = new Map<number, Item[]>();
  const push = (slot: string, it: Item) => {
    const idx = slotIndex.get(slot);
    if (idx === undefined) {
      issues.push(`Unknown slot ${slot}`);
      return;
    }
    const b = buckets.get(idx) ?? [];
    b.push(it);
    buckets.set(idx, b);
  };
  const resolveSlot = (slot: string, side?: 'L' | 'R', pair?: 'arm' | 'leg'): string => {
    if (!slot.includes('*')) return slot;
    const near = pair === 'leg' ? nearLeg : nearArm;
    const isNear = near === 'both' ? !(pair === 'arm' && armBehind(side ?? 'L')) : near === side;
    return slot.replace('*', isNear ? 'near' : 'far');
  };
  const armBehind = (side: 'L' | 'R') => {
    const J = frames.joints;
    return st.view === 'front' ? J[`wrist${side}`].depth < J.chest.depth - d.armW * 1.5 : st.view === 'back' ? J[`wrist${side}`].depth < J.chest.depth - d.armW * 1.5 : false;
  };

  const anchors: Record<string, Pt> = {};
  // Limb differences (FR-CHR-11): limbs end early and their hand or foot is not drawn.
  const truncate: Record<string, number> = {};
  const replace: Record<string, number> = {};
  for (const p of visible) {
    for (const [k, v] of Object.entries(p.data.variant?.truncate ?? {})) truncate[k] = Math.min(truncate[k] ?? 1, v);
    for (const [k, v] of Object.entries(p.data.variant?.replace ?? {})) replace[k] = Math.min(replace[k] ?? 1, v);
  }
  const cut = (sp: string, side?: 'L' | 'R') => {
    const m = /^(hand|foot|foreArm|shin|upperArm|thigh)([LR])?$/.exec(sp);
    if (!m) return false;
    const limb = `${m[1] === 'hand' || m[1] === 'foreArm' || m[1] === 'upperArm' ? 'arm' : 'leg'}${m[2] ?? side ?? ''}`;
    const t = truncate[limb] ?? 1;
    return m[1] === 'hand' || m[1] === 'foot' ? t < 1 : m[1] === 'foreArm' || m[1] === 'shin' ? t <= 0.5 : t <= 0;
  };

  for (const part of visible) {
    const { art } = artFor(part.data, spec.family, st.view);
    if (!art) {
      const fam = part.data.families[spec.family];
      if (!fam) issues.push(`${part.ref} has no ${spec.family} art`);
      else if (!fam.exempt?.[st.view]) issues.push(`${part.ref} has no ${st.view} view`);
      continue;
    }
    const state: Record<string, string> = { mouth: mouthLetter, view: st.view, ...(spec.options ?? {}), ...(part.options ?? {}) };
    for (const [k, v] of Object.entries(st.overlays)) if (v > 0) state[`overlay.${k}`] = 'on';
    for (const layer of art.layers) {
      // Layers instanced per side (hands, feet) evaluate their condition with that side's state.
      if (!layer.sides && !whenOk(layer.when, state)) continue;
      if (layer.limb) {
        drawLimb(layer, layer.limb, part, state);
        continue;
      }
      const sides = layer.sides ?? [undefined];
      for (const side of sides) {
        const space = (layer.space ?? 'head') as FitSpace;
        const sp = side && (space === 'hand' || space === 'foot') ? (`${space}${side}` as FitSpace) : side && /^(eye|brow|ear)$/.test(space) ? (`${space}${side}` as FitSpace) : space;
        if (cut(sp, side) && !part.data.variant?.truncate) continue;
        const worn = frames.map(sp, side, part.data.mirror);
        if (!worn) continue; // feature not present in this view (e.g. far eye in side view)
        const map = part.heldIn ? heldMap(worn, sp, part.heldIn) : worn;
        if (!map) continue;
        const params = side && /^(eye|brow)/.test(sp) ? sideParams(side) : side && sp.startsWith('ear') ? baseParams : { ...baseParams, 'gaze.x': gx, 'gaze.y': gy, ...sideParams('L') };
        const pair = /^(hand|upperArm|foreArm)/.test(sp) ? 'arm' : /^(foot|thigh|shin)/.test(sp) ? 'leg' : undefined;
        // Limb-segment spaces carry their side in the name (upperArmL …).
        const limbSide = !side && pair && /[LR]$/.test(sp) ? (sp.slice(-1) as 'L' | 'R') : side;
        const slot = part.heldIn ? resolveSlot('acc.hand.*', part.heldIn, 'arm') : resolveSlot(layer.slot, limbSide, pair);
        const sideState = side ? { ...state, hand: side === 'L' ? st.pose.handL : st.pose.handR, side } : state;
        if (!whenOk(layer.when, sideState)) continue;
        drawShapes(layer, art, part, map, params, sideState, slot, side === 'R' ? 'R' : 'L');
      }
    }
    for (const [name, a] of Object.entries(art.anchors ?? {})) {
      const map = frames.map(a.space, undefined, part.data.mirror);
      if (map) anchors[name] = map(a.at[0], a.at[1]);
    }
  }

  // Moves art fitted to a body space so that space's centre sits at the hand's grip (same size, upright).
  function heldMap(worn: Mapper, space: FitSpace, hand: 'L' | 'R'): Mapper | undefined {
    const grip = frames.map(`hand${hand}`)?.(0, 0.95);
    if (!grip) return undefined;
    const centre = (space === 'stage' ? undefined : frames.map(space)?.(0, 0)) ?? worn(0, 0);
    return (u, v) => {
      const p = worn(u, v);
      return [p[0] - centre[0] + grip[0], p[1] - centre[1] + grip[1]];
    };
  }

  function drawShapes(layer: LayerDef, art: ViewArt, part: ResolvedPart, map: Mapper, params: Params, state: Record<string, string>, slot: string, side: 'L' | 'R') {
    const shapes = (layer.shapes ?? []).filter((s) => whenOk(s.when, state));
    // Heterochromia: the right-side instance uses the second iris colour.
    const pal = side === 'R' ? { ...palette, iris: palette.iris2!, 'iris.deep': palette['iris2.deep']!, 'iris.light': palette['iris2.light']! } : palette;
    const byId = new Map<string, string>();
    const missing = (n: string) => issues.push(`${part.ref}: missing point ${n}`);
    const items: Item[] = [];
    for (const s of shapes) {
      if (s.art) {
        const placed = placedArt(s.art, map, s.opacity);
        if (placed) items.push(placed);
        continue;
      }
      const d = s.path ? buildPath(s.path, art.points, params, map, missing) : s.ellipse ? ellipsePath(s.ellipse, art.points, params, map, missing) : '';
      if (!d) continue;
      if (s.id) byId.set(s.id, d);
      let op = s.opacity ?? 1;
      if (s.opacityParam) {
        const key = s.opacityParam;
        op *= key.startsWith('overlay.') ? (st.overlays[key.slice(8)] ?? 0) : Math.max(0, Math.min(1, params[key] ?? 0));
        if (op <= 0.001) continue;
      }
      const at = (n: string) => {
        const mp = art.points[n];
        if (!mp) {
          missing(n);
          return map(0, 0);
        }
        const [u, v] = evalPoint(mp, params);
        return map(u, v);
      };
      const fill: Paint | undefined = s.fill ? resolveFill(s.fill, pal, at) : undefined;
      const stroke = s.stroke ? { paint: { color: resolveColor(s.stroke.c, pal) }, width: s.stroke.w * d0(), cap: s.stroke.cap ?? 'round', join: 'round' as const } : undefined;
      const item: Item = { k: 'path', d, ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}), ...(op < 1 ? { op } : {}), ...(s.blend ? { blend: s.blend } : {}), ...(s.evenOdd ? { evenOdd: true } : {}) };
      if (s.clip) {
        const clip = byId.get(s.clip);
        if (clip) items.push({ k: 'group', clip, items: [item] });
        else issues.push(`${part.ref}: clip ${s.clip} not found`);
      } else items.push(item);
    }
    if (items.length) push(slot, { k: 'group', id: part.ref, items: part.pattern && part.data.patternable ? withPattern(items, part.pattern) : items });
  }

  // Fabric pattern (FR-WRD-02): tiles over the fills' bounds, clipped to the fills, rotated about their centre.
  function withPattern(items: Item[], use: PatternUse): Item[] {
    const fills = items.filter((i): i is Extract<Item, { k: 'path' }> => i.k === 'path' && !!i.fill && !i.op);
    if (!fills.length) return items;
    const clip = fills.map((f) => f.d).join(' ');
    const nums = clip.match(/-?\d*\.?\d+(e-?\d+)?/gi)?.map(Number) ?? [];
    if (nums.length < 2) return items;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i]!); x1 = Math.max(x1, nums[i]!);
      y0 = Math.min(y0, nums[i + 1]!); y1 = Math.max(y1, nums[i + 1]!);
    }
    const P = use.data;
    const k = (use.scale ?? P.defaults.scale) * d0();
    const [tw, th] = [P.tile[0] * k, P.tile[1] * k];
    if (!(tw > 0.5 && th > 0.5)) return items;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const r = Math.hypot(x1 - x0, y1 - y0) / 2 + Math.max(tw, th);
    const cols = Math.min(200, Math.ceil((2 * r) / tw)), rows = Math.min(200, Math.ceil((2 * r) / th));
    const colours = { ...P.defaults.colors, ...(use.colors ?? {}) };
    const out: Item[] = [];
    if (P.image && use.image) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push({ k: 'image', src: use.image, x: cx - r + i * tw, y: cy - r + j * th, w: tw, h: th });
    for (const L of P.layers) {
      let d = '';
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const ox = cx - r + i * tw + (P.stagger && j % 2 ? tw / 2 : 0), oy = cy - r + j * th;
        d += L.d.replace(/(-?\d*\.?\d+(?:e-?\d+)?)\s*,?\s*(-?\d*\.?\d+(?:e-?\d+)?)/gi, (_m: string, a: string, b: string) => `${(ox + Number(a) * k).toFixed(2)} ${(oy + Number(b) * k).toFixed(2)}`) + ' ';
      }
      out.push({ k: 'path', d, fill: { color: resolveColor(colours[L.color], palette) }, ...(L.opacity !== undefined && L.opacity < 1 ? { op: L.opacity } : {}), ...(P.blend === 'multiply' ? { blend: 'multiply' as const } : {}) });
    }
    const rot = ((use.rotation ?? P.defaults.rotation) * Math.PI) / 180;
    const c = Math.cos(rot), sn = Math.sin(rot);
    const tf: Mat = [c, sn, -sn, c, cx - c * cx + sn * cy, cy - sn * cx - c * cy];
    // Fills first, the pattern over them, then outlines and details on top.
    const rest = items.filter((i) => !fills.includes(i as never));
    return [...fills, { k: 'group', clip, items: [{ k: 'group', tf, items: out }] }, ...rest];
  }

  function drawLimb(layer: LayerDef, L: LimbLayerDef, part: ResolvedPart, state: Record<string, string>) {
    if (!whenOk(L.when, state)) return;
    const limbs = L.limb === 'arms' ? ['armL', 'armR'] : L.limb === 'legs' ? ['legL', 'legR'] : [L.limb];
    for (const limb of limbs) {
      const chain = frames.limbChain(limb);
      if (!chain) continue;
      const side = limb.endsWith('L') ? 'L' : 'R';
      const pair = limb.startsWith('arm') ? 'arm' : limb.startsWith('leg') ? 'leg' : undefined;
      const slot = resolveSlot(layer.slot, side, pair);
      // The part carrying a limb variant draws its own replacement; skin limbs end where a prosthetic starts.
      const own = !!(part.data.variant?.truncate || part.data.variant?.replace);
      const skin = /^(arm|leg)\./.test(layer.slot);
      const to = own ? L.to : Math.min(L.to, truncate[limb] ?? 1, skin ? (replace[limb] ?? 1) : 1);
      if (to <= L.from) continue;
      const pts = subChain(chain.pts, L.from, to);
      const segs = chain.pts.length - 1;
      const wAt = (t: number) => {
        const x = Math.max(0, Math.min(1, t)) * segs;
        const i = Math.min(segs - 1, Math.floor(x));
        return lerp(chain.widths[i]!, chain.widths[i + 1]!, x - i);
      };
      const ts = [L.from, ...chain.pts.slice(1, -1).map((_, i) => (i + 1) / segs).filter((t) => t > L.from && t < to), to];
      const widths = ts.map((t, i) => wAt(t) * L.width + (i === ts.length - 1 ? (L.flare ?? 0) * d.armW : 0));
      // Open ends of garments (sleeve hems, trouser cuffs) are cut straight; ends at the joint root stay round.
      const dPath = limbPath(pts, widths, { end: to < 0.999 || L.cap === 'butt' ? 'butt' : 'round', start: L.from > 0.001 ? 'butt' : 'round' });
      const items: Item[] = [{ k: 'path', d: dPath, fill: { color: resolveColor(L.fill, palette) } }];
      if (L.shade) {
        // Illustrated: a soft shade band along one edge (light from upper left).
        const a = pts[0]!;
        const b = pts[pts.length - 1]!;
        const nx = -(b[1] - a[1]);
        const ny = b[0] - a[0];
        const nl = Math.hypot(nx, ny) || 1;
        const off = (widths[0]! / 2) * (nx / nl >= 0 ? 1 : -1);
        items.push({ k: 'group', clip: dPath, items: [{ k: 'path', d: limbPath(pts.map((p) => [p[0] + (nx / nl) * off * 0.9, p[1] + (ny / nl) * off * 0.9] as Pt), widths.map((w) => w * 0.7)), fill: { color: resolveColor(L.shade, palette) }, op: 0.85 }] });
      }
      if (L.outline && spec.style.lineWidth > 0) items.push({ k: 'path', d: dPath, stroke: { paint: { color: resolveColor(L.outline, palette) }, width: spec.style.lineWidth * d0() } });
      push(slot, { k: 'group', id: `${part.ref}:${limb}`, items: part.pattern && part.data.patternable && !skin ? withPattern(items, part.pattern) : items });
      // Hand/foot anchors for props (grip) come from the hand frames.
      if (limb.startsWith('arm')) anchors[`wrist${side}`] = along(chain.pts, 1);
    }
  }

  function d0() {
    return d.height / 600;
  }

  // Generic anchors (FR-CHR-06).
  const J = frames.joints;
  const hm = frames.map('head');
  if (hm) {
    anchors.head = hm(0, -1);
    anchors.face = hm(0, 0.15);
    anchors.gazeOrigin = hm(0.3, -0.05);
  }
  const mouthMap = frames.map('mouth');
  if (mouthMap) anchors.mouth = mouthMap(0, 0);
  anchors.neck = J.neck.p;
  anchors.chest = [(J.shoulderL.p[0] + J.shoulderR.p[0]) / 2, lerp(J.neck.p[1], J.pelvis.p[1], 0.3)];
  anchors.back = anchors.chest;
  anchors.waist = J.waist.p;
  anchors.seat = J.pelvis.p;
  anchors.feet = [(J.ankleL.p[0] + J.ankleR.p[0]) / 2, 0];
  for (const side of ['L', 'R'] as const) {
    const hmS = frames.map(`hand${side}`);
    anchors[`wrist${side}`] = J[`wrist${side}`].p;
    if (hmS) anchors[`grip${side}`] = hmS(0, 0.95);
  }

  const ordered: Item[] = [];
  for (const idx of [...buckets.keys()].sort((a, b) => a - b)) ordered.push(...buckets.get(idx)!);

  // Bounds from joints and head.
  const xs = Object.values(J).map((j) => j.p[0]);
  const ys = Object.values(J).map((j) => j.p[1]);
  const top = Math.min(...ys) - d.headH * 0.75;
  const bounds = { x: Math.min(...xs) - d.armW * 2, y: top, w: Math.max(...xs) - Math.min(...xs) + d.armW * 4, h: Math.max(0, ...ys) - top };
  return { item: { k: 'group', items: ordered }, anchors, joints: J, bounds, dims: d, issues: [...new Set(issues)] };
}

/**
 * Draws placed artwork (imported drawings) into its fit-space box: the source rectangle maps affinely onto the box's
 * corners as the space moves (u along the box's first axis, v along its second), so mirroring and rotation follow.
 */
export function placedArt(a: NonNullable<ShapeDef['art']>, map: Mapper, opacity?: number): Item | undefined {
  const [u0, v0, u1, v1] = a.box;
  const [x, y, w, h] = a.src;
  if (!(w > 0 && h > 0)) return undefined;
  const p0 = map(u0, v0);
  const pu = map(u1, v0);
  const pv = map(u0, v1);
  const A = (pu[0] - p0[0]) / w;
  const B = (pu[1] - p0[1]) / w;
  const C = (pv[0] - p0[0]) / h;
  const D = (pv[1] - p0[1]) / h;
  const tf: [number, number, number, number, number, number] = [A, B, C, D, p0[0] - A * x - C * y, p0[1] - B * x - D * y];
  const op = opacity !== undefined && opacity < 1 ? { op: opacity } : {};
  if (a.image) return { k: 'image', src: `media:${a.image}`, x, y, w, h, tf, ...op };
  const items: Item[] = (a.paths ?? []).map((pth) => ({
    k: 'path', d: pth.d,
    ...(pth.fill ? { fill: { color: pth.fill } } : {}),
    ...(pth.stroke ? { stroke: { paint: { color: pth.stroke }, width: pth.strokeWidth ?? 1 } } : {}),
    ...(pth.opacity !== undefined && pth.opacity < 1 ? { op: pth.opacity } : {}),
    ...(pth.evenOdd ? { evenOdd: true } : {}),
    ...(pth.tf ? { tf: pth.tf } : {}),
  } as Item));
  return { k: 'group', tf, items, ...op };
}
