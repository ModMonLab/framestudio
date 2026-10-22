/**
 * Version comparison (FR-PER-03): a summary of what differs between two project states — scenes added, removed or
 * changed (with clip and instance counts), and assets added or removed.
 */
import type { Scene } from '@frame/schema';
import type { ProjectState } from './state.js';

export interface SceneChange {
  id: string;
  name: string;
  change: 'added' | 'removed' | 'changed';
  clips?: { added: number; removed: number; changed: number };
  instances?: { added: number; removed: number; changed: number };
  /** Instances whose asset version changed (e.g. a character updated to a new version). */
  versions?: { instance: string; from: string; to: string }[];
}

export interface StateComparison {
  project: string[];
  scenes: SceneChange[];
  assets: { added: string[]; removed: string[] };
  takes: { added: number; removed: number };
  identical: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function countById<T extends { id: string }>(a: T[], b: T[]) {
  const am = new Map(a.map((x) => [x.id, x]));
  const bm = new Map(b.map((x) => [x.id, x]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [id, x] of bm) {
    const y = am.get(id);
    if (!y) added++;
    else if (!same(x, y)) changed++;
  }
  for (const id of am.keys()) if (!bm.has(id)) removed++;
  return { added, removed, changed };
}

/** Compares `from` (e.g. a saved version) with `to` (e.g. the current project). */
export function compareStates(from: ProjectState, to: ProjectState): StateComparison {
  const project: string[] = [];
  for (const k of Object.keys({ ...from.project, ...to.project }) as (keyof typeof from.project)[]) {
    if (k !== 'episodes' && !same(from.project[k], to.project[k])) project.push(k);
  }
  if (!same(from.project.episodes, to.project.episodes)) project.push('episodes');
  const scenes: SceneChange[] = [];
  const ids = new Set([...Object.keys(from.scenes), ...Object.keys(to.scenes)]);
  for (const id of ids) {
    const a: Scene | undefined = from.scenes[id];
    const b: Scene | undefined = to.scenes[id];
    if (!a) scenes.push({ id, name: b!.name, change: 'added' });
    else if (!b) scenes.push({ id, name: a.name, change: 'removed' });
    else if (!same(a, b)) {
      const versions: SceneChange['versions'] = [];
      for (const i of b.instances) {
        const old = a.instances.find((x) => x.id === i.id);
        if (old?.asset && i.asset && old.asset !== i.asset) versions.push({ instance: i.name, from: old.asset, to: i.asset });
      }
      scenes.push({ id, name: b.name, change: 'changed', clips: countById(a.clips, b.clips), instances: countById(a.instances, b.instances), ...(versions.length ? { versions } : {}) });
    }
  }
  const fa = new Set(Object.keys(from.assets));
  const ta = new Set(Object.keys(to.assets));
  const assets = { added: [...ta].filter((r) => !fa.has(r)).sort(), removed: [...fa].filter((r) => !ta.has(r)).sort() };
  const takes = { added: Object.keys(to.takes).filter((t) => !from.takes[t]).length, removed: Object.keys(from.takes).filter((t) => !to.takes[t]).length };
  const identical = !project.length && !scenes.length && !assets.added.length && !assets.removed.length && !takes.added && !takes.removed;
  return { project, scenes, assets, takes, identical };
}
