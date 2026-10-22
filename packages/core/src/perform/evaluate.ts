/**
 * Scene evaluation (SRS §6): a pure function of (project state, scene, time, output settings) → display list
 * (FR-RND-01/02). Studio preview, thumbnails, CLI renders and export all call this.
 */
import type { Camera, Clip, Instance, MouthBlock, Scene, StyleFamily, Take } from '@frame/schema';
import { composeCharacter, placedArt, NEUTRAL_FACE, REST_POSE, VIEW_ANGLE, type FaceState, type FamilyStyle, type MouthLetter, type PartData, type Pose, type ViewArt, buildPath, ellipsePath, resolveFill, resolveColor, buildPalette, evalPoint, bodyDims, type CharacterSpec, type RigVariant, type Mapper } from '@frame/rig';
import type { Frame, GroupItem, Item, Mat } from '@frame/render';
import type { ProjectState } from '../state.js';
import { hash32, prng } from '../ids.js';
import { TICKS_PER_SECOND } from '../time.js';
import { lineTakeState } from '../validate.js';
import { applyOverrides, mouthTrackFromAlignment, mouthTrackFromEnvelope, shapeAt } from './lipsync.js';
import { clipWeight, mirrorKeys, postureAt, sample, type ActionData, type ExpressionData, type Key } from './data.js';
import { characterVariant, resolveCharacter, type AssetResolver } from './character.js';
import { motionAt, type Motion } from './locomotion.js';
import { holderAt, propStateAt, type Interaction } from './interact.js';
import { bubbleItems, graphicItems, worldTextItems, type BubbleStyle, type GraphicStyle, type WorldTextStyle } from './text.js';
import { atmosphereItems, effectItems, gradeMatrix, SILHOUETTE_MATRIX, transitionItems, type AtmoData, type EffectData, type TransitionData } from './fx.js';
import { captionItems, DEFAULT_CAPTION_STYLE, stripPauseMarkers, type CaptionStyle } from '../captions.js';


export interface EvalOptions {
  assets: AssetResolver;
  styles: Record<StyleFamily, FamilyStyle>;
  width: number;
  height: number;
  /** Aspect key for per-ratio camera overrides, e.g. "16:9". */
  aspect?: string;
  /** Draw captions into the frame (burn-in, FR-TXT-01). */
  captions?: boolean;
  background?: string;
  /** Override family (Studio style toggle previews the other family). */
  family?: StyleFamily;
}

export interface CaptionLine {
  speaker: string;
  text: string;
  words?: { text: string; start: number; end: number }[];
  /** Seconds since the line started. */
  local: number;
  /** Line length in seconds. */
  duration: number;
}

export interface EvaluatedFrame {
  frame: Frame;
  camera: { id: string; name: string; center: [number, number]; width: number; rotation: number };
  captions: CaptionLine[];
  /** Stage → screen matrix (for picking and overlays). */
  view: Mat;
  issues: string[];
  /** Screen-space boxes per instance (selection handles, hit testing). */
  boxes: Record<string, { x: number; y: number; w: number; h: number }>;
  /** Current mouth shape per speaking character (builder lip-sync readout, FR-LIP-03). */
  mouths: Record<string, MouthLetter | null>;
}

const sec = (t: number) => t / TICKS_PER_SECOND;

/* ------------------------------------------------------------------ camera */

function mul(m: Mat, n: Mat): Mat {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
const T = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const S = (sx: number, sy = sx): Mat => [sx, 0, 0, sy, 0, 0];
const R = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};

const LENS: Record<Camera['lens'], number> = { '24mm': 1.3, '35mm': 1, '50mm': 0.8, '85mm': 0.6 };

export interface CameraState {
  cam: Camera;
  center: [number, number];
  width: number;
  rotation: number;
  shake: [number, number];
}

/** Active camera at t: shot track → camera, then camera-move clips (FR-CAM-02/03). */
export function cameraAt(scene: Scene, t: number, assets: AssetResolver, aspect?: string): CameraState {
  const shotTracks = new Set(scene.tracks.filter((tr) => tr.kind === 'shot' && !tr.mute).map((tr) => tr.id));
  const shot = scene.clips.find((c) => c.enabled && shotTracks.has(c.track) && t >= c.start && t < c.end);
  const camId = (shot?.params.camera as string | undefined) ?? scene.defaultCamera;
  const cam = scene.cameras.find((c) => c.id === camId) ?? scene.cameras[0]!;
  const ov = aspect ? cam.ratioOverrides[aspect] : undefined;
  let center: [number, number] = ov ? [ov.center.x, ov.center.y] : [cam.center.x, cam.center.y];
  let width = ov ? ov.width : cam.width;
  let rotation = cam.rotation;
  let shake: [number, number] = [0, 0];
  const moveTracks = new Set(scene.tracks.filter((tr) => tr.kind === 'camera-move' && !tr.mute).map((tr) => tr.id));
  for (const c of scene.clips) {
    if (!c.enabled || !moveTracks.has(c.track) || t < c.start) continue;
    const move = (c.asset ? (assets.manifest(c.asset)?.data as { move?: CameraMove } | undefined)?.move : undefined) ?? (c.params.move as CameraMove | undefined);
    if (!move) continue;
    const dur = c.end - c.start;
    const u = Math.min(1, (t - c.start) / dur);
    const k = easeMove(move.ease ?? 'inOut', u) * ((c.params.intensity as number | undefined) ?? 1);
    if (move.zoom) width /= 1 + (move.zoom - 1) * k;
    if (move.dx) center = [center[0] + move.dx * k, center[1]];
    if (move.dy) center = [center[0], center[1] + move.dy * k];
    if (move.roll) rotation += move.roll * k;
    if (move.shake && t < c.end) {
      const rnd = prng(hash32(c.id) ^ Math.floor(sec(t) * 30));
      const amp = move.shake * (1 - u * 0.5) * ((c.params.intensity as number | undefined) ?? 1);
      shake = [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp];
    }
    // Targets are read where they are at t, so the camera keeps up with walking characters (FR-CAM-03).
    const inst = typeof c.params.target === 'string' ? scene.instances.find((i) => i.id === c.params.target) : undefined;
    const posAt = (at: number): [number, number] => {
      if (!inst) return [0, 0];
      if (inst.kind !== 'character') return [inst.transform.x, inst.transform.y];
      const m = motionAt(scene, inst, at, (r) => (assets.manifest(r)?.data as { action?: ActionData } | undefined)?.action);
      return [m.x, m.y];
    };
    if (move.follow && inst) {
      // Follow: keep the framing the camera had on the target when the clip started.
      const p0 = posAt(c.start);
      const p = posAt(Math.min(t, c.end));
      const w = Math.min(1, (t - c.start) / Math.max(1, Math.min(dur, 0.3 * TICKS_PER_SECOND)));
      center = [center[0] + (p[0] - p0[0]) * w, center[1] + (p[1] - p0[1]) * w * 0.5];
    } else if (move.target && inst) {
      const p = posAt(t);
      center = [center[0] + (p[0] - center[0]) * k, center[1]];
    }
  }
  return { cam, center, width, rotation, shake };
}

