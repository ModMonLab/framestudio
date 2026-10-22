/**
 * Production templates (FR-TPL-01..03, Catalog P1): a template is data describing a complete scene — set, cast roles,
 * props, sample performances, cameras and shots, audio, text and output hints. Applying it creates an ordinary scene
 * the user can direct; cast roles are filled with any characters (Replace cast keeps every clip, gaze and shot, which
 * belong to the instance, not to the character asset). A scene can be saved back as a template.
 * Pure: commands only; camera framing and seating are computed by the caller once instances exist.
 */
import type { Command, Posture, TrackKind, View } from '@frame/schema';
import type { ProjectState } from './state.js';
import { randomId } from './ids.js';
import { TICKS_PER_SECOND } from './time.js';

export interface TemplateRole { key: string; label: string; kind: 'character'; default: string; look?: string }

export interface TemplateInstance {
  key: string;
  kind: 'character' | 'prop' | 'image';
  /** Asset ref, or `$role` for a cast role. */
  asset: string;
  name?: string;
  x: number;
  y: number;
  scale?: number;
  flipX?: boolean;
  plane?: string;
  view?: View;
  posture?: Posture;
  propState?: string;
  look?: string;
  /** Seat the character on this prop instance (key) after placing it. */
  seat?: string;
}

export interface TemplateCamera {
  key: string;
  name: string;
  /** Framing preset on subjects (instance keys), or a fixed centre and width. */
  framing?: string;
  subjects?: string[];
  center?: { x: number; y: number };
  width?: number;
  lens?: '24mm' | '35mm' | '50mm' | '85mm';
}

export interface TemplateClip {
  /** Instance key or 'scene'. */
  owner: string;
  track: TrackKind;
  asset?: string;
  at: number;
  dur: number;
  /** Strings `$key` become the instance id of that key. */
  params?: Record<string, unknown>;
  blendIn?: number;
  blendOut?: number;
}

export type TemplateScene = TemplateData['scene'];

export interface TemplateData {
  roles: TemplateRole[];
  /** Further scenes of a project template (FR-TPL-02), after `scene`; cast roles are shared across scenes. */
  scenes?: TemplateScene[];
  scene: {
    name: string;
    durationS: number;
    kit?: string;
    /** Suggested script for the user to turn into lines (templates ship without takes, so they export on first open). */
    notes?: string;
    instances: TemplateInstance[];
    cameras: TemplateCamera[];
    shots: { camera: string; at: number; dur: number; transition?: string }[];
    clips: TemplateClip[];
  };
  /** Project settings worth applying when the template starts a project. */
  captionStyle?: string;
  aspectRatios?: string[];
}

export interface TemplatePlan {
  /** Commands that create the scene, set, cast, props and clips. */
  commands: Command[];
  sceneId: string;
  /** Instance key → id (for framing cameras and seating once the scene exists). */
  ids: Record<string, string>;
  cameras: TemplateCamera[];
  shots: TemplateData['scene']['shots'];
  seats: { instance: string; prop: string }[];
}

const S = TICKS_PER_SECOND;

