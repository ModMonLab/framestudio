import { ProjectSession, createProjectState, randomId, type ApplyResult, type IdSource, type NewProjectOptions, type ProjectState } from '@frame/core';
import { FrameError } from '@frame/schema';
import { ProjectStore, type LoadOptions, type LoadResult } from './store.js';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export interface SaveState {
  status: SaveStatus;
  revision: number;
  savedRevision: number;
  error?: string;
}

/**
 * An open project: engine session + store + durable journaling and debounced autosave (FR-PER-01, FR-PER-04).
 * Every committed command is journaled synchronously (fsync) before the call returns, so no committed command is lost;
 * entity files are written within `debounceMs`.
 */
export class OpenProject {
  readonly session: ProjectSession;
  readonly store: ProjectStore;
  readonly load: LoadResult | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending = new Set<string>();
  private _save: SaveState;
  private statusListeners = new Set<(s: SaveState) => void>();
  private debounceMs: number;

  constructor(store: ProjectStore, session: ProjectSession, opts: { debounceMs?: number; load?: LoadResult } = {}) {
    this.store = store;
    this.session = session;
    this.load = opts.load;
    this.debounceMs = opts.debounceMs ?? 400;
    this._save = { status: 'saved', revision: session.revision, savedRevision: session.revision };
    session.onChange((r) => this.onCommit(r));
  }

  static create(dir: string, opts: Omit<NewProjectOptions, 'now'> & { now?: string; newId?: IdSource; debounceMs?: number }): OpenProject {
    const newId = opts.newId ?? randomId;
    const now = opts.now ?? new Date().toISOString();
    const state = createProjectState(newId, { ...opts, now });
    const store = ProjectStore.create(dir, state);
    return new OpenProject(store, new ProjectSession(state, 0, { newId }), { debounceMs: opts.debounceMs });
  }

  static open(dir: string, opts: LoadOptions & { newId?: IdSource; debounceMs?: number; now?: () => string } = {}): OpenProject {
    const store = new ProjectStore(dir);
    const load = store.load(opts);
    if (load.migrated.length && !opts.writeMigrations) {
      // Loaded in memory; files are not rewritten until the user confirms (FR-DAT-05).
    }
    const session = new ProjectSession(load.state, load.revision, { newId: opts.newId, now: opts.now });
    return new OpenProject(store, session, { debounceMs: opts.debounceMs, load });
  }

  get state(): ProjectState {
    return this.session.state;
  }

  get saveState(): SaveState {
    return this._save;
  }

  onSaveState(fn: (s: SaveState) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private setSave(s: Partial<SaveState>) {
    this._save = { ...this._save, ...s };
    for (const fn of this.statusListeners) fn(this._save);
  }

  private onCommit(r: ApplyResult) {
    try {
      const last = this.session.log.at(-1);
      this.store.journal(r.state, { revision: r.revision, at: last?.at ?? new Date().toISOString(), label: r.label, source: last?.source ?? 'user', commands: r.commands }, r.changed);
    } catch (e) {
      // The journal could not be written (e.g. disk full): keep work in memory and report (AC-16).
      this.setSave({ status: 'error', revision: r.revision, error: (e as Error).message });
      for (const k of this.store.expandChanged(r.changed)) this.pending.add(k);
      return;
    }
    for (const k of this.store.expandChanged(r.changed)) this.pending.add(k);
    this.setSave({ status: 'unsaved', revision: r.revision, error: undefined });
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  /** Writes pending changes now. Returns false (status "error") if the write failed; call again to retry. */
  flush(): boolean {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.size === 0 && this._save.status !== 'error') return true;
    this.setSave({ status: 'saving' });
    const keys = [...this.pending];
    try {
      this.store.save(this.session.state, this.session.revision, keys.includes('*') ? ['*'] : keys);
      this.pending.clear();
      this.setSave({ status: 'saved', savedRevision: this.session.revision, error: undefined });
      return true;
    } catch (e) {
      this.setSave({ status: 'error', error: (e as Error).message });
      return false;
    }
  }

  close(): void {
    if (!this.flush()) throw new FrameError('IO_ERROR', `Could not save the project: ${this._save.error}`);
  }
}
