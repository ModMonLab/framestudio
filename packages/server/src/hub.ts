/**
 * Open projects (FR-ARC-01/03, FR-PER-05): one OpenProject per folder, shared by every client; each commit is
 * published as an entity delta; external edits on disk are detected and reloaded.
 */
import path from 'node:path';
import { entityDelta, allEntityKeys, type ApplyResult } from '@frame/core';
import { OpenProject, ProjectStore, type SaveState } from '@frame/io';
import { FrameError } from '@frame/schema';

export type HubEvent =
  | { type: 'change'; project: string; revision: number; label: string; source: string; delta: Record<string, unknown>; full: boolean; undo: UndoInfo }
  | { type: 'save'; project: string; save: SaveState }
  | { type: 'external'; project: string; files: string[]; reloaded: boolean; conflicts?: string[] };

export interface UndoInfo {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

export interface HubProject {
  id: string;
  root: string;
  open: OpenProject;
}

export class ProjectHub {
  private byId = new Map<string, HubProject>();
  private listeners = new Set<(e: HubEvent) => void>();
  private watchTimer?: NodeJS.Timeout;

  constructor(private readonly opts: { watchMs?: number; debounceMs?: number; onAttach?: (open: OpenProject) => void } = {}) {
    if (opts.watchMs) this.watchTimer = setInterval(() => this.checkExternal(), opts.watchMs);
  }

  onEvent(fn: (e: HubEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: HubEvent) {
    for (const fn of this.listeners) fn(e);
  }

  list(): HubProject[] {
    return [...this.byId.values()];
  }

  get(id: string): HubProject {
    const p = this.byId.get(id);
    if (!p) throw new FrameError('NOT_FOUND', `Project ${id} is not open`, undefined, 'Open it first with POST /api/projects/open.');
    return p;
  }

  /** Opens (or returns the already-open) project at a folder. */
  open(dir: string, opts: { writeMigrations?: boolean } = {}): HubProject {
    const root = path.resolve(dir);
    const existing = this.list().find((p) => p.root === root);
    if (existing) return existing;
    const open = OpenProject.open(root, { ...(this.opts.debounceMs !== undefined ? { debounceMs: this.opts.debounceMs } : {}), ...(opts.writeMigrations ? { writeMigrations: true } : {}) });
    if (open.load?.migrated.length && !opts.writeMigrations) {
      throw new FrameError('MIGRATION_REQUIRED', `${open.load.migrated.length} file(s) use an older format`, { files: open.load.migrated }, 'Open again with migrate=true to upgrade them.');
    }
    return this.attach(open);
  }

  attach(open: OpenProject): HubProject {
    this.opts.onAttach?.(open);
    const id = open.state.project.id;
    // A copied folder keeps its project id: the folder opened last wins, and the earlier one is saved and closed so
    // its changes never reach clients under the same id.
    const prior = this.byId.get(id);
    if (prior && prior.open !== open) {
      prior.open.close();
      this.byId.delete(id);
    }
    const hp: HubProject = { id, root: open.store.root, open };
    this.byId.set(id, hp);
    let keys = allEntityKeys(open.state);
    open.session.onChange((r: ApplyResult) => {
      if (r.dryRun) return;
      const full = r.changed.includes('*');
      const delta = entityDelta(r.state, r.changed, full ? keys : []);
      keys = allEntityKeys(r.state);
      const last = open.session.log.at(-1);
      const ss = open.session;
      this.emit({ type: 'change', project: id, revision: r.revision, label: r.label, source: last?.source ?? 'user', delta, full, undo: { canUndo: ss.canUndo(), canRedo: ss.canRedo(), undoLabel: ss.undoLabel() ?? null, redoLabel: ss.redoLabel() ?? null } });
    });
    open.onSaveState((s) => this.emit({ type: 'save', project: id, save: s }));
    return hp;
  }

  close(id: string): void {
    const p = this.get(id);
    p.open.close();
    this.byId.delete(id);
  }

  closeAll(): void {
    if (this.watchTimer) clearInterval(this.watchTimer);
    for (const p of this.list()) {
      try {
        p.open.close();
      } catch {
        /* reported through save state */
      }
    }
    this.byId.clear();
  }

  /** Detects edits made outside Frame and reloads when nothing is pending locally (FR-PER-05). */
  checkExternal(): void {
    for (const p of this.list()) {
      const files = p.open.store.externalChanges();
      if (!files.length) continue;
      const pending = p.open.saveState.status !== 'saved';
      if (pending) {
        // Never overwrite another program's edits silently: hold autosave and let a person choose (FR-PER-05).
        if (p.open.heldFiles?.join() === files.join()) continue;
        const mine = p.open.pendingFiles();
        const conflicts = mine.includes('*') ? files : files.filter((f) => mine.includes(f));
        p.open.hold(files);
        this.emit({ type: 'external', project: p.id, files, reloaded: false, conflicts });
        continue;
      }
      try {
        const fresh = new ProjectStore(p.root).load();
        p.open.session.replaceState(fresh.state, 'Reload external changes');
        p.open.flush();
        this.emit({ type: 'external', project: p.id, files, reloaded: true });
      } catch (e) {
        this.emit({ type: 'external', project: p.id, files: [...files, `error: ${(e as Error).message}`], reloaded: false });
      }
    }
  }
}
