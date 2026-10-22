import { Type, type Static } from '@sinclair/typebox';

/** A serialisable engine command (FR-ARC-02). */
export const Command = Type.Object(
  {
    name: Type.String({ pattern: '^[a-z]+(\\.[a-z][a-zA-Z]*)+$', description: 'Command name, e.g. scene.add, clip.move.' }),
    params: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);
export type Command = Static<typeof Command>;

export const CommandBatch = Type.Object(
  {
    baseRevision: Type.Optional(Type.Integer({ minimum: 0 })),
    label: Type.Optional(Type.String()),
    source: Type.Optional(Type.String({ pattern: '^(user|cli|auto|agent:[A-Za-z0-9_-]+)$' })),
    commands: Type.Array(Command, { minItems: 1 }),
  },
  { additionalProperties: false, description: 'Commands applied atomically: all or none (frame apply).' },
);
export type CommandBatch = Static<typeof CommandBatch>;

export const errorCodes = [
  'USAGE', 'VALIDATION_FAILED', 'REVISION_CONFLICT', 'NOT_FOUND', 'WORKER_UNAVAILABLE', 'RENDER_FAILED',
  'CANCELLED', 'PERMISSION_REQUIRED', 'CONSENT_REQUIRED', 'INTERNAL', 'SCHEMA_TOO_NEW', 'MIGRATION_REQUIRED',
  'CONFLICT', 'UNSUPPORTED', 'IO_ERROR', 'INVALID_PACKAGE',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export const FrameErrorSchema = Type.Object(
  {
    code: Type.Union(errorCodes.map((c) => Type.Literal(c))),
    message: Type.String(),
    details: Type.Optional(Type.Unknown()),
    hint: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

/** Structured error used across engine, CLI, server and MCP (FR-CLI-04). */
export class FrameError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = 'FrameError';
  }
  toJSON() {
    return { code: this.code, message: this.message, ...(this.details !== undefined ? { details: this.details } : {}), ...(this.hint ? { hint: this.hint } : {}) };
  }
}

/** CLI exit codes (FR-CLI-04). */
export const exitCodeFor: Record<ErrorCode, number> = {
  USAGE: 1, VALIDATION_FAILED: 2, REVISION_CONFLICT: 3, NOT_FOUND: 4, WORKER_UNAVAILABLE: 5, RENDER_FAILED: 6,
  CANCELLED: 7, PERMISSION_REQUIRED: 8, CONSENT_REQUIRED: 8, INTERNAL: 10, SCHEMA_TOO_NEW: 2, MIGRATION_REQUIRED: 2,
  CONFLICT: 2, UNSUPPORTED: 1, IO_ERROR: 10, INVALID_PACKAGE: 2,
};

export const Problem = Type.Object(
  {
    severity: Type.Union([Type.Literal('error'), Type.Literal('warning'), Type.Literal('info')]),
    code: Type.String(),
    message: Type.String(),
    scene: Type.Optional(Type.String()),
    target: Type.Optional(Type.Object({ kind: Type.String(), id: Type.String() }, { additionalProperties: false })),
    blocksExport: Type.Boolean(),
    fix: Type.Optional(Type.Object({ label: Type.String(), command: Type.Optional(Type.Unknown()) }, { additionalProperties: false })),
  },
  { additionalProperties: false, description: 'An entry in the Problems panel (FR-PER-06).' },
);
export type Problem = Static<typeof Problem>;

export const HistoryEntry = Type.Object(
  {
    revision: Type.Integer({ minimum: 1 }),
    at: Type.String(),
    label: Type.String(),
    source: Type.String(),
    commands: Type.Array(Command),
  },
  { additionalProperties: false },
);
export type HistoryEntry = Static<typeof HistoryEntry>;
