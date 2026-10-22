import { enablePatches, produceWithPatches, applyPatches, type Patch, setAutoFreeze } from 'immer';
import { FrameError, type Command, type CommandBatch } from '@frame/schema';
import { getCommand, validateParams, type CommandContext } from './command.js';
import type { ProjectState } from './state.js';
import { randomId, type IdSource } from './ids.js';

enablePatches();
setAutoFreeze(true);

export interface HistoryStep {
  revision: number;
  label: string;
  source: string;
  commands: Command[];
  patches: Patch[];
  inverse: Patch[];
  touched: string[];
  at: string;
  /** Undo/redo steps refer back to the step they reverse. */
  kind: 'do' | 'undo' | 'redo';
}

export interface ApplyResult {
  revision: number;
  baseRevision: number;
  rebased: boolean;
  dryRun: boolean;
  label: string;
  commands: Command[];
  /** Top-level entity paths changed (used for persistence and live updates). */
  changed: string[];
  state: ProjectState;
  reports: unknown[];
}

export interface SessionOptions {
  newId?: IdSource;
  now?: () => string;
  /** Minimum number of undo steps kept (FR-PER-02 requires ≥ 200). */
  undoLimit?: number;
}

/** Converts immer patch paths into changed entity keys, e.g. "scenes/scn_x", "project". */
export function changedKeys(patches: Patch[]): string[] {
  const keys = new Set<string>();
  for (const p of patches) {
    const [root, id] = p.path as (string | number)[];
    if (root === undefined) keys.add('*');
    else if (root === 'project' || root === 'locks') keys.add(String(root));
    else if (id !== undefined) keys.add(`${String(root)}/${String(id)}`);
    else keys.add(String(root));
  }
  return [...keys];
}

