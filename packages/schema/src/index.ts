import type { TSchema } from '@sinclair/typebox';
import { AssetManifest, Locks, PackageManifest, Take, Alignment, VoiceData, ConsentRecord } from './media.js';
import { Clip, Episode, Instance, Project, Scene, Track, Camera, Line } from './project.js';
import { Command, CommandBatch, FrameErrorSchema, HistoryEntry, Problem } from './command.js';
import { MediaRef } from './common.js';

export * from './common.js';
export * from './project.js';
export * from './media.js';
export * from './command.js';
export * from './validate.js';
export * from './migrate.js';
export { Type } from '@sinclair/typebox';
export type { Static, TSchema } from '@sinclair/typebox';

/** Every published schema by name (`frame schema <type>`, FR-DAT-12, FR-CLI-03). */
export const schemas: Record<string, TSchema> = {
  project: Project,
  episode: Episode,
  scene: Scene,
  instance: Instance,
  camera: Camera,
  track: Track,
  clip: Clip,
  line: Line,
  take: Take,
  alignment: Alignment,
  voice: VoiceData,
  consent: ConsentRecord,
  media: MediaRef,
  asset: AssetManifest,
  locks: Locks,
  package: PackageManifest,
  command: Command,
  batch: CommandBatch,
  error: FrameErrorSchema,
  problem: Problem,
  history: HistoryEntry,
};

export function jsonSchema(name: string): object | undefined {
  const s = schemas[name];
  if (!s) return undefined;
  return { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `https://frame.local/schema/${name}.json`, ...JSON.parse(JSON.stringify(s)) };
}
