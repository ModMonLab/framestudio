/** Internationalisation-ready (NFR-16): Studio text goes through tt() and the translator catalogue is current. */
import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CATALOGUE, catalogue, files, scan, STUDIO_SRC } from '../i18n/extract.js';

it('no hard-coded JSX text or user-facing attribute strings in the Studio (run tools/i18n/extract.ts --fix)', () => {
  const found = files().flatMap((f) => scan(f).found.map((x) => `${path.relative(STUDIO_SRC, x.file)}:${x.line} ${x.text}`));
  expect(found).toEqual([]);
});

it('docs/i18n/studio.en.json lists every message (run tools/i18n/extract.ts --write)', () => {
  const c = catalogue();
  expect(Object.keys(c).length).toBeGreaterThan(500);
  expect(JSON.parse(fs.readFileSync(CATALOGUE, 'utf8'))).toEqual(c);
});