/** Hierarchical keys overlap when equal or when one contains the other ("scenes/scn_a" ⊃ "scenes/scn_a/clips/clp_b"). */
export function keysOverlap(a: string, b: string): boolean {
  return a === '*' || b === '*' || a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

/**
 * A project editing session: the single place where state changes (FR-ARC-01/02).
 * Holds the revision counter, the undo/redo stacks and the history log.
 */
export class ProjectSession {
  private _state: ProjectState;
  private _revision: number;
  private undoStack: HistoryStep[] = [];
  private redoStack: HistoryStep[] = [];
  readonly log: HistoryStep[] = [];
  private readonly newId: IdSource;
  private readonly now: () => string;
  private readonly undoLimit: number;
  private listeners = new Set<(r: ApplyResult) => void>();

  constructor(state: ProjectState, revision = 0, opts: SessionOptions = {}) {
    this._state = state;
    this._revision = revision;
    this.newId = opts.newId ?? randomId;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.undoLimit = Math.max(200, opts.undoLimit ?? 500);
  }

  get state(): ProjectState {
    return this._state;
  }

  get revision(): number {
    return this._revision;
  }

  onChange(fn: (r: ApplyResult) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label;
  }
  redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label;
  }

  /** Runs a batch against a state without committing (shared by apply and dry-run). */
  private execute(state: ProjectState, batch: CommandBatch) {
    const reports: unknown[] = [];
    const ctx: CommandContext = { newId: this.newId, now: this.now, source: batch.source ?? 'user', report: (r) => reports.push(r) };
    const prepared: Command[] = [];
    const touched: string[] = [];
    let commutative = true;
    const labels: string[] = [];
    const [next, patches, inverse] = produceWithPatches(state, (draft) => {
      for (const cmd of batch.commands) {
        validateParams(cmd);
        const def = getCommand(cmd.name);
        const current = draft as unknown as ProjectState;
        const params = def.prepare ? def.prepare(structuredClone(cmd.params), current, ctx) : cmd.params;
        labels.push(def.label(params, current));
        if (def.touches) touched.push(...def.touches(params, current));
        else commutative = false;
        def.apply(draft, params, ctx);
        prepared.push({ name: cmd.name, params: JSON.parse(JSON.stringify(params)) });
      }
    });
    const label = batch.label ?? (labels.length === 1 ? labels[0]! : `${labels[0]} and ${labels.length - 1} more`);
    return { next, patches, inverse, prepared, touched, commutative, label, reports };
  }

  /**
   * Applies a batch atomically (all or none). With baseRevision older than the current revision the batch is
   * rebased only if every command declares its touched keys and none were changed since (FR-ARC-04).
   */
  apply(batch: CommandBatch, opts: { dryRun?: boolean } = {}): ApplyResult {
    const base = batch.baseRevision ?? this._revision;
    if (base > this._revision) {
      throw new FrameError('REVISION_CONFLICT', `Base revision ${base} is newer than the project (${this._revision})`, { baseRevision: base, revision: this._revision });
    }
    const { next, patches, inverse, prepared, touched, commutative, label, reports } = this.execute(this._state, batch);
    let rebased = false;
    if (base < this._revision) {
      const since = this.log.filter((s) => s.revision > base);
      const changedSince = since.flatMap((s) => s.touched);
      const overlaps = touched.filter((k) => changedSince.some((c) => keysOverlap(k, c)));
      if (!commutative || overlaps.length > 0) {
        throw new FrameError(
          'REVISION_CONFLICT',
          `The project changed since revision ${base} (now ${this._revision})`,
          { baseRevision: base, revision: this._revision, overlaps, changedBy: since.map((s) => ({ revision: s.revision, label: s.label, source: s.source })) },
          'Re-read the project and submit the commands again with the current revision.',
        );
      }
      rebased = true;
    }
    const changed = changedKeys(patches);
    if (opts.dryRun) {
      return { revision: this._revision, baseRevision: base, rebased, dryRun: true, label, commands: prepared, changed, state: next, reports };
    }
    if (patches.length === 0) {
      return { revision: this._revision, baseRevision: base, rebased, dryRun: false, label, commands: prepared, changed, state: this._state, reports };
    }
    this._state = next;
    this._revision++;
    const step: HistoryStep = {
      revision: this._revision, label, source: batch.source ?? 'user', commands: prepared, patches, inverse,
      touched: touched.length ? touched : changed, at: this.now(), kind: 'do',
    };
    this.log.push(step);
    this.undoStack.push(step);
    if (this.undoStack.length > this.undoLimit) this.undoStack.shift();
    this.redoStack = [];
    return this.emit({ revision: this._revision, baseRevision: base, rebased, dryRun: false, label, commands: prepared, changed, state: next, reports });
  }

  /** Undo the most recent step (FR-PER-02). Undo never re-triggers generation: it only applies stored patches. */
  undo(): ApplyResult | undefined {
    const step = this.undoStack.pop();
    if (!step) return undefined;
    return this.reverse(step, 'undo');
  }

  redo(): ApplyResult | undefined {
    const step = this.redoStack.pop();
    if (!step) return undefined;
    return this.reverse(step, 'redo');
  }

  private reverse(step: HistoryStep, kind: 'undo' | 'redo'): ApplyResult {
    const patches = kind === 'undo' ? step.inverse : step.patches;
    this._state = applyPatches(this._state, patches);
    this._revision++;
    const label = `${kind === 'undo' ? 'Undo' : 'Redo'} ${step.label}`;
    const changed = changedKeys(patches);
    const logged: HistoryStep = { ...step, revision: this._revision, label, kind, touched: changed, at: this.now(), patches, inverse: kind === 'undo' ? step.patches : step.inverse };
    this.log.push(logged);
    if (kind === 'undo') this.redoStack.push(step);
    else this.undoStack.push(step);
    return this.emit({ revision: this._revision, baseRevision: this._revision - 1, rebased: false, dryRun: false, label, commands: [], changed, state: this._state, reports: [] });
  }

  /** Reverts every change made by one source (e.g. an agent session) as a single undoable step (FR-AGT-04/05). */
  revertSource(source: string): ApplyResult | undefined {
    const steps = this.log.filter((s) => s.source === source && s.kind === 'do');
    if (steps.length === 0) return undefined;
    const inverse = steps.slice().reverse().flatMap((s) => s.inverse);
    let next: ProjectState;
    try {
      next = applyPatches(this._state, inverse);
    } catch (e) {
      throw new FrameError('CONFLICT', `Changes from ${source} were edited afterwards and cannot be reverted automatically`, { cause: String(e) });
    }
    const [, patches, inv] = produceWithPatches(this._state, () => next);
    this._state = next;
    this._revision++;
    const label = `Revert ${source}`;
    const changed = changedKeys(patches);
    const step: HistoryStep = { revision: this._revision, label, source: 'user', commands: [], patches, inverse: inv, touched: changed, at: this.now(), kind: 'do' };
    this.log.push(step);
    this.undoStack.push(step);
    this.redoStack = [];
    return this.emit({ revision: this._revision, baseRevision: this._revision - 1, rebased: false, dryRun: false, label, commands: [], changed, state: next, reports: [] });
  }

  /** Replace the state wholesale (external change reload, FR-PER-05). Clears undo history for safety. */
  replaceState(state: ProjectState, label = 'Reload from disk'): ApplyResult {
    const [, patches] = produceWithPatches(this._state, () => state);
    this._state = state;
    this._revision++;
    this.undoStack = [];
    this.redoStack = [];
    const changed = changedKeys(patches);
    this.log.push({ revision: this._revision, label, source: 'external', commands: [], patches: [], inverse: [], touched: ['*'], at: this.now(), kind: 'do' });
    return this.emit({ revision: this._revision, baseRevision: this._revision - 1, rebased: false, dryRun: false, label, commands: [], changed, state, reports: [] });
  }

  private emit(r: ApplyResult): ApplyResult {
    for (const fn of this.listeners) fn(r);
    return r;
  }
}
