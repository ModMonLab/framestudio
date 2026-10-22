/**
 * Data formats of performance assets (manifest `data`) and samplers. Pure.
 * Expressions (Catalog E1), actions (F1), recipes (G1) are data — the engine never knows their names (FR-ARC-06).
 */

export type Vec3 = [number, number, number];

/** Face controls written by expressions; missing values mean neutral. */
export interface ExpressionData {
  eyeOpen?: number;
  eyeOpenL?: number;
  eyeOpenR?: number;
  eyeHappy?: number;
  eyeLower?: number;
  lookDown?: number;
  browInner?: number;
  browOuter?: number;
  browInnerL?: number;
  browInnerR?: number;
  browOuterL?: number;
  browOuterR?: number;
  browFurrow?: number;
  mouthCurve?: number;
  mouthWidth?: number;
  restMouth?: string;
  cheek?: number;
  /** Overlay asset ref and its intensity (blush, tears…). */
  overlay?: string;
  overlayAmount?: number;
  /** Gaze tendency (−1…1) and head attitude in degrees. */
  gaze?: [number, number];
  head?: { pitch?: number; roll?: number; yaw?: number };
  /** Default intensity 0–100 and transition seconds. */
  intensity?: number;
  transition?: number;
}

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'step' | 'overshoot';

export interface Key<T = number | number[] | string> {
  /** Normalised time within the action (0…1). */
  t: number;
  v: T;
  e?: Ease;
}

/** Channels an action drives (FR-ACT-02). */
export type ActionChannel = 'root' | 'posture' | 'torso' | 'head' | 'armL' | 'armR' | 'handL' | 'handR' | 'legs' | 'face' | 'gaze';

export interface ActionData {
  channels: ActionChannel[];
  /** Additive actions layer on top of others (e.g. nod over talking). */
  additive?: boolean;
  loop: boolean;
  /** Default duration in seconds (one loop cycle for looping actions). */
  duration: number;
  postures: string[];
  /** Posture after the action (sit down → seated). */
  resultPosture?: string;
  /**
   * Keyframed curves. Keys: `armL`, `armR`, `legL`, `legR` (Vec3 targets), `armL.pole`…, `handL`, `handR` (pose names),
   * `spine.pitch|roll|yaw`, `head.pitch|roll|yaw`, `offset.x|y`, `shrug`, `stretch`, `breath`, `face.*` (expression controls), `gaze.x|y`.
   */
  keys: Record<string, Key[]>;
  /** Timed events (normalised t) such as `contact` for sound cues (FR-SND-04). */
  events?: { t: number; name: string; sound?: string; propState?: string }[];
  /** Which hand the action uses by default; `params.hand` can mirror it. */
  hand?: 'L' | 'R' | 'both';
  /** Locomotion: the instance moves along the clip path (FR-ACT-04). */
  locomotion?: { speed: number; stride: number; lift?: number };
  /** Object interaction (FR-ACT-06): grips a prop with this hand anchor. */
  prop?: { grip: 'L' | 'R'; returns?: boolean; states?: string[]; hold?: [number, number] };
  /** Rig variants this action supports (wheelchair seated rig…). */
  rigs?: string[];
}

export function ease(e: Ease | undefined, x: number): number {
  switch (e) {
    case 'linear': return x;
    case 'in': return x * x;
    case 'out': return 1 - (1 - x) * (1 - x);
    case 'step': return x < 1 ? 0 : 1;
    case 'overshoot': {
      const c = 1.7;
      return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
    }
    default: return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  }
}

/** Samples a keyframe curve at normalised time u. */
export function sample<T extends number | number[] | string>(keys: Key<T>[], u: number): T | undefined {
  if (!keys.length) return undefined;
  if (u <= keys[0]!.t) return keys[0]!.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (u >= a.t && u <= b.t) {
      if (typeof a.v === 'string' || typeof b.v === 'string') return (u < b.t ? a.v : b.v) as T;
      const x = ease(b.e, (u - a.t) / Math.max(1e-9, b.t - a.t));
      if (Array.isArray(a.v)) return (a.v as number[]).map((av, k) => av + (((b.v as number[])[k] ?? av) - av) * x) as T;
      return ((a.v as number) + ((b.v as number) - (a.v as number)) * x) as T;
    }
  }
  return keys[keys.length - 1]!.v;
}

/** Blend weight of a clip at time t given blend-in/out (smooth). */
export function clipWeight(t: number, start: number, end: number, blendIn: number, blendOut: number): number {
  if (t < start || t >= end) return 0;
  let w = 1;
  if (blendIn > 0 && t < start + blendIn) w = Math.min(w, (t - start) / blendIn);
  if (blendOut > 0 && t > end - blendOut) w = Math.min(w, (end - t) / blendOut);
  return w * w * (3 - 2 * w);
}

/** Mirrors an action's sided keys (L ↔ R) for `params.hand`. */
export function mirrorKeys(keys: Record<string, Key[]>): Record<string, Key[]> {
  const out: Record<string, Key[]> = {};
  for (const [k, v] of Object.entries(keys)) {
    const m = k.replace(/(arm|hand|leg)([LR])/, (_s, a: string, s: string) => `${a}${s === 'L' ? 'R' : 'L'}`);
    const flipYaw = /^(spine|head)\.(roll|yaw)$/.test(k);
    out[m] = flipYaw ? v.map((x) => ({ ...x, v: -(x.v as number) })) : v;
  }
  return out;
}

/* ------------------------------------------------------------------ channels and postures (FR-ACT-02/03) */

/** Minimal clip and track shapes used by the channel and posture helpers (scene clips satisfy them). */
interface ClipLike { id: string; track: string; start: number; end: number; enabled: boolean; asset?: string; params: Record<string, unknown> }
interface SceneLike { tracks: { id: string; owner: string; kind: string; mute: boolean }[]; clips: ClipLike[] }

/** The action data of an asset ref, if it is an action. */
export type ActionLookup = (ref: string) => ActionData | undefined;

/** Channels a clip drives after `params.hand` mirroring (an R-handed gesture played with the left hand drives armL). */
export function clipChannels(a: ActionData, params: Record<string, unknown>): ActionChannel[] {
  const mirror = params.hand && a.hand && a.hand !== 'both' && params.hand !== a.hand;
  if (!mirror) return a.channels;
  return a.channels.map((c) => c.replace(/^(arm|hand)([LR])$/, (_s, p: string, s: string) => `${p}${s === 'L' ? 'R' : 'L'}`) as ActionChannel);
}

/**
 * The character's posture at time t (FR-ACT-03): the instance's starting posture, changed by every posture-changing
 * action (sit down, stand up) that has finished before t. Seeking anywhere gives the same answer (no drift).
 */
export function postureAt(scene: SceneLike, owner: string, start: string, t: number, actionOf: ActionLookup): string {
  const tracks = new Set(scene.tracks.filter((tr) => tr.owner === owner && tr.kind === 'acting' && !tr.mute).map((tr) => tr.id));
  let posture = start;
  const done = scene.clips.filter((c) => c.enabled && tracks.has(c.track) && c.end <= t && c.asset).sort((a, b) => a.end - b.end);
  for (const c of done) {
    const r = actionOf(c.asset!)?.resultPosture;
    if (r) posture = r;
  }
  return posture;
}
