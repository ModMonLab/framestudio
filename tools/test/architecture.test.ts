import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog } from '@frame/assets/catalog';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const runtimeRoots = [...fs.readdirSync(path.join(repo, 'packages')).map((p) => `packages/${p}/src`), ...(fs.existsSync(path.join(repo, 'apps')) ? fs.readdirSync(path.join(repo, 'apps')).map((a) => `apps/${a}/src`) : [])];

function sources(dir: string): string[] {
  const abs = path.join(repo, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|js|css)$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));
}

describe('architecture (FR-ARC-06, NFR-13)', () => {
  const cat = loadCatalog(path.join(repo, 'catalog'));
  const ids = [...cat.byId.keys()];
  const castNames = cat.lists.find((l) => l.prefix === 'chr')!.items.map((i) => i.name);

  it('runtime packages contain no catalog IDs or bundled cast names', () => {
    const hits: string[] = [];
    for (const root of runtimeRoots) {
      for (const file of sources(root)) {
        const text = fs.readFileSync(file, 'utf8');
        for (const id of ids) {
          const re = new RegExp(`(?<![A-Za-z0-9_.-])${id.replace(/[.-]/g, (m) => `\\${m}`)}(?![A-Za-z0-9_-])`);
          if (re.test(text)) hits.push(`${path.relative(repo, file)}: ${id}`);
        }
        for (const n of castNames) if (text.includes(n)) hits.push(`${path.relative(repo, file)}: ${n}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('pure packages (schema, core) do not import Node I/O or DOM modules', () => {
    for (const pkg of ['schema', 'core']) {
      for (const file of sources(`packages/${pkg}/src`)) {
        const text = fs.readFileSync(file, 'utf8');
        expect(text, file).not.toMatch(/from 'node:(fs|path|child_process|net|http)'/);
        expect(text, file).not.toMatch(/\bdocument\.|\bwindow\./);
      }
    }
  });
});
