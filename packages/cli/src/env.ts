import fs from 'node:fs';
import path from 'node:path';
import type { OutputSettings, StyleFamily } from '@frame/schema';
import { fileURLToPath } from 'node:url';

export const APP_VERSION = '0.1.0';

/** Bundled content folder (overridable with FRAME_CONTENT). */
export function contentDir(): string {
  if (process.env.FRAME_CONTENT) return path.resolve(process.env.FRAME_CONTENT);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content');
}

export function catalogDir(): string {
  if (process.env.FRAME_CATALOG) return path.resolve(process.env.FRAME_CATALOG);
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../catalog');
}

export interface LibraryDefaults {
  output: OutputSettings;
  frameRate: number;
  styleFamily: StyleFamily;
  captionStyle?: string;
}

/** Defaults come from the content library, never from code (FR-ARC-06). */
export function libraryDefaults(): LibraryDefaults {
  const lib = JSON.parse(fs.readFileSync(path.join(contentDir(), 'library.json'), 'utf8')) as { defaults: LibraryDefaults };
  return lib.defaults;
}

/** The user library folder (FR-AST-01): FRAME_USER_DIR, or `~/.frame/library`. */
export function userLibraryDir(env: Record<string, string | undefined> = process.env): string {
  if (env.FRAME_USER_DIR) return path.resolve(env.FRAME_USER_DIR);
  return path.join(env.HOME ?? env.USERPROFILE ?? '.', '.frame', 'library');
}
