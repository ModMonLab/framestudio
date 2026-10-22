import { CURRENT_SCHEMA_VERSION } from './common.js';
import { FrameError } from './command.js';

export type FileKind = 'project' | 'episode' | 'scene' | 'take' | 'asset' | 'locks';

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/** migrations[kind][n] upgrades a document from schema version n to n + 1. */
const migrations: Record<FileKind, Record<number, Migration>> = {
  project: {}, episode: {}, scene: {}, take: {}, asset: {}, locks: {},
};

export interface MigrationResult {
  doc: Record<string, unknown>;
  from: number;
  to: number;
  migrated: boolean;
}

/**
 * Upgrades a loaded document to the current schema version (FR-DAT-05).
 * Newer-than-supported documents are refused without modification.
 */
export function migrate(kind: FileKind, doc: Record<string, unknown>): MigrationResult {
  const from = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : NaN;
  if (!Number.isInteger(from) || from < 1) {
    throw new FrameError('VALIDATION_FAILED', `${kind} file has no valid schemaVersion`);
  }
  if (from > CURRENT_SCHEMA_VERSION) {
    throw new FrameError('SCHEMA_TOO_NEW', `${kind} file uses schema version ${from}; this Frame supports up to ${CURRENT_SCHEMA_VERSION}`, { from }, 'Update Frame to open this project. The file was not modified.');
  }
  let cur = structuredClone(doc);
  for (let v = from; v < CURRENT_SCHEMA_VERSION; v++) {
    const m = migrations[kind][v];
    if (!m) throw new FrameError('INTERNAL', `No migration for ${kind} v${v}`);
    cur = { ...m(cur), schemaVersion: v + 1 };
  }
  return { doc: cur, from, to: CURRENT_SCHEMA_VERSION, migrated: from !== CURRENT_SCHEMA_VERSION };
}

/** Test hook to register a migration (used by tests to prove the framework). */
export function registerMigration(kind: FileKind, fromVersion: number, m: Migration): void {
  migrations[kind][fromVersion] = m;
}