export interface CameraMove {
  zoom?: number;
  dx?: number;
  dy?: number;
  roll?: number;
  shake?: number;
  target?: boolean;
  /** Keep the target's starting framing while it moves (follow subject). */
  follow?: boolean;
  ease?: 'linear' | 'inOut' | 'out' | 'in' | 'snap' | 'bounce';
}

function easeMove(e: NonNullable<CameraMove['ease']>, u: number): number {
  switch (e) {
    case 'linear': return u;
    case 'in': return u * u;
    case 'out': return 1 - (1 - u) ** 2;
    case 'snap': return 1 - (1 - Math.min(1, u * 4)) ** 3;
    case 'bounce': return u < 0.5 ? 4 * u * u : 1 - Math.abs(Math.sin(u * Math.PI * 3)) * (1 - u) * 0.4;
    default: return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  }
}

/** Stage → screen transform for a camera and output size; the framing height is kept across aspect ratios (FR-CAM-06). */
export function viewMatrix(scene: Scene, cs: CameraState, outW: number, outH: number, designAspect: number, parallax = 1): Mat {
  const designH = cs.width / designAspect;
  const scale = outH / designH;
  const lens = LENS[cs.cam.lens] ?? 1;
  const p = 1 - (1 - parallax) * lens;
  const ref: [number, number] = [scene.stage.width / 2, scene.stage.height / 2];
  const cx = cs.center[0] * p + ref[0] * (1 - p) + cs.shake[0];
  const cy = cs.center[1] * p + ref[1] * (1 - p) + cs.shake[1];
  return mul(T(outW / 2, outH / 2), mul(S(scale), mul(R(-cs.rotation), T(-cx, -cy))));
}

/* ------------------------------------------------------------------ performance */

function activeClips(scene: Scene, owner: string, kind: string, t: number): Clip[] {
  const tracks = new Set(scene.tracks.filter((tr) => tr.owner === owner && tr.kind === kind && !tr.mute).map((tr) => tr.id));
  return scene.clips.filter((c) => c.enabled && tracks.has(c.track) && t >= c.start && t < c.end).sort((a, b) => a.start - b.start);
}

function setPath(pose: Pose, key: string, v: number | number[] | string, w: number, additive: boolean) {
  const lerp = (a: number, b: number) => (additive ? a + b * w : a + (b - a) * w);
  const [root, sub] = key.split('.') as [string, string | undefined];
  const p = pose as unknown as Record<string, unknown>;
  if (/^(arm|leg)[LR]$/.test(root) && !sub && Array.isArray(v)) {
    const cur = (p[root] as { t: number[] }).t;
    p[root] = { ...(p[root] as object), t: cur.map((c, i) => lerp(c, (v as number[])[i] ?? c)) };
  } else if (/^(arm|leg)[LR]$/.test(root) && sub === 'pole' && Array.isArray(v)) {
    p[root] = { ...(p[root] as object), pole: v };
  } else if (/^hand[LR]$/.test(root) && typeof v === 'string') {
    if (w >= 0.5) p[root] = v;
  } else if ((root === 'spine' || root === 'head') && sub && typeof v === 'number') {
    const o = { ...(p[root] as Record<string, number>) };
    o[sub] = lerp(o[sub] ?? 0, v);
    p[root] = o;
  } else if (root === 'offset' && sub && typeof v === 'number') {
    const o = [...(p.offset as number[])];
    o[sub === 'x' ? 0 : 1] = lerp(o[sub === 'x' ? 0 : 1]!, v);
    p.offset = o;
  } else if ((root === 'shrug' || root === 'stretch' || root === 'breath') && typeof v === 'number') {
    p[root] = lerp(p[root] as number, v);
  } else if (root === 'posture' && typeof v === 'string') {
    if (w >= 0.5) p.posture = v;
  }
}

export interface PerfResult {
  pose: Pose;
  face: FaceState;
  mouth: MouthLetter | null;
  gaze: [number, number];
  overlays: Record<string, number>;
  speaking: boolean;
  extraParts: string[];
  /** Distance rolled (character units) for rolling rig variants; turns the wheels (FR-CHR-11). */
  rolled?: number;
}

function blinkFactor(t: number, seed: number): number {
  const s = sec(t);
  const k0 = Math.floor(s / 3.4);
  let f = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const rnd = prng((seed ^ (k * 2654435761)) >>> 0);
    const at = k * 3.4 + rnd() * 2.6;
    const d = Math.abs(s - at);
    if (d < 0.08) f = Math.max(f, 1 - d / 0.08);
  }
  return f;
}

function faceFrom(e: ExpressionData): FaceState {
  return {
    eyeOpenL: e.eyeOpenL ?? e.eyeOpen ?? 1,
    eyeOpenR: e.eyeOpenR ?? e.eyeOpen ?? 1,
    eyeHappy: e.eyeHappy ?? 0,
    eyeLower: e.eyeLower ?? 0,
    browInnerL: e.browInnerL ?? e.browInner ?? 0,
    browInnerR: e.browInnerR ?? e.browInner ?? 0,
    browOuterL: e.browOuterL ?? e.browOuter ?? 0,
    browOuterR: e.browOuterR ?? e.browOuter ?? 0,
    browFurrow: e.browFurrow ?? 0,
    mouthCurve: e.mouthCurve ?? 0,
    mouthWidth: e.mouthWidth ?? 0,
    restMouth: (e.restMouth ?? 'X') as MouthLetter,
    cheek: e.cheek ?? 0,
    lookDown: e.lookDown ?? 0,
  };
}

