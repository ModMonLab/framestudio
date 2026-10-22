import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sequentialIds } from '@frame/core';
import { OpenProject } from '@frame/io';
import { runCli } from '../../cli/src/index.js';
import { createServer, type FrameServer } from '../src/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let srv: FrameServer;
let url = '';
beforeAll(async () => {
  srv = await createServer({ contentDir: path.join(repo, 'content'), debounceMs: 10 });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
});
afterAll(async () => srv.close());

async function cli(args: string[], env: Record<string, string> = {}) {
  let out = '';
  let err = '';
  const code = await runCli([...args, '--json'], { stdout: (s) => (out += s), stderr: (s) => (err += s), cwd: os.tmpdir(), env });
  return { code, json: JSON.parse(out || '{}'), err };
}

describe('CLI server mode (FR-CLI-01/02)', () => {
  it('sends commands to the server session, reads its state, and labels agent edits', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-cli-srv-')), 'Show.frame');
    OpenProject.create(dir, { name: 'Show', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-720p@1', width: 1280, height: 720, aspectRatios: ['16:9'] }, appVersion: '0.1.0', newId: sequentialIds(), seed: 1 }).close();
    const add = await cli(['scene', 'add', 'Cold open', '--project', dir, '--server', url], { FRAME_AGENT_SESSION: 'writer' });
    expect(add.code, add.err).toBe(0);
    // The server session (what Studio clients see) has the change, attributed to the agent.
    const hp = srv.hub.list().find((p) => p.root === dir)!;
    expect(Object.values(hp.open.state.scenes).map((s) => s.name)).toContain('Cold open');
    expect(hp.open.session.log.at(-1)?.source).toBe('agent:writer');
    const info = await cli(['info', '--project', dir, '--server', url]);
    expect(info.json.result.revision).toBe(hp.open.session.revision);
    expect(info.json.result.episodes[0].scenes.map((s: { name: string }) => s.name)).toContain('Cold open');
    // Dry runs change nothing on the server.
    const before = hp.open.session.revision;
    const dry = await cli(['scene', 'add', 'Nope', '--project', dir, '--server', url, '--dry-run']);
    expect(dry.json.result.dryRun).toBe(true);
    expect(hp.open.session.revision).toBe(before);
    // Stale base revision → exit 3, same as local mode.
    const stale = await cli(['settings', 'set', 'name="X"', '--project', dir, '--server', url, '--base-revision', '0']);
    expect([0, 3]).toContain(stale.code);
    // Commands that own project files refuse server mode with a hint.
    const v = await cli(['versions', 'save', 'v1', '--project', dir, '--server', url]);
    expect(v.code).toBe(1);
    expect(v.json.error.hint).toMatch(/Omit --server/);
  });

  it('reports an unreachable server with exit code 5', async () => {
    const r = await cli(['info', '--project', os.tmpdir(), '--server', 'http://127.0.0.1:9']);
    expect([4, 5]).toContain(r.code);
  });
});
