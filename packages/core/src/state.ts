import type { AssetManifest, Episode, Locks, Project, Scene, Take } from '@frame/schema';

/** The complete in-memory project model; every file in the project folder maps to one entry. */
export interface ProjectState {
  project: Project;
  episodes: Record<string, Episode>;
  /** Scene id → episode id that contains it. */
  sceneEpisode: Record<string, string>;
  scenes: Record<string, Scene>;
  takes: Record<string, Take>;
  /** Project-local assets keyed by `id@version`. */
  assets: Record<string, AssetManifest>;
  locks: Locks;
}

export function findScene(state: ProjectState, sceneId: string): Scene | undefined {
  return state.scenes[sceneId];
}

export function allScenesInOrder(state: ProjectState): Scene[] {
  const out: Scene[] = [];
  for (const ep of state.project.episodes) {
    const e = state.episodes[ep];
    if (!e) continue;
    for (const s of e.scenes) {
      const sc = state.scenes[s];
      if (sc) out.push(sc);
    }
  }
  return out;
}
