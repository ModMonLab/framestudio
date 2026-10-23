import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemas } from '@frame/schema';
import { formatDocs } from '../docs/formats.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/formats');

it('docs/formats documents every published schema and is up to date (FR-DAT-12; run pnpm docs:formats)', () => {
  const files = formatDocs();
  for (const n of Object.keys(schemas)) {
    expect(files[`${n}.md`]).toBeTruthy();
    expect(files[`schemas/${n}.schema.json`]).toBeTruthy();
  }
  for (const [f, text] of Object.entries(files)) expect(fs.readFileSync(path.join(dir, f), 'utf8'), `${f} is stale: run pnpm docs:formats`).toBe(text);
});