function mixFace(a: FaceState, b: FaceState, w: number): FaceState {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof FaceState)[]) {
    if (k === 'restMouth') out.restMouth = w >= 0.5 ? b.restMouth : a.restMouth;
    else (out as unknown as Record<string, number>)[k] = (a[k] as number) + ((b[k] as number) - (a[k] as number)) * w;
  }
  return out;
}

/** Mouth tracks per alignment object (state is immutable: a re-aligned take gets a new alignment object). */
const mouthCache = new WeakMap<object, Map<string, ReturnType<typeof mouthTrackFromAlignment>>>();

function perform(state: ProjectState, scene: Scene, inst: Instance, t: number, assets: AssetResolver, fps: number, motion?: Motion, posOf?: (id: string) => [number, number] | undefined): PerfResult {
  const ch = inst.character!;
  const seed = (scene.seed ^ hash32(inst.id)) >>> 0;
  const actionOf = (r: string) => (assets.manifest(r)?.data as { action?: ActionData } | undefined)?.action;
  // Posture persists after posture-changing actions end (sit down → seated until stand up, FR-ACT-03).
  const pose: Pose = JSON.parse(JSON.stringify({ ...REST_POSE, posture: postureAt(scene, inst.id, ch.posture, t, actionOf) }));
  // Identity options with a rig variant (FR-CHR-11): a held posture, and rolling instead of walking.
  const man = inst.asset ? assets.manifest(inst.asset) : undefined;
  const variant = man ? characterVariant(man, ch.look, assets) : {};
  if (variant.posture) pose.posture = variant.posture;
  let rolled: number | undefined;
  if (variant.rolling && motion) rolled = motion.distance / Math.max(1e-6, inst.transform.scale);
  // Walking (FR-ACT-04): the gait follows the distance travelled, in character units along the body's forward axis.
  else if (motion?.moving && motion.gait) {
    const facing = Math.sin((VIEW_ANGLE[motion.view ?? ch.view] * Math.PI) / 180) || 1;
    pose.gait = { distance: motion.distance / Math.max(1e-6, inst.transform.scale) / facing, stride: motion.gait.stride, lift: motion.gait.lift };
  }
  let face = { ...NEUTRAL_FACE };
  const overlays: Record<string, number> = {};
  const extraParts: string[] = [];
  let gaze: [number, number] = [0, 0];
  const s = sec(t);
  const actionFace: [string, number, number, boolean][] = [];

  // Base expression (resting face, FR-EXP-05).
  if (ch.baseExpression) {
    const e = assets.manifest(ch.baseExpression)?.data as { expression?: ExpressionData } | undefined;
    if (e?.expression) face = mixFace(face, faceFrom(e.expression), (e.expression.intensity ?? 70) / 100);
  }

  // Idle behaviour (FR-ACT-07): breathing and a slow weight shift, seeded per character.
  if (ch.auto.idle) {
    const ph = (seed % 1000) / 1000;
    pose.breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * (s / 4.2 + ph));
    pose.head = { ...pose.head, roll: Math.sin(2 * Math.PI * (s / 7.3 + ph)) * 1.2, pitch: Math.sin(2 * Math.PI * (s / 5.1 + ph)) * 1.0 };
    pose.spine = { ...pose.spine, roll: Math.sin(2 * Math.PI * (s / 9.1 + ph)) * 0.8 };
  }

  // Actions (FR-ACT-01/02). Later clips override earlier ones on the same channel; additive ones layer.
  for (const c of activeClips(scene, inst.id, 'acting', t)) {
    const m = c.asset ? assets.manifest(c.asset) : undefined;
    const a = (m?.data as { action?: ActionData } | undefined)?.action;
    if (!a) continue;
    const w = clipWeight(t, c.start, c.end, c.blendIn, c.blendOut) * ((c.params.intensity as number | undefined) ?? 1);
    const durS = sec(c.end - c.start);
    const speed = (c.params.speed as number | undefined) ?? 1;
    const u = a.loop ? ((sec(t - c.start) * speed) / a.duration) % 1 : Math.min(1, sec(t - c.start) / durS);
    const keys = c.params.hand && a.hand && c.params.hand !== a.hand && a.hand !== 'both' ? mirrorKeys(a.keys) : a.keys;
    for (const [k, ks] of Object.entries(keys)) {
      const v = sample(ks as Key[], u);
      if (k.startsWith('face.')) {
        // Face controls written by an action (e.g. a wince during a shrug) apply after expressions.
        if (typeof v === 'number') actionFace.push([k.slice(5), v, w, !!a.additive]);
        continue;
      }
      if (k.startsWith('gaze.')) {
        if (typeof v === 'number') gaze = k === 'gaze.x' ? [gaze[0] + (v - gaze[0]) * w, gaze[1]] : [gaze[0], gaze[1] + (v - gaze[1]) * w];
        continue;
      }
      if (v !== undefined) setPath(pose, k, v, w, !!a.additive);
    }
    if (a.resultPosture && u >= 0.999) pose.posture = a.resultPosture as Pose['posture'];
    if (c.params.prop) extraParts.push(String(c.params.prop));
  }
  if (variant.posture) pose.posture = variant.posture;

  // Expressions (FR-EXP-01/04) with per-clip fine-tune overrides (FR-EXP-02).
  let restMouthW = 0;
  let blinkForced = 0;
  let blinkSuppressed = false;
  for (const c of activeClips(scene, inst.id, 'face', t)) {
    // Blink clips add a blink (closing over the clip) or remove automatic blinks for their span (FR-EXP-03).
    if (c.params.blink === true) {
      const u = (t - c.start) / Math.max(1, c.end - c.start);
      blinkForced = Math.max(blinkForced, Math.sin(Math.PI * u));
      continue;
    }
    if (c.params.blink === false) {
      blinkSuppressed = true;
      continue;
    }
    const e = c.asset ? (assets.manifest(c.asset)?.data as { expression?: ExpressionData } | undefined)?.expression : undefined;
    if (!e) continue;
    const intensity = ((c.params.intensity as number | undefined) ?? e.intensity ?? 70) / 100;
    const w = clipWeight(t, c.start, c.end, c.blendIn, c.blendOut) * intensity;
    const tuned: ExpressionData = { ...e, ...((c.params.tune as ExpressionData | undefined) ?? {}) };
    const target = faceFrom(tuned);
    // Hold variation (FR-EXP-01): a small, seeded micro-movement of brows and mouth while the expression holds.
    const hold = Number(c.params.hold ?? 0);
    if (hold > 0) {
      const ph = (hash32(c.id) % 1000) / 1000;
      const k = Math.min(1, hold);
      target.browInnerL += Math.sin(2 * Math.PI * (s / 2.3 + ph)) * 0.08 * k;
      target.browInnerR += Math.sin(2 * Math.PI * (s / 2.3 + ph + 0.1)) * 0.08 * k;
      target.mouthCurve += Math.sin(2 * Math.PI * (s / 3.1 + ph)) * 0.06 * k;
    }
    face = mixFace(face, target, Math.min(1, w));
    if (w > restMouthW) {
      restMouthW = w;
      face.restMouth = w >= 0.35 ? target.restMouth : face.restMouth;
    }
    if (tuned.overlay) {
      const key = tuned.overlay.split('@')[0]!;
      overlays[key] = Math.max(overlays[key] ?? 0, w * (tuned.overlayAmount ?? 1));
    }
    if (tuned.gaze) gaze = [gaze[0] + tuned.gaze[0] * w, gaze[1] + tuned.gaze[1] * w];
    if (tuned.head) pose.head = { yaw: pose.head.yaw + (tuned.head.yaw ?? 0) * w, pitch: pose.head.pitch + (tuned.head.pitch ?? 0) * w, roll: pose.head.roll + (tuned.head.roll ?? 0) * w };
  }

  for (const [k, v, w, additive] of actionFace) {
    const f = face as unknown as Record<string, number>;
    if (typeof f[k] === 'number') f[k] = additive ? f[k]! + v * w : f[k]! + (v - f[k]!) * w;
  }

  // Blinks (FR-EXP-03): automatic unless the eyes are already closed or a clip removes them; blink clips add one.
  if (blinkForced > 0) {
    face.eyeOpenL *= 1 - blinkForced;
    face.eyeOpenR *= 1 - blinkForced;
  } else if (ch.auto.blinks && !blinkSuppressed && face.eyeOpenL > 0.3) {
    const b = blinkFactor(t, seed);
    if (b > 0) {
      face.eyeOpenL *= 1 - b;
      face.eyeOpenR *= 1 - b;
    }
  }

  // Speech and lip sync (FR-LIP-03): only a ready take that matches the text moves the mouth (P7).
  let mouth: MouthLetter | null = null;
  let speaking = false;
  for (const c of activeClips(scene, inst.id, 'dialogue', t)) {
    if (!c.line || c.line.muted) continue;
    const take = c.line.take ? state.takes[c.line.take] : undefined;
    if (!take || lineTakeState(state, c) !== 'Ready' || !take.alignment) continue;
    speaking = true;
    const key = `${fps}:${JSON.stringify(c.line.mouthOverrides ?? [])}`;
    let byKey = mouthCache.get(take.alignment);
    if (!byKey) mouthCache.set(take.alignment, (byKey = new Map()));
    let track = byKey.get(key);
    if (!track) {
      // Amplitude fallback when no aligner was available (FR-LIP-02): approximate shapes from the RMS envelope.
      const env = take.alignment.envelope;
      track = take.alignment.method === 'amplitude' && env ? mouthTrackFromEnvelope(env.values, env.windowS, { fps }) : mouthTrackFromAlignment(take.alignment, { fps });
      track = { ...track, blocks: applyOverrides(track.blocks, c.line.mouthOverrides as MouthBlock[] | undefined) };
      byKey.set(key, track);
    }
    mouth = shapeAt(track.blocks, sec(t - c.start + (c.sourceIn ?? 0))) as MouthLetter;
  }

  // Gaze clips (FR-ACT-05) override the tendency.
  for (const c of activeClips(scene, inst.id, 'gaze', t)) {
    const w = clipWeight(t, c.start, c.end, c.blendIn, c.blendOut);
    const target = c.params.target as string | { x: number; y: number } | undefined;
    const dir = gazeDirection(scene, inst, target, t, posOf);
    gaze = [gaze[0] + (dir[0] - gaze[0]) * w, gaze[1] + (dir[1] - gaze[1]) * w];
    pose.head = { ...pose.head, yaw: pose.head.yaw + dir[0] * 18 * w, pitch: pose.head.pitch + dir[1] * 8 * w };
  }
  // Listening (FR-ACT-07): glance toward whoever is speaking when not speaking and no gaze clip.
  if (ch.auto.listening && !speaking && !activeClips(scene, inst.id, 'gaze', t).length) {
    const speaker = scene.clips.find((c) => c.line && c.line.speaker !== inst.id && t >= c.start && t < c.end && c.enabled);
    if (speaker) {
      const dir = gazeDirection(scene, inst, speaker.line!.speaker, t, posOf);
      gaze = [gaze[0] * 0.3 + dir[0] * 0.7, gaze[1] * 0.3 + dir[1] * 0.7];
      pose.head = { ...pose.head, yaw: pose.head.yaw + dir[0] * 10 };
    }
  }
  return { pose, face, mouth, gaze, overlays, speaking, extraParts, ...(rolled !== undefined ? { rolled } : {}) };
}

