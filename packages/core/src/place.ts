/**
 * Placing library items and adding timed clips (shared by the CLI and agents; mirrors the Studio's Assets panel):
 * characters, props, images and kits become instances; actions, expressions, effects, atmosphere, sounds and
 * camera moves become clips on the right track.
 */
import { FrameError, type AssetManifest, type Command } from '@frame/schema';
import type { ProjectState } from './state.js';
import { trackFor } from './lookup.js';

const S = 48000;

export interface PlaceOptions {
  x?: number;
  y?: number;
  depthPlane?: string;
  name?: string;
  scale?: number;
  flipX?: boolean;
}

/** Commands that put a library item on the stage. Kits add every piece, behind what is already on each plane. */
export function placeCommands(state: ProjectState, sceneId: string, ref: string, m: AssetManifest, o: PlaceOptions = {}): Command[] {
  const scene = state.scenes[sceneId];
  if (!scene) throw new FrameError('NOT_FOUND', `Scene ${sceneId} not found`);
  const { width, height } = state.project.output;
  const transform = (y: number) => ({ x: o.x ?? width / 2, y: o.y ?? y, ...(o.scale !== undefined ? { scale: o.scale } : {}), ...(o.flipX ? { flipX: true } : {}) });
  const extra = { ...(o.depthPlane ? { depthPlane: o.depthPlane } : {}) };
  const name = o.name ?? m.name;
  switch (m.kind) {
    case 'chr': {
      const look = (m.data as { defaultLook?: string }).defaultLook;
      return [{ name: 'instance.add', params: { scene: sceneId, kind: 'character', asset: ref, name, transform: transform(height * 0.92), ...extra, character: { ...(look ? { look } : {}), view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }];
    }
    case 'prop':
      return [{ name: 'instance.add', params: { scene: sceneId, kind: 'prop', asset: ref, name, transform: transform(height * 0.8), ...extra } }];
    case 'img':
      return [{ name: 'instance.add', params: { scene: sceneId, kind: 'image', asset: ref, name, transform: transform(height / 2), ...extra } }];
    case 'kit': {
      const parts = Object.entries((m.data as { kit?: { parts: Record<string, { plane?: string; at?: [number, number]; order?: number; name?: string }> } }).kit?.parts ?? {}).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
      const lowest = (plane: string) => Math.min(0, ...scene.instances.filter((i) => i.depthPlane === plane).map((i) => i.order));
      return parts.map(([part, p]) => ({ name: 'instance.add', params: { scene: sceneId, kind: 'set-piece', asset: ref, name: p.name ?? part[0]!.toUpperCase() + part.slice(1), transform: { x: p.at?.[0] ?? width / 2, y: p.at?.[1] ?? height }, depthPlane: p.plane ?? 'back', order: lowest(p.plane ?? 'back') - 100 + (p.order ?? 0), params: { part } } }));
    }
    default:
      throw new FrameError('USAGE', `${ref} (${m.kind}) is not placed on the stage`, undefined, m.kind === 'set' ? 'Apply a set with `frame set apply`.' : 'Characters, props, images and kits are placed; timed items are added with `act add`, `face add`, `fx add` or `sound add`.');
  }
}

export interface ClipOptions {
  /** Start in seconds. */
  at: number;
  /** Duration in seconds (default: 2 s; loops and atmosphere run to the scene end). */
  dur?: number;
  /** Character instance for actions and expressions. */
  who?: string;
  /** Object an effect attaches to. */
  attach?: string;
  gainDb?: number;
  /** Seconds of the sound's own length, for one-shot sounds without --dur. */
  soundS?: number;
}

/** A timed library item as a clip: actions (acting), expressions (face), effects and atmosphere (effect), sounds, camera moves. */
export function clipCommand(state: ProjectState, sceneId: string, ref: string, m: AssetManifest, o: ClipOptions): Command {
  const scene = state.scenes[sceneId];
  if (!scene) throw new FrameError('NOT_FOUND', `Scene ${sceneId} not found`);
  const start = Math.max(0, Math.round(o.at * S));
  if (start >= scene.duration) throw new FrameError('VALIDATION_FAILED', `The start is outside the scene (0 to ${(scene.duration / S).toFixed(2)} s)`);
  const end = (len: number) => Math.min(scene.duration, start + Math.max(1, Math.round(len)));
  const sceneTrack = (kind: Parameters<typeof trackFor>[2]) => {
    const t = scene.tracks.find((x) => x.owner === 'scene' && x.kind === kind);
    if (!t) throw new FrameError('VALIDATION_FAILED', `The scene has no ${kind} track`);
    return t.id;
  };
  const dur = o.dur !== undefined ? o.dur * S : undefined;
  switch (m.kind) {
    case 'act':
    case 'overlay':
    case 'exp': {
      if (!o.who) throw new FrameError('USAGE', `Say which character performs ${m.name} (--who)`);
      const inst = scene.instances.find((i) => i.id === o.who || i.name === o.who);
      if (!inst?.character) throw new FrameError('NOT_FOUND', `Character ${o.who} not found in the scene`);
      const lane = m.kind === 'act' ? 'acting' : 'face';
      const track = trackFor(scene, inst.id, lane);
      if (!track) throw new FrameError('VALIDATION_FAILED', `${inst.name} has no ${lane} track`);
      return { name: 'clip.add', params: { scene: sceneId, track: track.id, start, end: end(dur ?? 2 * S), asset: ref, blendIn: 4800, blendOut: 4800 } };
    }
    case 'atmo':
    case 'fx': {
      const atmo = m.kind === 'atmo';
      return { name: 'clip.add', params: { scene: sceneId, track: sceneTrack('effect'), start, end: end(dur ?? (atmo ? scene.duration - start : 2 * S)), asset: ref, blendIn: atmo ? 24000 : 0, blendOut: atmo ? 24000 : 0, params: !atmo && o.attach ? { attach: o.attach } : {} } };
    }
    case 'music':
    case 'amb':
    case 'sfx':
    case 'cue': {
      const kind = m.kind === 'music' ? 'music' : m.kind === 'amb' ? 'ambience' : 'sfx';
      const loops = (m.data as { sound?: { loop?: boolean } }).sound?.loop ?? kind !== 'sfx';
      const own = o.soundS ?? (m.data as { sound?: { media?: { durationS?: number } } }).sound?.media?.durationS ?? 1;
      return { name: 'clip.add', params: { scene: sceneId, track: sceneTrack(kind), start, end: end(dur ?? (loops ? scene.duration - start : own * S)), asset: ref, ...(o.gainDb !== undefined ? { params: { gainDb: o.gainDb } } : {}) } };
    }
    case 'cam':
      if (!(m.data as { move?: unknown }).move) throw new FrameError('USAGE', `${m.name} is a framing or shot recipe, not a camera move`, undefined, 'Use `frame camera frame` or `frame recipe apply`.');
      return { name: 'clip.add', params: { scene: sceneId, track: sceneTrack('camera-move'), start, end: end(dur ?? 2 * S), asset: ref } };
    default:
      throw new FrameError('USAGE', `${ref} (${m.kind}) is not a timed item`);
  }
}

/** A gaze clip: the character looks at another object, or at a stage point, for a while (FR-ACT-05). */
export function lookAtCommand(state: ProjectState, sceneId: string, who: string, target: string | { x: number; y: number }, at: number, dur: number): Command {
  const scene = state.scenes[sceneId];
  if (!scene) throw new FrameError('NOT_FOUND', `Scene ${sceneId} not found`);
  const inst = scene.instances.find((i) => i.id === who || i.name === who);
  if (!inst?.character) throw new FrameError('NOT_FOUND', `Character ${who} not found in the scene`);
  let tgt = target;
  if (typeof target === 'string') {
    const t = scene.instances.find((i) => i.id === target || i.name === target);
    if (!t) throw new FrameError('NOT_FOUND', `Object ${target} not found in the scene`);
    tgt = t.id;
  }
  const track = trackFor(scene, inst.id, 'gaze');
  if (!track) throw new FrameError('VALIDATION_FAILED', `${inst.name} has no gaze track`);
  const start = Math.round(at * S);
  return { name: 'clip.add', params: { scene: sceneId, track: track.id, start, end: Math.min(scene.duration, start + Math.round(dur * S)), params: { target: tgt }, blendIn: 4800, blendOut: 4800 } };
}

/** A shot: cut to a camera for a time range (FR-CAM-04). */
export function shotCommand(state: ProjectState, sceneId: string, camera: string, at: number, dur: number | undefined, transition?: string): Command {
  const scene = state.scenes[sceneId];
  if (!scene) throw new FrameError('NOT_FOUND', `Scene ${sceneId} not found`);
  const cam = scene.cameras.find((c) => c.id === camera || c.name === camera);
  if (!cam) throw new FrameError('NOT_FOUND', `Camera ${camera} not found`, { cameras: scene.cameras.map((c) => `${c.id} ${c.name}`) });
  const track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'shot');
  if (!track) throw new FrameError('VALIDATION_FAILED', 'The scene has no shot track');
  const start = Math.round(at * S);
  const end = dur !== undefined ? Math.min(scene.duration, start + Math.round(dur * S)) : scene.duration;
  return { name: 'clip.add', params: { scene: sceneId, track: track.id, start, end, params: { camera: cam.id, ...(transition ? { transition } : {}) } } };
}

/** Instance by id or name. */
export function findInstance(state: ProjectState, sceneId: string, idOrName: string) {
  const scene = state.scenes[sceneId];
  if (!scene) throw new FrameError('NOT_FOUND', `Scene ${sceneId} not found`);
  const inst = scene.instances.find((i) => i.id === idOrName) ?? scene.instances.find((i) => i.name === idOrName);
  if (!inst) throw new FrameError('NOT_FOUND', `${idOrName} is not in scene ${scene.name}`, { instances: scene.instances.map((i) => `${i.id} ${i.name}`) });
  return inst;
}
