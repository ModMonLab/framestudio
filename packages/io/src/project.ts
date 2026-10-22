import fs from 'node:fs';
import path from 'node:path';
import { ProjectSession, createProjectState, type HistoryStep, randomId, type ApplyResult, type IdSource, type NewProjectOptions, type ProjectState } from '@frame/core';
import { FrameError } from '@frame/schema';
import { ProjectStore, type LoadOptions, type LoadResult } from './store.js';
import { writeJsonAtomic } from './fsutil.js';

/** Undo steps kept on disk between sessions. */
const UNDO_KEPT = 200;
const UNDO_FILE = 'history/undo.json';

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
  /** Files changed on disk by another program while local changes were unsaved: saving waits for a choice (FR-PER-05). */
  private held: string[] | undefined;
  /** Computes the project's locks at save time (FR-DAT-06); without it locks are kept as loaded. */
  locksFor?: (state: ProjectState) => ProjectState['locks'];

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
    // Undo survives closing and reopening when nothing changed in between (FR-PER-02; `frame undo` in local mode).
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(store.root, UNDO_FILE), 'utf8')) as { revision: number; undo: HistoryStep[]; redo: HistoryStep[] };
      if (saved.revision === load.revision && !opts.skipJournal) session.restoreStacks(saved);
    } catch {
      /* no saved undo history */
    }
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
    if (this.held) {
      this.setSave({ status: 'error', error: `Changed on disk by another program (${this.held.join(', ')}); choose which version to keep` });
      return false;
    }
    this.setSave({ status: 'saving' });
    if (this.locksFor) {
      try {
        const locks = this.locksFor(this.session.state);
        if (JSON.stringify(locks) !== JSON.stringify(this.session.state.locks)) {
          this.session.setLocks(locks);
          this.pending.add('locks');
        }
      } catch {
        // Locks are derived; a failure to compute them never blocks saving the user's work.
      }
    }
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

  /** Autosave delay after the last change (FR-PER-01, FR-SET-01 autosave interval). */
  setDebounce(ms: number): void {
    this.debounceMs = Math.max(0, ms);
  }

  /** Project-relative files holding unsaved local changes. */
  pendingFiles(): string[] {
    if (this.pending.has('*')) return ['*'];
    return [...this.pending].map((k) => this.store.entityPath(this.session.state, k)).filter((f): f is string => !!f);
  }

  /** Stops autosave until the external change is resolved (FR-PER-05). */
  hold(files: string[]): void {
    this.held = files;
  }

  get heldFiles(): string[] | undefined {
    return this.held;
  }

  /**
   * Resolves an external change: `disk` loads the files on disk (local unsaved changes are dropped and the undo
   * history restarts, as for any reload); `mine` writes the open state over them.
   */
  resolveExternal(keep: 'disk' | 'mine', load: () => ProjectState): void {
    this.held = undefined;
    if (keep === 'disk') {
      this.pending.clear();
      this.session.replaceState(load(), 'Load changes made on disk');
      // Rewrite every file so the store's record of what is on disk matches again.
      this.pending.add('*');
      this.flush();
      return;
    }
    this.pending.add('*');
    this.flush();
  }

  close(): void {
    if (!this.flush()) throw new FrameError('IO_ERROR', `Could not save the project: ${this._save.error}`);
    try {
      const { undo, redo } = this.session.stacks(UNDO_KEPT);
      const file = path.join(this.store.root, UNDO_FILE);
      if (undo.length || redo.length) writeJsonAtomic(file, { revision: this.session.revision, undo, redo });
      else fs.rmSync(file, { force: true });
    } catch {
      /* undo history is a convenience; the project itself is saved */
    }
  }
}