/** Performance state of a character instance at t (pose, face, mouth, gaze) — for tests, readouts and tools. */
export function performAt(state: ProjectState, sceneId: string, instanceId: string, t: number, assets: AssetResolver): PerfResult {
  const scene = state.scenes[sceneId];
  const inst = scene?.instances.find((i) => i.id === instanceId);
  if (!scene || !inst?.character) throw new Error(`Character instance ${instanceId} not found`);
  const { motion, posOf } = motionContext(scene, t, assets);
  return perform(state, scene, inst, t, assets, state.project.frameRate, motion(inst), posOf);
}

/**
 * Stage positions of a character's joints at t (feet, hands, head…) — for foot-contact checks, attaching props to
 * hands and overlays. Uses the same evaluation as rendering.
 */
export function characterJointsAt(state: ProjectState, sceneId: string, instanceId: string, t: number, o: Pick<EvalOptions, 'assets' | 'styles' | 'family'>): Record<string, [number, number]> {
  const scene = state.scenes[sceneId];
  const inst = scene?.instances.find((i) => i.id === instanceId);
  if (!scene || !inst?.character || !inst.asset) throw new Error(`Character instance ${instanceId} not found`);
  const family = o.family ?? state.project.styleFamily;
  const man = o.assets.manifest(inst.asset);
  if (!man) throw new Error(`${inst.asset} not found`);
  const ctx = motionContext(scene, t, o.assets);
  const mo = ctx.motion(inst);
  const perf = perform(state, scene, inst, t, o.assets, state.project.frameRate, mo, ctx.posOf);
  const { spec, variant } = resolveCharacter(man, inst.character.look, family, o.styles[family], o.assets, perf.extraParts);
  const composed = composeCharacter(withWheels(spec, variant, perf), { view: mo.view ?? inst.character.view, flip: mo.flip, pose: perf.pose, face: perf.face, mouth: perf.mouth, gaze: perf.gaze, overlays: perf.overlays });
  const k = inst.transform.scale;
  const out: Record<string, [number, number]> = {};
  for (const [name, j] of Object.entries(composed.joints)) out[name] = [mo.x + j.p[0] * k, mo.y + j.p[1] * k];
  return out;
}

