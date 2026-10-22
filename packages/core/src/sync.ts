/**
 * Entity deltas: the unit of persistence (journal) and live updates (FR-ARC-03, FR-PER-04). A delta maps entity keys
 * ("project", "locks", "episodes/<id>", "scenes/<id>", "sceneEpisode/<id>", "takes/<id>", "assets/<ref>") to their
 * new value, or null when removed.
 */
import type { ProjectState } from './state.js';

export type EntityDelta = Record<string, unknown>;

export function entityValue(state: ProjectState, key: string): unknown {
  const [kind, ...rest] = key.split('/');
  const id = rest.join('/');
  switch (kind) {
    case 'project':
      return state.project;
    case 'locks':
      return state.locks;
    case 'episodes':
      return state.episodes[id] ?? null;
    case 'scenes':
      return state.scenes[id] ?? null;
    case 'sceneEpisode':
      return state.sceneEpisode[id] ?? null;
    case 'takes':
      return state.takes[id] ?? null;
    case 'assets':
      return state.assets[id] ?? null;
    default:
      return null;
  }
}

export function allEntityKeys(state: ProjectState): string[] {
  return [
    'project', 'locks',
    ...Object.keys(state.episodes).map((k) => `episodes/${k}`),
    ...Object.keys(state.scenes).map((k) => `scenes/${k}`),
    ...Object.keys(state.takes).map((k) => `takes/${k}`),
    ...Object.keys(state.assets).map((k) => `assets/${k}`),
  ];
}

/** Delta for engine change keys; '*' or a bare collection key yields every entity. */
export function entityDelta(state: ProjectState, changed: string[], previousKeys: string[] = []): EntityDelta {
  const full = changed.some((c) => c === '*' || !c.includes('/') && c !== 'project' && c !== 'locks');
  const keys = new Set<string>();
  if (full) {
    for (const k of allEntityKeys(state)) keys.add(k);
    for (const k of previousKeys) keys.add(k);
  } else for (const c of changed) keys.add(c);
  const out: EntityDelta = {};
  for (const k of keys) {
    out[k] = entityValue(state, k);
    if (k.startsWith('scenes/')) out[`sceneEpisode/${k.slice(7)}`] = state.sceneEpisode[k.slice(7)] ?? null;
    if (k.startsWith('sceneEpisode/')) out[`scenes/${k.slice(13)}`] = state.scenes[k.slice(13)] ?? null;
  }
  return out;
}

/** Applies a delta in place (used on a mutable copy, e.g. while loading). */
export function applyDeltaInPlace(state: ProjectState, delta: EntityDelta): void {
  for (const [key, value] of Object.entries(delta)) {
    const [kind, ...rest] = key.split('/');
    const id = rest.join('/');
    const set = (rec: Record<string, unknown>) => {
      if (value === null || value === undefined) delete rec[id];
      else rec[id] = value;
    };
    switch (kind) {
      case 'project':
        state.project = value as ProjectState['project'];
        break;
      case 'locks':
        state.locks = value as ProjectState['locks'];
        break;
      case 'episodes':
        set(state.episodes);
        break;
      case 'scenes':
        set(state.scenes);
        break;
      case 'sceneEpisode':
        set(state.sceneEpisode);
        break;
      case 'takes':
        set(state.takes);
        break;
      case 'assets':
        set(state.assets);
        break;
    }
  }
  for (const id of Object.keys(state.sceneEpisode)) if (!state.scenes[id]) delete state.sceneEpisode[id];
}

/** Returns a new state with the delta applied; untouched entities keep their identity (cheap re-render checks). */
export function applyDelta(state: ProjectState, delta: EntityDelta): ProjectState {
  const next: ProjectState = { ...state, episodes: { ...state.episodes }, scenes: { ...state.scenes }, sceneEpisode: { ...state.sceneEpisode }, takes: { ...state.takes }, assets: { ...state.assets } };
  applyDeltaInPlace(next, delta);
  return next;
}
