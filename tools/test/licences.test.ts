/** Licence report (NFR-17): every dependency, font and content licence is on the allowlist and the report is current. */
import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenceReport } from '../docs/licences.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

it('has no licence problems and docs/licences.md is up to date (run pnpm docs:licences)', () => {
  const { json, md } = licenceReport();
  expect(json.problems).toEqual([]);
  expect(json.packages.length).toBeGreaterThan(100);
  // Installed optional packages differ by OS; the committed report is generated on Linux, like CI's pull request runs.
  if (process.platform === 'linux') expect(fs.readFileSync(path.join(repo, 'docs/licences.md'), 'utf8'), 'docs/licences.md is stale: run pnpm docs:licences').toBe(md);
}, 60_000);