/** Plans the scene for a template. `cast` maps role keys to character refs (defaults from the template). */
export function planTemplate(state: ProjectState, episodeId: string, data: TemplateData, o: { scene?: TemplateScene; cast?: Record<string, string>; looks?: Record<string, string>; kitParts?: (ref: string) => Record<string, { plane?: string; at?: [number, number]; order?: number; name?: string }> | undefined; assetName?: (ref: string) => string | undefined; sceneName?: string }): TemplatePlan {
  if (!state.episodes[episodeId]) throw new Error(`Episode ${episodeId} not found`);
  const sceneId = randomId('scn');
  const sc = o.scene ?? data.scene;
  const cmds: Command[] = [{ name: 'scene.add', params: { episode: episodeId, id: sceneId, name: o.sceneName ?? sc.name, durationS: sc.durationS, ...(sc.kit ? { kit: sc.kit } : {}) } }];
  if (sc.notes) cmds.push({ name: 'scene.setNotes', params: { id: sceneId, notes: sc.notes } });
  // The set: every kit part on its plane in the kit's order.
  const parts = sc.kit ? o.kitParts?.(sc.kit) : undefined;
  if (sc.kit && parts) {
    for (const [part, p] of Object.entries(parts).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))) {
      cmds.push({ name: 'instance.add', params: { scene: sceneId, id: randomId('ins'), kind: 'set-piece', asset: sc.kit, name: p.name ?? part, transform: { x: p.at?.[0] ?? 960, y: p.at?.[1] ?? 1080 }, depthPlane: p.plane ?? 'back', order: (p.order ?? 0) - 100, params: { part } } });
    }
  }
  const ids: Record<string, string> = {};
  for (const inst of sc.instances) ids[inst.key] = randomId('ins');
  const roleOf = (a: string) => (a.startsWith('$') ? data.roles.find((r) => r.key === a.slice(1)) : undefined);
  for (const inst of sc.instances) {
    const role = roleOf(inst.asset);
    const asset = role ? o.cast?.[role.key] ?? role.default : inst.asset;
    const transform = { x: inst.x, y: inst.y, ...(inst.scale ? { scale: inst.scale } : {}), ...(inst.flipX ? { flipX: true } : {}) };
    if (inst.kind === 'character') {
      const look = (role && o.looks?.[role.key]) ?? inst.look ?? role?.look ?? 'default';
      cmds.push({ name: 'instance.add', params: { scene: sceneId, id: ids[inst.key], kind: 'character', asset, name: inst.name ?? role?.label ?? inst.key, transform, ...(inst.plane ? { depthPlane: inst.plane } : {}), character: { look, view: inst.view ?? 'three', posture: inst.posture ?? 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: true } } } });
    } else {
      cmds.push({ name: 'instance.add', params: { scene: sceneId, id: ids[inst.key], kind: inst.kind, asset, name: inst.name ?? o.assetName?.(asset) ?? inst.key, transform, ...(inst.plane ? { depthPlane: inst.plane } : {}), ...(inst.propState ? { propState: inst.propState } : {}) } });
    }
  }
  const sub = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith('$') && ids[v.slice(1)]) return ids[v.slice(1)];
    if (Array.isArray(v)) return v.map(sub);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]));
    return v;
  };
  // Clips need track ids, which exist only once the instances are added: they are resolved by `trackRef`.
  for (const c of sc.clips) {
    cmds.push({ name: 'clip.add', params: { scene: sceneId, track: trackRef(c.owner === 'scene' ? 'scene' : ids[c.owner]!, c.track), start: Math.round(c.at * S), end: Math.round((c.at + c.dur) * S), ...(c.asset ? { asset: c.asset } : {}), params: sub(c.params ?? {}) as Record<string, unknown>, ...(c.blendIn !== undefined ? { blendIn: Math.round(c.blendIn * S) } : {}), ...(c.blendOut !== undefined ? { blendOut: Math.round(c.blendOut * S) } : {}), recipe: 'template' } });
  }
  const seats = sc.instances.filter((i) => i.seat && ids[i.seat]).map((i) => ({ instance: ids[i.key]!, prop: ids[i.seat!]! }));
  return { commands: cmds, sceneId, ids, cameras: sc.cameras, shots: sc.shots, seats };
}

/** Placeholder for a track not yet created: `@track:<owner>:<kind>`; resolve with `resolveTrackRefs` against a state. */
export const trackRef = (owner: string, kind: TrackKind) => `@track:${owner}:${kind}`;

/** Replaces track placeholders in commands with real track ids from a state that has the instances. */
export function resolveTrackRefs(state: ProjectState, sceneId: string, cmds: Command[]): Command[] {
  const scene = state.scenes[sceneId];
  return cmds.map((c) => {
    const t = c.params.track;
    if (typeof t !== 'string' || !t.startsWith('@track:')) return c;
    const [, owner, kind] = t.split(':');
    const tr = scene?.tracks.find((x) => x.owner === owner && x.kind === kind);
    if (!tr) throw new Error(`No ${kind} track for ${owner}`);
    return { ...c, params: { ...c.params, track: tr.id } };
  });
}

/** A scene as a template (FR-TPL-02): characters become cast roles; ids become keys; cameras keep their presets. */
export function templateFromScene(state: ProjectState, sceneId: string): TemplateData {
  return templateFromScenes(state, [sceneId]);
}

/**
 * Scenes as one template (FR-TPL-02, a whole project or episode): the same character across scenes (same asset and
 * name) is one cast role, so replacing the cast of an applied project template recasts every scene.
 */
