/**
 * Studio state: a live mirror of the server project (entity deltas, FR-ARC-03) plus view state (selection, time,
 * playback, mode). Edits always go through server commands (FR-ARC-01); the mirror only changes from server events.
 */
import { useSyncExternalStore } from 'react';
import { applyDelta, type ProjectState } from '@frame/core';
import type { Command } from '@frame/schema';
import { api, connectEvents, type JobInfo, type SaveState, type ServerEvent, type Snapshot } from './api.js';

export type Mode = 'stage' | 'direct' | 'edit';

export interface Selection {
  kind: 'instance' | 'clip' | 'camera' | 'scene' | 'track';
  id: string;
}

export interface StudioState {
  pid: string;
  project?: ProjectState;
  revision: number;
  save: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  connected: boolean;
  scene?: string;
  selection: Selection[];
  /** Playhead in ticks. */
  time: number;
  playing: boolean;
  mode: Mode;
  family?: 'flat' | 'illustrated';
  jobs: Record<string, JobInfo>;
  lastError?: { message: string; hint?: string };
  externalNotice?: string[];
  /** Recipe being applied (opens the recipe dialog, FR-RCP-01). */
  recipe?: { ref: string; name: string };
  /** Template being applied as a new scene (FR-TPL-01), or a character being recast (FR-TPL-03). */
  template?: { ref: string; name: string };
  recast?: { instance: string };
}

type Listener = () => void;

export class Studio {
  private s: StudioState;
  private listeners = new Set<Listener>();
  private stop?: () => void;

  constructor(pid: string) {
    this.s = { pid, revision: 0, save: { status: 'saved', revision: 0, savedRevision: 0 }, canUndo: false, canRedo: false, undoLabel: null, redoLabel: null, connected: false, selection: [], time: 0, playing: false, mode: 'direct', jobs: {} };
  }

  get state(): StudioState {
    return this.s;
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.s;

  set(patch: Partial<StudioState>) {
    this.s = { ...this.s, ...patch };
    for (const fn of this.listeners) fn();
  }

  async start(): Promise<void> {
    await this.resync();
    this.stop = connectEvents(this.s.pid, (e) => this.onEvent(e), (connected) => {
      this.set({ connected });
      if (connected) void this.resync();
    });
    const jobs = await api.jobs(this.s.pid);
    this.set({ jobs: Object.fromEntries(jobs.jobs.map((j) => [j.id, j])) });
  }

  dispose() {
    this.stop?.();
  }

  private apply(snap: Snapshot) {
    const scene = this.s.scene && snap.state.scenes[this.s.scene] ? this.s.scene : firstScene(snap.state);
    this.set({ project: snap.state, revision: snap.revision, save: snap.save, canUndo: snap.canUndo, canRedo: snap.canRedo, undoLabel: snap.undoLabel, redoLabel: snap.redoLabel, scene });
  }

  async resync() {
    this.apply(await api.state(this.s.pid));
  }

  private onEvent(e: ServerEvent) {
    if (e.type === 'change' && e.project === this.s.pid && this.s.project) {
      if (e.revision !== this.s.revision + 1) {
        // Missed an event (reconnect, burst): fetch the whole state.
        void this.resync();
        return;
      }
      const project = applyDelta(this.s.project, e.delta);
      const scene = this.s.scene && project.scenes[this.s.scene] ? this.s.scene : firstScene(project);
      const selection = this.s.selection.filter((sel) => exists(project, scene, sel));
      // Undo availability and labels come from the server session (one history for every client).
      this.set({ project, revision: e.revision, scene, selection, ...e.undo });
    } else if (e.type === 'save' && e.project === this.s.pid) this.set({ save: e.save });
    else if (e.type === 'job' && (!e.job.project || e.job.project === this.s.pid)) this.set({ jobs: { ...this.s.jobs, [e.job.id]: e.job } });
    else if (e.type === 'external' && e.project === this.s.pid && !e.reloaded) this.set({ externalNotice: e.files });
  }

  /** Sends commands; errors surface as a toast-able lastError and are rethrown. */
  async exec(commands: Command[], label?: string): Promise<{ revision: number; commands: Command[] } | undefined> {
    try {
      const r = await api.apply(this.s.pid, commands, { baseRevision: this.s.revision, ...(label ? { label } : {}) });
      return r;
    } catch (e) {
      const err = e as { message: string; hint?: string; code?: string };
      if (err.code === 'REVISION_CONFLICT') {
        await this.resync();
        try {
          return await api.apply(this.s.pid, commands, { ...(label ? { label } : {}) });
        } catch (e2) {
          this.set({ lastError: { message: (e2 as Error).message } });
          return undefined;
        }
      }
      this.set({ lastError: { message: err.message, ...(err.hint ? { hint: err.hint } : {}) } });
      return undefined;
    }
  }

  async undo() {
    try {
      await api.undo(this.s.pid);
    } catch (e) {
      this.set({ lastError: { message: (e as Error).message } });
    }
  }

  async redo() {
    try {
      await api.redo(this.s.pid);
    } catch (e) {
      this.set({ lastError: { message: (e as Error).message } });
    }
  }
}

function firstScene(p: ProjectState): string | undefined {
  for (const ep of p.project.episodes) {
    const s = p.episodes[ep]?.scenes[0];
    if (s) return s;
  }
  return undefined;
}

function exists(p: ProjectState, scene: string | undefined, sel: Selection): boolean {
  const sc = scene ? p.scenes[scene] : undefined;
  if (!sc) return false;
  switch (sel.kind) {
    case 'instance':
      return sc.instances.some((i) => i.id === sel.id);
    case 'clip':
      return sc.clips.some((c) => c.id === sel.id);
    case 'camera':
      return sc.cameras.some((c) => c.id === sel.id);
    case 'track':
      return sc.tracks.some((t) => t.id === sel.id);
    default:
      return true;
  }
}

export function useStudio<T>(studio: Studio, select: (s: StudioState) => T): T {
  return useSyncExternalStore(studio.subscribe, () => select(studio.getSnapshot()));
}
