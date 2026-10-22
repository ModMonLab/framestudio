import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { OpenProject, stableStringify } from '../src/index.js';
import { newProject } from './helpers.js';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Run node directly with the tsx loader: the tsx CLI wrapper would leave an orphaned child running after SIGKILL.
const nodeArgs = ['--import', 'tsx'];

function runAndKill(dir: string, seed: number, edits: number, killAfterMs: number): Promise<Map<number, string>> {
  return new Promise((resolve) => {
    const logFile = path.join(path.dirname(dir), `crash-${seed}.log`);
    const child = spawn(process.execPath, [...nodeArgs, path.join(here, 'fixtures/crash-child.ts'), dir, String(seed), String(edits), logFile], { stdio: ['ignore', 'ignore', 'inherit'] });
    // Start the kill clock only once the child has opened the project and logged its first state: on slow CI
    // runners loader start-up alone can exceed the kill delay, which would test nothing.
    let timer: NodeJS.Timeout | undefined;
    const ready = setInterval(() => {
      if (fs.existsSync(logFile) && fs.statSync(logFile).size > 0) {
        clearInterval(ready);
        timer = setTimeout(() => child.kill('SIGKILL'), killAfterMs);
      }
    }, 10);
    child.on('exit', () => {
      clearInterval(ready);
      clearTimeout(timer);
      const seen = new Map<number, string>();
      const text = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
      for (const line of text.split('\n')) {
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
      expect(seen.size, 'child logged its initial state').toBeGreaterThan(0);
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
  }, 300_000);
});