/** Rolling rig variants: wheel rotation from the distance rolled, as `wheel.cos`/`wheel.sin` art parameters. */
function withWheels(spec: CharacterSpec, variant: RigVariant, perf: PerfResult): CharacterSpec {
  if (!variant.rolling) return spec;
  const d = bodyDims(spec.body);
  const a = (perf.rolled ?? 0) / Math.max(1e-6, variant.rolling.radius * (d.thigh + d.shin));
  return { ...spec, params: { ...spec.params, 'wheel.cos': Math.cos(a), 'wheel.sin': Math.sin(a) } };
}

/** Per-frame motion lookups: each character's position and facing at t (memoised within the frame). */
function motionContext(scene: Scene, t: number, assets: AssetResolver) {
  const actionOf = (r: string) => (assets.manifest(r)?.data as { action?: ActionData } | undefined)?.action;
  const cache = new Map<string, Motion>();
  const motion = (inst: Instance): Motion => {
    let m = cache.get(inst.id);
    if (!m) {
      cache.set(inst.id, { x: inst.transform.x, y: inst.transform.y, flip: inst.transform.flipX, distance: 0, moving: false }); // guards turn-to-face cycles
      m = inst.kind === 'character' ? motionAt(scene, inst, t, actionOf, (id) => posOf(id)) : { x: inst.transform.x, y: inst.transform.y, flip: inst.transform.flipX, distance: 0, moving: false };
      cache.set(inst.id, m);
    }
    return m;
  };
  const posOf = (id: string): [number, number] | undefined => {
    const i = scene.instances.find((x) => x.id === id);
    if (!i) return undefined;
    const m = motion(i);
    return [m.x, m.y];
  };
  return { motion, posOf };
}

/** Screen-space direction (−1…1) from an instance's head to a target. */
function gazeDirection(scene: Scene, inst: Instance, target: string | { x: number; y: number } | undefined, _t: number, posOf?: (id: string) => [number, number] | undefined): [number, number] {
  if (!target || target === 'camera') return [0, 0];
  let tx: number;
  let ty: number;
  // Positions at the current time, so gaze follows moving characters (FR-ACT-05).
  const at = (i: Instance): [number, number] => posOf?.(i.id) ?? [i.transform.x, i.transform.y];
  if (typeof target === 'string') {
    const o = scene.instances.find((i) => i.id === target);
    if (!o) return [0, 0];
    const p = at(o);
    tx = p[0];
    ty = p[1] - 400 * o.transform.scale;
  } else {
    tx = target.x;
    ty = target.y;
  }
  const self = at(inst);
  const hx = self[0];
  const hy = self[1] - 400 * inst.transform.scale;
  const dx = tx - hx;
  const dy = ty - hy;
  const d = Math.hypot(dx, dy) || 1;
  return [Math.max(-1, Math.min(1, (dx / d) * 1.2)), Math.max(-1, Math.min(1, (dy / d) * 0.8))];
}

/* ------------------------------------------------------------------ props and set pieces */

function drawPropArt(data: PartData, family: StyleFamily, state: string, colors: Record<string, string>, style: FamilyStyle, t: number, seed: number): Item[] {
  const fam = data.families[family] ?? data.families.flat ?? data.families.illustrated;
  const art: ViewArt | undefined = fam?.views.front;
  if (!art) return [];
  const palette = buildPalette({ ...(data.colors ?? {}), ...colors }, style);
  const s = sec(t);
  const params: Record<string, number> = { 'anim.sin': Math.sin(2 * Math.PI * s * 0.5 + (seed % 100) / 16), 'anim.phase': (s * 0.5 + (seed % 100) / 100) % 1, 'anim.fast': Math.sin(2 * Math.PI * s * 2.3 + (seed % 37)) };
  const map: Mapper = (u, v) => [u, v];
  const items: Item[] = [];
  const stateMap: Record<string, string> = { state };
  for (const layer of art.layers) {
    if (layer.when && !Object.entries(layer.when).every(([k, v]) => (Array.isArray(v) ? v.includes(stateMap[k] ?? '') : stateMap[k] === v))) continue;
    const byId = new Map<string, string>();
    for (const sh of layer.shapes ?? []) {
      if (sh.when && !Object.entries(sh.when).every(([k, v]) => (Array.isArray(v) ? v.includes(stateMap[k] ?? '') : stateMap[k] === v))) continue;
      if (sh.art) {
        // Imported prop artwork (rigging assistant), in stage units around the prop's origin.
        const placed = placedArt(sh.art, map, sh.opacity);
        if (placed) items.push(placed);
        continue;
      }
      const d = sh.path ? buildPath(sh.path, art.points, params, map, () => {}) : sh.ellipse ? ellipsePath(sh.ellipse, art.points, params, map, () => {}) : '';
      if (sh.id) byId.set(sh.id, d);
      const at = (n: string) => {
        const mp = art.points[n];
        return mp ? (evalPoint(mp, params) as [number, number]) : ([0, 0] as [number, number]);
      };
      let op = sh.opacity ?? 1;
      if (sh.opacityParam) op *= Math.max(0, Math.min(1, (params[sh.opacityParam] ?? 0) * 0.5 + 0.5));
      const it: Item = { k: 'path', d, ...(sh.fill ? { fill: resolveFill(sh.fill, palette, at) } : {}), ...(sh.stroke ? { stroke: { paint: { color: resolveColor(sh.stroke.c, palette) }, width: sh.stroke.w, cap: sh.stroke.cap ?? 'round', join: 'round' } } : {}), ...(op < 1 ? { op } : {}), ...(sh.blend ? { blend: sh.blend } : {}) };
      if (sh.clip && byId.has(sh.clip)) items.push({ k: 'group', clip: byId.get(sh.clip)!, items: [it] });
      else items.push(it);
    }
  }
  return items;
}

