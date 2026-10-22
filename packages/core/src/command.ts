import { type TSchema, type Static, type Command, FrameError, issues, check } from '@frame/schema';
import type { Draft } from 'immer';
import type { ProjectState } from './state.js';
import type { IdSource } from './ids.js';

export interface CommandContext {
  /** ID source; command preparation fills generated IDs into params so recorded commands replay exactly. */
  newId: IdSource;
  /** Current time for created-at fields (injectable for determinism). */
  now: () => string;
  /** Source tag for created clips (manual, agent:<session>...). */
  source: string;
  /** Structured information for the caller (e.g. clips moved by re-snapping). */
  report: (info: unknown) => void;
}

export interface CommandDefinition<S extends TSchema = TSchema> {
  name: string;
  summary: string;
  params: S;
  examples?: Static<S>[];
  /** Fills generated values (IDs, defaults) into params before execution so the recorded command is replayable. */
  prepare?: (params: Static<S>, state: ProjectState, ctx: CommandContext) => Static<S>;
  /** Mutates the draft. Throws FrameError for invalid requests. */
  apply: (draft: Draft<ProjectState>, params: Static<S>, ctx: CommandContext) => void;
  /** Undo label, e.g. "Move Maya". */
  label: (params: Static<S>, state: ProjectState) => string;
  /**
   * Entity keys the command touches. Commands that declare keys are commutative (FR-ARC-04): a stale batch
   * is rebased when none of its keys were touched since its base revision.
   */
  touches?: (params: Static<S>, state: ProjectState) => string[];
}

const registry = new Map<string, CommandDefinition<any>>();

export function defineCommand<S extends TSchema>(def: CommandDefinition<S>): CommandDefinition<S> {
  if (registry.has(def.name)) throw new Error(`Duplicate command ${def.name}`);
  registry.set(def.name, def as CommandDefinition<any>);
  return def;
}

export function getCommand(name: string): CommandDefinition<any> {
  const def = registry.get(name);
  if (!def) throw new FrameError('NOT_FOUND', `Unknown command "${name}"`, { name }, 'Run `frame describe` to list commands.');
  return def;
}

export function listCommands(): CommandDefinition<any>[] {
  return [...registry.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function validateParams(cmd: Command): void {
  const def = getCommand(cmd.name);
  if (!check(def.params, cmd.params)) {
    throw new FrameError('VALIDATION_FAILED', `Invalid parameters for ${cmd.name}`, { command: cmd.name, issues: issues(def.params, cmd.params) });
  }
}

export function fail(code: ConstructorParameters<typeof FrameError>[0], message: string, details?: unknown, hint?: string): never {
  throw new FrameError(code, message, details, hint);
}
