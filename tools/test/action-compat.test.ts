/** The published action compatibility matrix is complete, current and within the CAT-03 limit (FR-AST-08). */
import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionCompatIssues, prng } from '@frame/core';
import { matrixInputs, matrixMarkdown, type CompatMatrix } from '../catalog/action-compat.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

it('covers every action × character item, is ≤ 2 % incompatible, and spot-checks agree (run pnpm catalog:compat)', () => {
  const m = JSON.parse(fs.readFileSync(path.join(repo, 'content/action-compat.json'), 'utf8')) as CompatMatrix;
  const { actions, items, opts } = matrixInputs();
  expect(m.actions).toEqual(actions.map((a) => a.ref));
  expect(m.items).toEqual(items.map((x) => x.ref));
  expect(m.pairs).toBe(actions.length * items.length);
  expect(m.incompatible.length / m.pairs).toBeLessThanOrEqual(0.02);
  for (const x of m.incompatible) expect(x.reasons.length, `${x.action} × ${x.item}`).toBeGreaterThan(0);
  expect(fs.readFileSync(path.join(repo, 'docs/catalog/action-compat.md'), 'utf8')).toBe(matrixMarkdown(m));
  // Re-check a seeded sample of pairs against the published verdicts.
  const rnd = prng(2026);
  const bad = new Set(m.incompatible.map((x) => `${x.action}|${x.item}`));
  for (let i = 0; i < 25; i++) {
    const a = actions[Math.floor(rnd() * actions.length)]!;
    const it = items[Math.floor(rnd() * items.length)]!;
    expect(actionCompatIssues(it, a, opts).length > 0, `${a.ref} × ${it.ref}`).toBe(bad.has(`${a.ref}|${it.ref}`));
  }
}, 120_000);

it('flags a pair whose rigs differ, with the reason', () => {
  const { actions, items, opts } = matrixInputs();
  const top = items.find((x) => x.manifest.kind === 'top')!;
  const other = { ref: top.ref, manifest: { ...top.manifest, capabilities: ['rig.quadruped@1'] } };
  expect(actionCompatIssues(other, actions[0]!, opts).join(' ')).toMatch(/rig: the action needs rig\.biped/);
});
