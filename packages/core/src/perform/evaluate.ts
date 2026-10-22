/**
 * Scene evaluation (SRS §6): a pure function of (project state, scene, time, output settings) → display list
 * (FR-RND-01/02). Studio preview, thumbnails, CLI renders and export all call this.
 */
import type { Camera, Clip, Instance, MouthBlock, Scene, StyleFamily, Take } from '@frame/schema';
import { composeCharacter, NEUTRAL_FACE, REST_POSE, type FaceState, type FamilyStyle, type MouthLetter, type PartData, type Pose, type ViewArt, buildPath, ellipsePath, resolveFill, resolveColor, buildPalette, evalPoint, type Mapper } from '@frame/rig';
import type { Frame, GroupItem, Item, Mat } from '@frame/render';
import type { ProjectState } from '../state.js';
import { hash32, prng } from '../ids.js';
import { TICKS_PER_SECOND } from '../time.js';
import { lineTakeState } from '../validate.js';
import { applyOverrides, mouthTrackFromAlignment, shapeAt } from './lipsync.js';
import { clipWeight, mirrorKeys, sample, type ActionData, type ExpressionData, type Key } from './data.js';
import { resolveCharacter, type AssetResolver } from './character.js';
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
    if (move.target && c.params.target) {
      const inst = scene.instances.find((i) => i.id === c.params.target);
      if (inst) center = [center[0] + (inst.transform.x - center[0]) * k, center[1]];
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

interface PerfResult {
  pose: Pose;
  face: FaceState;
  mouth: MouthLetter | null;
  gaze: [number, number];
  overlays: Record<string, number>;
  speaking: boolean;
  extraParts: string[];
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

const mouthCache = new Map<string, ReturnType<typeof mouthTrackFromAlignment>>();

function perform(state: ProjectState, scene: Scene, inst: Instance, t: number, assets: AssetResolver, fps: number): PerfResult {
  const ch = inst.character!;
  const seed = (scene.seed ^ hash32(inst.id)) >>> 0;
  const pose: Pose = JSON.parse(JSON.stringify({ ...REST_POSE, posture: ch.posture }));
  let face = { ...NEUTRAL_FACE };
  const overlays: Record<string, number> = {};
  const extraParts: string[] = [];
  let gaze: [number, number] = [0, 0];
  const s = sec(t);

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
      if (k.startsWith('face.') || k.startsWith('gaze.')) continue;
      const v = sample(ks as Key[], u);
      if (v !== undefined) setPath(pose, k, v, w, !!a.additive);
    }
    if (a.resultPosture && u >= 0.999) pose.posture = a.resultPosture as Pose['posture'];
    if (c.params.prop) extraParts.push(String(c.params.prop));
  }

  // Expressions (FR-EXP-01/04) with per-clip fine-tune overrides (FR-EXP-02).
  let restMouthW = 0;
  for (const c of activeClips(scene, inst.id, 'face', t)) {
    const e = c.asset ? (assets.manifest(c.asset)?.data as { expression?: ExpressionData } | undefined)?.expression : undefined;
    if (!e) continue;
    const intensity = ((c.params.intensity as number | undefined) ?? e.intensity ?? 70) / 100;
    const w = clipWeight(t, c.start, c.end, c.blendIn, c.blendOut) * intensity;
    const tuned: ExpressionData = { ...e, ...((c.params.tune as ExpressionData | undefined) ?? {}) };
    const target = faceFrom(tuned);
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

  // Blinks (FR-EXP-03): automatic unless the eyes are already closed.
  if (ch.auto.blinks && face.eyeOpenL > 0.3) {
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
    const key = `${take.id}:${fps}:${JSON.stringify(c.line.mouthOverrides ?? [])}`;
    let track = mouthCache.get(key);
    if (!track) {
      track = mouthTrackFromAlignment(take.alignment, { fps });
      track = { ...track, blocks: applyOverrides(track.blocks, c.line.mouthOverrides as MouthBlock[] | undefined) };
      if (mouthCache.size > 500) mouthCache.clear();
      mouthCache.set(key, track);
    }
    mouth = shapeAt(track.blocks, sec(t - c.start + (c.sourceIn ?? 0))) as MouthLetter;
  }

  // Gaze clips (FR-ACT-05) override the tendency.
  for (const c of activeClips(scene, inst.id, 'gaze', t)) {
    const w = clipWeight(t, c.start, c.end, c.blendIn, c.blendOut);
    const target = c.params.target as string | { x: number; y: number } | undefined;
    const dir = gazeDirection(scene, inst, target, t);
    gaze = [gaze[0] + (dir[0] - gaze[0]) * w, gaze[1] + (dir[1] - gaze[1]) * w];
    pose.head = { ...pose.head, yaw: pose.head.yaw + dir[0] * 18 * w, pitch: pose.head.pitch + dir[1] * 8 * w };
  }
  // Listening (FR-ACT-07): glance toward whoever is speaking when not speaking and no gaze clip.
  if (ch.auto.listening && !speaking && !activeClips(scene, inst.id, 'gaze', t).length) {
    const speaker = scene.clips.find((c) => c.line && c.line.speaker !== inst.id && t >= c.start && t < c.end && c.enabled);
    if (speaker) {
      const dir = gazeDirection(scene, inst, speaker.line!.speaker, t);
      gaze = [gaze[0] * 0.3 + dir[0] * 0.7, gaze[1] * 0.3 + dir[1] * 0.7];
      pose.head = { ...pose.head, yaw: pose.head.yaw + dir[0] * 10 };
    }
  }
  return { pose, face, mouth, gaze, overlays, speaking, extraParts };
}

/** Screen-space direction (−1…1) from an instance's head to a target. */
function gazeDirection(scene: Scene, inst: Instance, target: string | { x: number; y: number } | undefined, _t: number): [number, number] {
  if (!target || target === 'camera') return [0, 0];
  let tx: number;
  let ty: number;
  if (typeof target === 'string') {
    const o = scene.instances.find((i) => i.id === target);
    if (!o) return [0, 0];
    tx = o.transform.x;
    ty = o.transform.y - 400 * o.transform.scale;
  } else {
    tx = target.x;
    ty = target.y;
  }
  const hx = inst.transform.x;
  const hy = inst.transform.y - 400 * inst.transform.scale;
  const dx = tx - hx;
  const dy = ty - hy;
  const d = Math.hypot(dx, dy) || 1;
  return [Math.max(-1, Math.min(1, (dx / d) * 1.2)), Math.max(-1, Math.min(1, (dy / d) * 0.8))];
}

/* ------------------------------------------------------------------ props and set pieces */

function propState(scene: Scene, inst: Instance, t: number): string {
  let st = inst.propState ?? 'default';
  for (const c of activeClips(scene, inst.id, 'acting', t)) if (typeof c.params.state === 'string') st = c.params.state;
  // State changes persist after a state clip ends (e.g. door left open).
  for (const c of scene.clips) {
    if (!c.enabled || c.end > t || typeof c.params.setState !== 'string') continue;
    const tr = scene.tracks.find((x) => x.id === c.track);
    if (tr?.owner === inst.id) st = c.params.setState;
  }
  return st;
}

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
export function evaluateFrame(state: ProjectState, sceneId: string, t: number, o: EvalOptions): EvaluatedFrame {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const family = o.family ?? state.project.styleFamily;
  const style = o.styles[family];
  const issues: string[] = [];
  const cs = cameraAt(scene, t, o.assets, o.aspect);
  const designAspect = state.project.output.width / state.project.output.height;
  const fps = state.project.frameRate;
  const boxes: EvaluatedFrame['boxes'] = {};
  const planeOrder = new Map(scene.stage.depthPlanes.map((p) => [p.id, p.order]));

  const visibleInstances = scene.instances.filter((i) => i.visible && i.kind !== 'group');
  const sorted = [...visibleInstances].sort((a, b) => (planeOrder.get(a.depthPlane) ?? 0) - (planeOrder.get(b.depthPlane) ?? 0) || a.order - b.order || a.id.localeCompare(b.id));
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

  for (const inst of sorted) {
    const view = viewMatrix(scene, cs, o.width, o.height, designAspect, inst.parallax);
    const [px, py] = parentOffset(inst);
    const tr = inst.transform;
    const local: Mat = mul(T(tr.x + px, tr.y + py), mul(R(tr.rotation), S(tr.scale * (tr.flipX && inst.kind !== 'character' ? -1 : 1), tr.scale)));
    const m = mul(view, local);
    let content: Item[] = [];
    if (inst.kind === 'character' && inst.asset && inst.character) {
      const man = o.assets.manifest(inst.asset);
      if (!man) {
        issues.push(`${inst.name}: character ${inst.asset} not found`);
        continue;
      }
      const perf = perform(state, scene, inst, t, o.assets, fps);
      const { spec, missing } = resolveCharacter(man, inst.character.look, family, style, o.assets, perf.extraParts);
      for (const mref of missing) issues.push(`${inst.name}: missing asset ${mref}`);
      const composed = composeCharacter(spec, { view: inst.character.view, flip: tr.flipX, pose: perf.pose, face: perf.face, mouth: perf.mouth, gaze: perf.gaze, overlays: perf.overlays });
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
      content = drawPropArt(data, family, propState(scene, inst, t), (inst.params.colors as Record<string, string> | undefined) ?? {}, style, t, hash32(inst.id));
      const bb = kitPart?.bounds ?? (man!.anchors as { bounds?: [number, number, number, number] }).bounds ?? [-100, -200, 200, 200];
      boxes[inst.id] = screenBox(m, bb[0], bb[1], bb[2], bb[3]);
    } else if (inst.kind === 'text') {
      content = [{ k: 'text', text: String(inst.params.text ?? ''), x: 0, y: 0, size: Number(inst.params.size ?? 48), family: String(inst.params.font ?? 'Inter'), weight: Number(inst.params.weight ?? 700), color: String(inst.params.color ?? '#FFFFFF'), align: 'center' }];
    }
    if (!content.length) continue;
    items.push({ k: 'group', id: inst.id, tf: m, ...(inst.opacity < 1 ? { op: inst.opacity } : {}), items: content } as GroupItem);
  }

  // Captions (FR-TXT-01): active lines, stacked for concurrent speakers.
  const captions: CaptionLine[] = [];
  for (const c of scene.clips) {
    if (!c.enabled || !c.line || c.line.caption?.hidden || c.line.muted || t < c.start || t >= c.end) continue;
    const take = c.line.take ? (state.takes[c.line.take] as Take | undefined) : undefined;
    const speaker = scene.instances.find((i) => i.id === c.line!.speaker)?.name ?? '';
    captions.push({ speaker, text: c.line.caption?.text ?? stripMarkers(c.line.text), words: take?.alignment?.words, local: sec(t - c.start + (c.sourceIn ?? 0)), duration: sec(c.end - c.start) });
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
  };
}

export const stripMarkers = stripPauseMarkers;

function screenBox(m: Mat, x: number, y: number, w: number, h: number) {
  const pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => [m[0] * a! + m[2] * b! + m[4], m[1] * a! + m[3] * b! + m[5]]);
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
