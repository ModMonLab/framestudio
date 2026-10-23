/**
 * Output of `frame … --json` (FR-CLI-07): every command prints one envelope; edits share one result shape. Fields are
 * only ever added within a major version, never renamed or removed.
 */
import { Type, type Static } from '@sinclair/typebox';
import { Command, FrameErrorSchema, Problem } from './command.js';

export const CliEnvelope = Type.Union([
  Type.Object({ ok: Type.Literal(true), result: Type.Unknown({ description: 'Command-specific result; see `frame describe` and docs/formats/cli.md.' }) }, { additionalProperties: false }),
  Type.Object({ ok: Type.Literal(false), error: FrameErrorSchema }, { additionalProperties: false }),
]);
export type CliEnvelope = Static<typeof CliEnvelope>;

/** Result of every command that edits a project (applied, or with --dry-run, planned). */
export const CliMutation = Type.Object(
  {
    dryRun: Type.Boolean({ description: 'True when nothing was written.' }),
    revision: Type.Integer({ minimum: 0, description: 'Project revision after the change (unchanged on a dry run).' }),
    label: Type.String({ description: 'Undo label of the change.' }),
    commands: Type.Array(Command, { description: 'The engine commands, with ids filled in.' }),
    reports: Type.Array(Type.Unknown(), { description: 'Command reports (e.g. clips moved by a frame-rate change).' }),
    problems: Type.Array(Problem, { description: 'Validation errors and warnings after the change.' }),
  },
  { additionalProperties: true },
);
export type CliMutation = Static<typeof CliMutation>;

/** A job on the Frame Server (`frame jobs list|watch`, server mode). */
export const JobRecord = Type.Object(
  {
    id: Type.String(),
    kind: Type.String(),
    title: Type.String(),
    state: Type.Union(['queued', 'running', 'succeeded', 'failed', 'cancelled'].map((s) => Type.Literal(s))),
    progress: Type.Number({ minimum: 0, maximum: 1 }),
    message: Type.String(),
    project: Type.Optional(Type.String()),
    result: Type.Optional(Type.Unknown()),
    error: Type.Optional(FrameErrorSchema),
    createdAt: Type.String(),
    startedAt: Type.Optional(Type.String()),
    finishedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);
export type JobRecord = Static<typeof JobRecord>;
