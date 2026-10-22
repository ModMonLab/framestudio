import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { OpenProject, stableStringify } from '../src/index.js';
import { newProject } from './helpers.js';

const here = path.dirname(new URL(import.meta.url).pathname);
// Run node directly with the tsx loader: the tsx CLI wrapper would leave an orphaned child running after SIGKILL.
const nodeArgs = ['--import', 'tsx'];

function runAndKill(dir: string, seed: number, edits: number, killAfterMs: number): Promise<Map<number, string>> {
  return new Promise((resolve) => {
    const logFile = path.join(path.dirname(dir), `crash-${seed}.log`);
    const child = spawn(process.execPath, [...nodeArgs, path.join(here, 'fixtures/crash-child.ts'), dir, String(seed), String(edits), logFile], { stdio: ['ignore', 'ignore', 'inherit'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), killAfterMs);
    child.on('exit', () => {
      clearTimeout(timer);
      const seen = new Map<number, string>();
      for (const line of fs.readFileSync(logFile, 'utf8').split('\n')) {
        const [rev, h] = line.split(' ');
        if (rev && h) seen.set(Number(rev), h);
      }
      resolve(seen);
    });
  });
}

describe('reliability: kill during random edits (NFR-08, AC-16)', () => {
  it('reopened project equals the last committed state; no corrupt files', async () => {
    const p = newProject();
    p.flush();
    const dir = p.store.root;
    let total = 0;
    let kills = 0;
    for (let round = 0; round < 20 && total < 1000; round++) {
      const seen = await runAndKill(dir, 1000 + round, 600, 600 + ((round * 337) % 900));
      const reopened = OpenProject.open(dir);
      const rev = reopened.session.revision;
      const h = crypto.createHash('sha256').update(stableStringify(reopened.state)).digest('hex');
      const last = Math.max(...seen.keys());
      // The commit is durable once journaled; it may have been printed or not yet printed before the kill.
      expect([last, last + 1]).toContain(rev);
      if (seen.has(rev)) expect(h).toBe(seen.get(rev));
      expect(reopened.load!.problems.filter((x) => x.severity === 'error')).toEqual([]);
      reopened.close();
      total += seen.size - 1;
      if (seen.size - 1 < 600) kills++;
    }
    expect(total).toBeGreaterThanOrEqual(1000);
    expect(kills).toBeGreaterThan(0);
  }, 120_000);
});
