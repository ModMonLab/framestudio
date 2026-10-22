import type { Draft } from 'immer';
import type { Camera, Clip, Episode, Instance, Scene, Track } from '@frame/schema';
import { fail } from './command.js';
import type { ProjectState } from './state.js';

type S = ProjectState | Draft<ProjectState>;

export function sceneOf<T extends S>(state: T, id: string): T extends Draft<ProjectState> ? Draft<Scene> : Scene {
  const s = state.scenes[id];
  if (!s) fail('NOT_FOUND', `Scene ${id} not found`, { scene: id });
  return s as never;
}

export function episodeOf<T extends S>(state: T, id: string): T extends Draft<ProjectState> ? Draft<Episode> : Episode {
  const e = state.episodes[id];
  if (!e) fail('NOT_FOUND', `Episode ${id} not found`, { episode: id });
  return e as never;
}

export function instanceOf(scene: Scene | Draft<Scene>, id: string): Instance {
  const i = scene.instances.find((x) => x.id === id);
  if (!i) fail('NOT_FOUND', `Instance ${id} not found in scene ${scene.id}`, { instance: id });
  return i as Instance;
}

export function clipOf(scene: Scene | Draft<Scene>, id: string): Clip {
  const c = scene.clips.find((x) => x.id === id);
  if (!c) fail('NOT_FOUND', `Clip ${id} not found in scene ${scene.id}`, { clip: id });
  return c as Clip;
}

export function trackOf(scene: Scene | Draft<Scene>, id: string): Track {
  const t = scene.tracks.find((x) => x.id === id);
  if (!t) fail('NOT_FOUND', `Track ${id} not found in scene ${scene.id}`, { track: id });
  return t as Track;
}

export function cameraOf(scene: Scene | Draft<Scene>, id: string): Camera {
  const c = scene.cameras.find((x) => x.id === id);
  if (!c) fail('NOT_FOUND', `Camera ${id} not found in scene ${scene.id}`, { camera: id });
  return c as Camera;
}

export function trackFor(scene: Scene | Draft<Scene>, owner: string, kind: Track['kind']): Track | undefined {
  return scene.tracks.find((t) => t.owner === owner && t.kind === kind) as Track | undefined;
}

/** Finds which scene contains a clip id (lines are addressed by clip id). */
export function sceneOfClip(state: S, clipId: string): Scene | undefined {
  for (const s of Object.values(state.scenes)) if (s.clips.some((c) => c.id === clipId)) return s as Scene;
  return undefined;
}

export function displayName(scene: Scene, instanceId: string): string {
  return scene.instances.find((i) => i.id === instanceId)?.name ?? instanceId;
}

export function moveInArray<T>(arr: T[], from: number, to: number): void {
  const [x] = arr.splice(from, 1);
  arr.splice(Math.max(0, Math.min(arr.length, to)), 0, x as T);
}
