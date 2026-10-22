/** Node-side loading of library sources from folders (bundled content, user profile, project assets). */
import fs from 'node:fs';
import path from 'node:path';
import { Library, type AssetSource } from './library.js';

export function loadFolder(lib: Library, dir: string, source: AssetSource): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json') && !e.name.startsWith('.')) {
        try {
          if (lib.add(JSON.parse(fs.readFileSync(p, 'utf8')), source, p)) n++;
        } catch (err) {
          lib.problems.push({ file: p, message: `Not valid JSON: ${(err as Error).message}` });
        }
      }
    }
  };
  walk(dir);
  return n;
}

let bundled: Library | undefined;

/** The bundled library (content/assets), loaded once per process. */
export function bundledLibrary(contentDir: string): Library {
  if (!bundled) {
    bundled = new Library();
    loadFolder(bundled, path.join(contentDir, 'assets'), 'bundled');
  }
  return bundled;
}

export { loadStyles } from './styles.js';

/** A library combining bundled content, the user library and a project's local assets. */
export function libraryFor(opts: { contentDir: string; userDir?: string; projectAssets?: Record<string, unknown> }): Library {
  const lib = new Library();
  for (const e of bundledLibrary(opts.contentDir).all()) lib.add(e.manifest, 'bundled', e.file);
  if (opts.userDir) loadFolder(lib, opts.userDir, 'user');
  for (const [file, m] of Object.entries(opts.projectAssets ?? {})) lib.add(m, 'project', file);
  return lib;
}