export function templateFromScenes(state: ProjectState, sceneIds: string[]): TemplateData {
  if (!sceneIds.length) throw new Error('No scenes to save');
  const roles: TemplateRole[] = [];
  const roleKey = new Map<string, string>();
  const scenes = sceneIds.map((id) => sceneTemplate(state, id, (i) => {
    const ident = `${i.asset}|${i.name}`;
    let key = roleKey.get(ident);
    if (!key) {
      key = `role${roles.length + 1}`;
      roleKey.set(ident, key);
      roles.push({ key, label: i.name, kind: 'character', default: i.asset!, ...(i.character ? { look: i.character.look } : {}) });
    }
    return key;
  }));
  // A project template keeps the project's caption style (FR-TPL-02).
  const captionStyle = sceneIds.length > 1 ? state.project.captions.style : undefined;
  return { roles, scene: scenes[0]!, ...(scenes.length > 1 ? { scenes: scenes.slice(1) } : {}), ...(captionStyle ? { captionStyle } : {}) };
}

function sceneTemplate(state: ProjectState, sceneId: string, roleFor: (i: ProjectState['scenes'][string]['instances'][number]) => string): TemplateScene {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const keyOf = new Map<string, string>();
  const instances: TemplateInstance[] = [];
  let n = 0;
  for (const i of scene.instances) {
    if (i.kind === 'set-piece' && scene.kit && i.asset === scene.kit) continue; // the kit brings its parts
    if (i.kind !== 'character' && i.kind !== 'prop' && i.kind !== 'image') continue;
    const key = i.kind === 'character' ? roleFor(i) : `${i.kind}${++n}`;
    keyOf.set(i.id, key);
    instances.push({
      key, kind: i.kind, asset: i.kind === 'character' ? `$${key}` : i.asset!, name: i.name, x: i.transform.x, y: i.transform.y,
      ...(i.transform.scale !== 1 ? { scale: i.transform.scale } : {}), ...(i.transform.flipX ? { flipX: true } : {}), plane: i.depthPlane,
      ...(i.character ? { view: i.character.view, posture: i.character.posture, look: i.character.look } : {}), ...(i.propState ? { propState: i.propState } : {}),
    });
  }
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string' && keyOf.has(v)) return `$${keyOf.get(v)}`;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
  const clips: TemplateClip[] = [];
  const shots: TemplateScene['shots'] = [];
  for (const c of scene.clips) {
    const tr = tracks.get(c.track);
    if (!tr || c.line) continue;
    if (tr.kind === 'shot') {
      shots.push({ camera: String(c.params.camera ?? ''), at: c.start / S, dur: (c.end - c.start) / S, ...(typeof c.params.transition === 'string' ? { transition: c.params.transition } : {}) });
      continue;
    }
    const owner = tr.owner === 'scene' ? 'scene' : keyOf.get(tr.owner);
    if (!owner || tr.kind === 'lipsync' || tr.kind === 'dialogue') continue;
    clips.push({ owner, track: tr.kind, ...(c.asset ? { asset: c.asset } : {}), at: c.start / S, dur: (c.end - c.start) / S, params: swap(c.params) as Record<string, unknown>, ...(c.blendIn ? { blendIn: c.blendIn / S } : {}), ...(c.blendOut ? { blendOut: c.blendOut / S } : {}) });
  }
  // Only the cameras the shots use (the scene's unused default camera comes with every new scene anyway).
  const used = new Set(shots.map((x) => x.camera));
  const cameras: TemplateCamera[] = scene.cameras.filter((c) => used.has(c.id)).map((c) => ({ key: c.id, name: c.name, ...(c.preset && c.subjects.length ? { framing: c.preset, subjects: c.subjects.map((s) => keyOf.get(s) ?? s) } : { center: c.center, width: c.width }), lens: c.lens }));
  // Lines become the suggested script (takes are made per project).
  const script = scene.clips.filter((c) => c.line).sort((a, b) => a.start - b.start).map((c) => `${scene.instances.find((i) => i.id === c.line!.speaker)?.name ?? 'Someone'}: ${c.line!.text}`).join('\n');
  const notes = [scene.notes, script].filter(Boolean).join('\n\n');
  return { name: scene.name, durationS: scene.duration / S, ...(scene.kit ? { kit: scene.kit } : {}), ...(notes ? { notes } : {}), instances, cameras, shots, clips };
}