/* ------------------------------------------------------------------ frame */

/**
 * Evaluates a scene at time t (ticks) into a display list in output pixels.
 */
export function evaluateFrame(state: ProjectState, sceneId: string, tIn: number, o: EvalOptions): EvaluatedFrame {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const family = o.family ?? state.project.styleFamily;
  const style = o.styles[family];
  const issues: string[] = [];
  // Effects and atmosphere clips (FR-FX-01/02) on effect tracks; a freeze holds the picture (sound and captions go on).
  const fxTracks = new Set(scene.tracks.filter((tr) => tr.kind === 'effect' && !tr.mute).map((tr) => tr.id));
  const fxClips = scene.clips.filter((c) => c.enabled && fxTracks.has(c.track) && c.asset && tIn >= c.start && tIn < c.end).sort((a, b) => a.start - b.start);
  const fxData = (c: Clip) => o.assets.manifest(c.asset!)?.data as { effect?: EffectData; atmosphere?: AtmoData } | undefined;
  const freeze = fxClips.find((c) => fxData(c)?.effect?.type === 'freeze');
  const t = freeze ? freeze.start : tIn;
  const cs = cameraAt(scene, t, o.assets, o.aspect);
  const designAspect = state.project.output.width / state.project.output.height;
  const fps = state.project.frameRate;
  const boxes: EvaluatedFrame['boxes'] = {};
  const mouths: EvaluatedFrame['mouths'] = {};
  const planeOrder = new Map(scene.stage.depthPlanes.map((p) => [p.id, p.order]));

  const visibleInstances = scene.instances.filter((i) => i.visible && i.kind !== 'group');
  const actionOf = (r: string) => (o.assets.manifest(r)?.data as { action?: ActionData } | undefined)?.action;
  // Props held in a hand (FR-ACT-06) draw with their holder, just in front of it.
  const held = new Map<string, Interaction>();
  for (const i of visibleInstances) if (i.kind === 'prop') {
    const h = holderAt(scene, i.id, t, actionOf);
    if (h) held.set(i.id, h);
  }
  const sortKey = (i: Instance): [number, number] => {
    const h = held.get(i.id)?.holder;
    return h ? [planeOrder.get(h.depthPlane) ?? 0, h.order + 0.5] : [planeOrder.get(i.depthPlane) ?? 0, i.order];
  };
  const sorted = [...visibleInstances].sort((a, b) => sortKey(a)[0] - sortKey(b)[0] || sortKey(a)[1] - sortKey(b)[1] || a.id.localeCompare(b.id));
  const items: Item[] = [];
  const parentOffset = (inst: Instance): [number, number] => {
    let x = 0;
    let y = 0;
    let p = inst.parent ? scene.instances.find((i) => i.id === inst.parent) : undefined;
    while (p) {
      x += p.transform.x;
      y += p.transform.y;
      p = p.parent ? scene.instances.find((i) => i.id === p!.parent) : undefined;
    }
    return [x, y];
  };

  const motions = motionContext(scene, t, o.assets);
  // Characters are composed once per frame (props held in their hands need the hand position first).
  const composedCache = new Map<string, { composed: ReturnType<typeof composeCharacter>; perf: PerfResult; missing: string[] } | null>();
  const composeInst = (inst: Instance) => {
    if (composedCache.has(inst.id)) return composedCache.get(inst.id)!;
    const man = inst.asset ? o.assets.manifest(inst.asset) : undefined;
    if (!man || !inst.character) {
      composedCache.set(inst.id, null);
      return null;
    }
    const mo = motions.motion(inst);
    const perf = perform(state, scene, inst, t, o.assets, fps, mo, motions.posOf);
    const { spec, missing, variant } = resolveCharacter(man, inst.character.look, family, style, o.assets, perf.extraParts);
    const composed = composeCharacter(withWheels(spec, variant, perf), { view: mo.view ?? inst.character.view, flip: mo.flip, pose: perf.pose, face: perf.face, mouth: perf.mouth, gaze: perf.gaze, overlays: perf.overlays });
    const r = { composed, perf, missing };
    composedCache.set(inst.id, r);
    return r;
  };
  // Silhouette treatment (K1): attached characters, or all characters, draw as black shapes.
  const silhouettes = new Set<string>();
  for (const c of fxClips) if (fxData(c)?.effect?.type === 'silhouette') {
    const at = c.params.attach;
    for (const i of scene.instances) if (i.kind === 'character' && (typeof at !== 'string' || at === 'screen' || at === i.id)) silhouettes.add(i.id);
  }
  const drawInstances = (camState: CameraState): Item[] => {
    const out: Item[] = [];
    for (const inst of sorted) {
      const view = viewMatrix(scene, camState, o.width, o.height, designAspect, held.get(inst.id)?.holder.parallax ?? inst.parallax);
      const [px, py] = parentOffset(inst);
      const mo = motions.motion(inst);
      let tr = { ...inst.transform, x: mo.x, y: mo.y, flipX: mo.flip };
      const hold = held.get(inst.id);
      if (hold) {
        // Attach the prop's grip anchor to the holder's grip (hand) anchor; it mirrors with the holder.
        const hc = composeInst(hold.holder);
        const hm = motions.motion(hold.holder);
        const a = hc?.composed.anchors[`grip${hold.hand}`] ?? hc?.composed.anchors[`wrist${hold.hand}`];
        if (a) {
          const pm = inst.asset ? o.assets.manifest(inst.asset) : undefined;
          const g = ((pm?.anchors as Record<string, unknown> | undefined)?.grip as [number, number] | undefined) ?? [0, 0];
          const k = hold.holder.transform.scale;
          const flip = hm.flip;
          tr = { ...tr, x: hm.x + a[0] * k - g[0] * tr.scale * (flip ? -1 : 1), y: hm.y + a[1] * k - g[1] * tr.scale, flipX: flip, rotation: 0 };
        }
      }
      const local: Mat = mul(T(tr.x + px, tr.y + py), mul(R(tr.rotation), S(tr.scale * (tr.flipX && inst.kind !== 'character' ? -1 : 1), tr.scale)));
      const m = mul(view, local);
      let content: Item[] = [];
      if (inst.kind === 'character' && inst.asset && inst.character) {
        const r = composeInst(inst);
        if (!r) {
          issues.push(`${inst.name}: character ${inst.asset} not found`);
          continue;
        }
        const { composed, perf, missing } = r;
        mouths[inst.id] = perf.mouth;
        for (const mref of missing) issues.push(`${inst.name}: missing asset ${mref}`);
        for (const i of composed.issues) issues.push(`${inst.name}: ${i}`);
        content = [composed.item];
        const b = composed.bounds;
        boxes[inst.id] = screenBox(m, b.x, b.y, b.w, b.h);
      } else if ((inst.kind === 'prop' || inst.kind === 'set-piece') && inst.asset) {
        const man = o.assets.manifest(inst.asset);
        // Kit set pieces carry their art inside the kit (params.part); props carry it directly.
        const kitPart = (man?.data as { kit?: { parts: Record<string, { art: PartData; bounds: [number, number, number, number] }> } } | undefined)?.kit?.parts[String(inst.params.part ?? '')];
        const data = kitPart?.art ?? (man?.data as PartData | undefined);
        if (!data?.families) {
          issues.push(`${inst.name}: ${inst.asset} not found`);
          continue;
        }
        content = drawPropArt(data, family, propStateAt(scene, inst, t, actionOf), (inst.params.colors as Record<string, string> | undefined) ?? {}, style, t, hash32(inst.id));
        const bb = kitPart?.bounds ?? (man!.anchors as { bounds?: [number, number, number, number] }).bounds ?? [-100, -200, 200, 200];
        boxes[inst.id] = screenBox(m, bb[0], bb[1], bb[2], bb[3]);
      } else if (inst.kind === 'image' && inst.asset) {
        // Imported images (FR-IMP-01): raster media or a parsed vector drawing, centred on the instance origin.
        const data = o.assets.manifest(inst.asset)?.data as ImportedImageData | undefined;
        const drawn = data ? importedImageItems(data) : undefined;
        if (!drawn) {
          issues.push(`${inst.name}: ${inst.asset} not found`);
          continue;
        }
        content = drawn.items;
        boxes[inst.id] = screenBox(m, -drawn.w / 2, -drawn.h / 2, drawn.w, drawn.h);
      } else if (inst.kind === 'text') {
        content = [{ k: 'text', text: String(inst.params.text ?? ''), x: 0, y: 0, size: Number(inst.params.size ?? 48), family: String(inst.params.font ?? 'Inter'), weight: Number(inst.params.weight ?? 700), color: String(inst.params.color ?? '#FFFFFF'), align: 'center' }];
      }
      if (!content.length) continue;
      out.push({ k: 'group', id: inst.id, tf: m, ...(inst.opacity < 1 ? { op: inst.opacity } : {}), ...(silhouettes.has(inst.id) ? { colorMatrix: SILHOUETTE_MATRIX } : {}), items: content } as GroupItem);
    }
    return out;
  };
  // Shot transitions (FR-FX-03): the incoming shot's transition blends from the previous shot's picture.
  const shotTracks = new Set(scene.tracks.filter((tr) => tr.kind === 'shot' && !tr.mute).map((tr) => tr.id));
  const shot = scene.clips.find((c) => c.enabled && shotTracks.has(c.track) && t >= c.start && t < c.end);
  const trData = shot?.params.transition ? (o.assets.manifest(String(shot.params.transition))?.data as { transition?: TransitionData } | undefined)?.transition : undefined;
  const trDur = Math.round(Number(shot?.params.transitionS ?? 0.5) * TICKS_PER_SECOND);
  let picture: Item[];
  if (shot && trData && trData.type !== 'cut' && t < shot.start + trDur) {
    const u = (t - shot.start) / Math.max(1, trDur);
    const prevShot = scene.clips.some((c) => c.enabled && shotTracks.has(c.track) && c.end === shot.start) || shot.start > 0;
    const before = prevShot ? drawInstances(cameraAt(scene, Math.max(0, shot.start - 1), o.assets, o.aspect)) : [];
    const after = drawInstances(cs);
    const subject = typeof shot.params.camera === 'string' ? scene.cameras.find((c) => c.id === shot.params.camera)?.subjects[0] : undefined;
    const fb = subject ? boxes[subject] : undefined;
    picture = transitionItems(trData, before, after, u, o.width, o.height, fb ? [fb.x + fb.w / 2, fb.y + fb.h * 0.25] : [o.width / 2, o.height / 2]);
  } else picture = drawInstances(cs);
  items.push(...picture);

  // Effects attached to the screen, a stage point or a character, then atmosphere layers in front of the stage.
  const viewNow = viewMatrix(scene, cs, o.width, o.height, designAspect, 1);
  let grade: number[] | undefined;
  for (const c of fxClips) {
    const d = fxData(c);
    const k = clipWeight(tIn, c.start, c.end, c.blendIn, c.blendOut) * Number(c.params.intensity ?? 1);
    const s = sec(tIn - c.start);
    const seed = hash32(c.id);
    if (d?.atmosphere) {
      const a = { ...d.atmosphere, ...(typeof c.params.color === 'string' ? { color: c.params.color } : {}) };
      const g = gradeMatrix(a, k);
      if (g) grade = g;
      else items.push(...atmosphereItems(a, o.width, o.height, s, k, seed));
    } else if (d?.effect) {
      const e = { ...d.effect, ...(typeof c.params.color === 'string' ? { color: c.params.color } : {}), ...(typeof c.params.symbol === 'string' ? { symbol: c.params.symbol as never } : {}) };
      const at = c.params.attach;
      let x = o.width / 2;
      let y = o.height / 2;
      let r = o.height * 0.12;
      const b = typeof at === 'string' ? boxes[at] : undefined;
      if (b) {
        // Character effects sit above the head (symbols) or at the centre (impacts), following the character.
        r = Math.max(8, b.h * 0.18);
        x = b.x + b.w / 2 + (e.type === 'symbol' ? b.w * 0.25 : 0);
        y = e.type === 'symbol' ? b.y - r * 0.15 : b.y + b.h * 0.4;
      } else if (at && typeof at === 'object' && 'x' in (at as object)) {
        const p = at as { x: number; y: number };
        x = viewNow[0] * p.x + viewNow[2] * p.y + viewNow[4];
        y = viewNow[1] * p.x + viewNow[3] * p.y + viewNow[5];
      }
      items.push(...effectItems(e, x, y, r, o.width, o.height, (tIn - c.start) / Math.max(1, c.end - c.start), s, k, seed));
    }
  }
  // World text (signs, screens) is part of the picture, on the stage (FR-TXT-05).
  const textTracks = new Set(scene.tracks.filter((tr) => tr.kind === 'text' && !tr.mute).map((tr) => tr.id));
  const textClips = scene.clips.filter((c) => c.enabled && textTracks.has(c.track) && c.asset && tIn >= c.start && tIn < c.end).sort((a, b) => a.start - b.start);
  const textData = (c: Clip) => o.assets.manifest(c.asset!)?.data as { bubble?: BubbleStyle; graphic?: GraphicStyle; world?: WorldTextStyle } | undefined;
  for (const c of textClips) {
    const d = textData(c);
    if (d?.world) items.push(...worldTextItems(d.world, { text: String(c.params.text ?? ''), x: Number(c.params.x ?? scene.stage.width / 2), y: Number(c.params.y ?? scene.stage.height * 0.4), width: Number(c.params.width ?? 300) }, viewNow));
  }
  if (grade) {
    // Colour grades (J1) apply to the picture and effects, not to titles, bubbles or captions.
    const graded = items.splice(0, items.length);
    items.push({ k: 'group', items: graded, colorMatrix: grade });
  }
  // Screen text: bubbles that track characters, titles, lower thirds, cards and graphics (FR-TXT-03/04).
  for (const c of textClips) {
    const d = textData(c);
    if (!d || d.world) continue;
    const layout = { w: o.width, h: o.height, u: (tIn - c.start) / Math.max(1, c.end - c.start), s: sec(tIn - c.start), dur: sec(c.end - c.start), boxes, view: viewNow };
    const lineText = typeof c.params.line === 'string' ? scene.clips.find((x) => x.id === c.params.line)?.line?.text : undefined;
    const text = String(c.params.text ?? (lineText ? stripMarkers(lineText) : ''));
    if (d.bubble) {
      const who = typeof c.params.attach === 'string' ? c.params.attach : undefined;
      items.push(...bubbleItems(d.bubble, text, who ? boxes[who] : undefined, layout));
    } else if (d.graphic) {
      items.push(...graphicItems(d.graphic, { text, ...(typeof c.params.subtitle === 'string' ? { subtitle: c.params.subtitle } : {}), ...(Array.isArray(c.params.lines) ? { lines: c.params.lines.map(String) } : {}), ...(typeof c.params.attach === 'string' ? { attach: c.params.attach } : {}) }, layout));
    }
  }

  // Captions (FR-TXT-01): active lines, stacked for concurrent speakers.
  const captions: CaptionLine[] = [];
  for (const c of scene.clips) {
    if (!c.enabled || !c.line || c.line.caption?.hidden || c.line.muted || tIn < c.start || tIn >= c.end) continue;
    const take = c.line.take ? (state.takes[c.line.take] as Take | undefined) : undefined;
    const speaker = scene.instances.find((i) => i.id === c.line!.speaker)?.name ?? '';
    captions.push({ speaker, text: c.line.caption?.text ?? stripMarkers(c.line.text), words: take?.alignment?.words, local: sec(tIn - c.start + (c.sourceIn ?? 0)), duration: sec(c.end - c.start) });
  }
  const cap = state.project.captions;
  if (o.captions && cap.enabled && captions.length) {
    const styleData = cap.style ? (o.assets.manifest(cap.style)?.data as { caption?: CaptionStyle } | undefined)?.caption : undefined;
    if (cap.style && !styleData) issues.push(`Caption style ${cap.style} not found; using the default style`);
    items.push(...captionItems(captions, styleData ?? DEFAULT_CAPTION_STYLE, o.width, o.height, cap.speakerLabels));
  }
  const view = viewMatrix(scene, cs, o.width, o.height, designAspect, 1);
  return {
    frame: { width: o.width, height: o.height, background: o.background ?? '#000000', items },
    camera: { id: cs.cam.id, name: cs.cam.name, center: cs.center, width: cs.width, rotation: cs.rotation },
    captions,
    view,
    issues,
    boxes,
    mouths,
  };
}

