import {
  CURRENT_SCHEMA_VERSION, type Camera, type DepthPlane, type Episode, type FrameRate, type Instance, type OutputSettings,
  type Project, type Scene, type StyleFamily, type Track, type TrackKind,
} from '@frame/schema';
import type { IdSource } from './ids.js';
import type { ProjectState } from './state.js';
import { secondsToTicks } from './time.js';

/** Generic depth planes (back to front). Content kits may supply their own. */
export const defaultDepthPlanes: DepthPlane[] = [
  { id: 'far', name: 'Far', order: 0, parallax: 0.2 },
  { id: 'back', name: 'Back', order: 1, parallax: 0.6 },
  { id: 'ground', name: 'Ground', order: 2, parallax: 1 },
  { id: 'mid', name: 'Mid', order: 3, parallax: 1 },
  { id: 'front', name: 'Front', order: 4, parallax: 1.3 },
  { id: 'screen', name: 'Screen', order: 5, parallax: 0 },
];

export const sceneTrackKinds: TrackKind[] = ['shot', 'camera-move', 'effect', 'text', 'music', 'ambience', 'sfx'];
export const characterTrackKinds: TrackKind[] = ['dialogue', 'lipsync', 'acting', 'face', 'gaze'];

const trackNames: Record<TrackKind, string> = {
  shot: 'Shots', 'camera-move': 'Moves', dialogue: 'Dialogue', lipsync: 'Lip sync', acting: 'Acting', face: 'Face',
  gaze: 'Gaze', effect: 'Effects', music: 'Music', ambience: 'Ambience', sfx: 'Sound FX', text: 'Text',
};

export function makeTrack(newId: IdSource, kind: TrackKind, owner: string): Track {
  return { id: newId('trk'), kind, owner: owner as Track['owner'], name: trackNames[kind], mute: false, solo: false, lock: false, hidden: false, gainDb: 0 };
}

export interface NewProjectOptions {
  name: string;
  styleFamily: StyleFamily;
  frameRate: FrameRate;
  output: OutputSettings;
  description?: string;
  appVersion: string;
  now: string;
  seed?: number;
  /** Default caption style asset (library defaults). */
  captionStyle?: string;
}

export function makeCamera(newId: IdSource, name: string, stageW: number, stageH: number): Camera {
  return {
    id: newId('cam'), name, center: { x: stageW / 2, y: stageH / 2 }, width: stageW, rotation: 0, lens: '35mm',
    subjects: [], ratioRule: 'headroom', ratioOverrides: {},
  };
}

export function makeScene(newId: IdSource, opts: { id?: string; name: string; durationS?: number; seed: number; width?: number; height?: number }): Scene {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const cam = makeCamera(newId, 'Wide', width, height);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: (opts.id ?? newId('scn')) as Scene['id'],
    name: opts.name,
    notes: '',
    duration: secondsToTicks(opts.durationS ?? 10),
    seed: opts.seed,
    stage: { width, height, groundLines: [{ id: newId('gl') as never, name: 'Floor', y: height * 0.92, depthPlane: 'mid', scale: 1 }], marks: [], depthPlanes: defaultDepthPlanes.map((d) => ({ ...d })) },
    instances: [],
    cameras: [cam],
    defaultCamera: cam.id,
    tracks: sceneTrackKinds.map((k) => makeTrack(newId, k, 'scene')),
    clips: [],
    markers: [],
    audio: { duckingDb: -12, duckAttack: 0.15, duckRelease: 0.4, roomTone: false },
  };
}

export function makeEpisode(newId: IdSource, name: string, id?: string): Episode {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, id: (id ?? newId('ep')) as Episode['id'], name, notes: '', scenes: [], sceneTransitions: {} };
}

/** A new empty project with one episode and one scene, immediately playable (P2). */
export function createProjectState(newId: IdSource, opts: NewProjectOptions): ProjectState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const ep = makeEpisode(newId, 'Episode 1');
  const scene = makeScene(newId, { name: 'Scene 1', seed: (seed + 1) >>> 0 });
  ep.scenes.push(scene.id);
  const project: Project = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId('prj') as Project['id'],
    name: opts.name,
    description: opts.description ?? '',
    styleFamily: opts.styleFamily,
    frameRate: opts.frameRate,
    output: opts.output,
    captions: { enabled: true, speakerLabels: false, burnIn: true, ...(opts.captionStyle ? { style: opts.captionStyle } : {}) },
    episodes: [ep.id],
    cast: [],
    permissions: { agent: { deleteProjects: false, deleteVoices: false, cloneVoices: false, exposeWorker: false } },
    seed,
    createdAt: opts.now,
    appVersion: opts.appVersion,
  };
  return {
    project,
    episodes: { [ep.id]: ep },
    sceneEpisode: { [scene.id]: ep.id },
    scenes: { [scene.id]: scene },
    takes: {},
    assets: {},
    locks: { schemaVersion: CURRENT_SCHEMA_VERSION, assets: {} },
  };
}

export function defaultInstance(partial: Pick<Instance, 'id' | 'kind' | 'name'> & Partial<Instance>): Instance {
  return {
    transform: { x: 960, y: 1000, scale: 1, rotation: 0, flipX: false },
    depthPlane: 'mid',
    order: 0,
    parallax: 1,
    opacity: 1,
    visible: true,
    locked: false,
    params: {},
    ...partial,
  };
}