export const stripMarkers = stripPauseMarkers;

function screenBox(m: Mat, x: number, y: number, w: number, h: number) {
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => [m[0] * a! + m[2] * b! + m[4], m[1] * a! + m[3] * b! + m[5]]);
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** Data of an imported image asset (`img` kind): raster media or a vector drawing in viewBox units. */
export interface ImportedImageData {
  image?: { media: { hash: string; ext: string }; width: number; height: number };
  vector?: {
    width: number;
    height: number;
    viewBox: [number, number, number, number];
    layers: { name: string; shapes: { d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; evenOdd?: boolean; tf?: Mat }[] }[];
  };
}

/** Display items for an imported image, centred on (0, 0), size in stage units. */
export function importedImageItems(data: ImportedImageData, hidden: Set<string> = new Set()): { items: Item[]; w: number; h: number } | undefined {
  if (data.image) {
    const { width: w, height: h } = data.image;
    return { items: [{ k: 'image', src: `media:${data.image.media.hash}`, x: -w / 2, y: -h / 2, w, h }], w, h };
  }
  if (data.vector) {
    const v = data.vector;
    const sx = v.width / v.viewBox[2];
    const sy = v.height / v.viewBox[3];
    const items: Item[] = [];
    for (const layer of v.layers) {
      if (hidden.has(layer.name)) continue;
      for (const sh of layer.shapes) {
        items.push({
          k: 'path', d: sh.d,
          ...(sh.fill ? { fill: { color: sh.fill } } : {}),
          ...(sh.stroke ? { stroke: { paint: { color: sh.stroke }, width: sh.strokeWidth ?? 1 } } : {}),
          ...(sh.opacity !== undefined && sh.opacity < 1 ? { op: sh.opacity } : {}),
          ...(sh.evenOdd ? { evenOdd: true } : {}),
          ...(sh.tf ? { tf: sh.tf } : {}),
        } as Item);
      }
    }
    const tf: Mat = [sx, 0, 0, sy, -v.width / 2 - v.viewBox[0] * sx, -v.height / 2 - v.viewBox[1] * sy];
    return { items: [{ k: 'group', tf, items } as GroupItem], w: v.width, h: v.height };
  }
  return undefined;
}
