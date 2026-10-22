/**
 * M1 exit (SRS §11): a designed voice speaks two aligned lines in a two-character scene, exported identically from
 * the server (Studio path) and the CLI. Needs a running Voice Worker: FRAME_TEST_WORKER_URL (CI runs the fixture
 * engine). Fixture audio is a test signal and is labelled as not real speech (P7, NFR-18).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mouthTrackFromAlignment, validateProject } from '@frame/core';
import { ProjectStore, probe } from '@frame/io';
import { createServer, type FrameServer } from '../../packages/server/src/index.js';
import { runCli } from '../../packages/cli/src/index.js';
import { buildSampleScene } from './sample-scene.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKER = process.env.FRAME_TEST_WORKER_URL;
const SAMPLE = 'Thanks for listening to the show today. We read every message you send, even the strange ones.';

describe.skipIf(!WORKER)('M1 vertical slice with the Voice Worker (AC-01 path, FR-VOI-02/07, FR-LIP-01, FR-RND-01)', () => {
  let srv: FrameServer;
  let base = '';
  beforeAll(async () => {
    srv = await createServer({ contentDir: path.join(repo, 'content'), workerUrl: WORKER!, debounceMs: 20 });
    await srv.app.listen({ port: 0, host: '127.0.0.1' });
    base = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
  });
  afterAll(async () => srv?.close());
  const api = async (method: string, url: string, body?: unknown) => {
    const r = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, json: (await r.json()) as any };
  };
  const waitJob = async (id: string) => {
    for (;;) {
      const j = (await api('GET', `/api/jobs/${id}`)).json;
      if (j.state !== 'queued' && j.state !== 'running') return j;
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  it('designs two voices, generates aligned takes, and exports the same pixels from server and CLI', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-slice-')), 'Slice.frame');
    const { session, scene, maya, leo, lines } = buildSampleScene('flat', { takes: false });
    ProjectStore.create(dir, session.state);
    const pid = (await api('POST', '/api/projects/open', { path: dir })).json.id;

    const status = (await api('GET', `/api/worker/status?project=${pid}`)).json;
    expect(['connected', 'busy']).toContain(status.state);
    const fixture = status.fixture as boolean;
    if (fixture) expect(status.label).toBe('Fixture audio — not real speech');

    // Design and save one voice per host (FR-VOI-02).
    for (const [who, name, description] of [[maya, 'Host A voice', 'Warm, articulate radio host in her thirties, relaxed pace'], [leo, 'Host B voice', 'Dry, playful co-host in his late twenties, quick delivery']] as const) {
      const dj = await api('POST', `/api/projects/${pid}/voices/design`, { description, sampleText: SAMPLE, candidates: 2, seed: 7 });
      expect(dj.status).toBe(202);
      const done = await waitJob(dj.json.id);
      expect(done.state, JSON.stringify(done.error)).toBe('succeeded');
      expect(done.result.candidates).toHaveLength(2);
      const saved = await api('POST', `/api/projects/${pid}/voices`, { name, description, sampleText: SAMPLE, candidate: done.result.candidates[0], assignTo: [{ scene, instance: who }] });
      expect(saved.status, JSON.stringify(saved.json)).toBe(200);
    }

    // Generate takes for both lines (FR-VOI-07) and align them (FR-LIP-01).
    const gj = await api('POST', `/api/projects/${pid}/takes/generate`, { scene, lines, takes: 2 });
    const gen = await waitJob(gj.json.id);
    expect(gen.state, JSON.stringify(gen.error)).toBe('succeeded');
    expect(gen.result.takes.filter((t: any) => t.status === 'ready'), JSON.stringify(gen.result)).toHaveLength(4);
    const st = (await api('GET', `/api/projects/${pid}/state`)).json.state;
    for (const id of lines) {
      const clip = st.scenes[scene].clips.find((c: any) => c.id === id);
      const take = st.takes[clip.line.take];
      expect(take).toMatchObject({ status: 'ready', fixture, lineRevision: 1, source: 'generated' });
      expect(take.alignment.words.length).toBeGreaterThan(3);
      // Lip sync from the alignment changes mouth shapes over the line.
      const shapes = new Set(mouthTrackFromAlignment(take.alignment, { fps: 24 }).blocks.map((b) => b.shape));
      expect(shapes.size).toBeGreaterThan(3);
    }
    const problems = (await api('GET', `/api/projects/${pid}/validate`)).json.problems.filter((p: any) => p.blocksExport);
    expect(problems).toEqual([]);

    // Export through the server (the Studio's path) and through the CLI; compare frames.
    await api('POST', `/api/projects/${pid}/save`);
    const rj = await api('POST', `/api/projects/${pid}/renders`, { scene, width: 640, height: 360, range: { from: 0, to: 48000 * 9 }, out: 'renders/server.mp4' });
    const rendered = await waitJob(rj.json.id);
    expect(rendered.state, JSON.stringify(rendered.error)).toBe('succeeded');
    expect(rendered.result.fixtureAudio).toBe(fixture);
    const a = probe(rendered.result.output);
    expect(a.streams.find((s) => s.type === 'audio')).toBeTruthy();
    for (const t of [1.5, 6.2]) {
      const srvPng = new Uint8Array(await (await fetch(`${base}/api/projects/${pid}/frame?scene=${scene}&t=${Math.round(t * 48000)}&width=640&height=360&captions=true`)).arrayBuffer());
      const out = path.join(dir, `cli-${t}.png`);
      let err = '';
      const code = await runCli(['render', 'frame', '--project', dir, '--scene', scene, '--at', String(t), '--width', '640', '--height', '360', '--captions', '--out', out, '--json'], { stdout: () => {}, stderr: (s) => (err += s), cwd: dir, env: {} });
      expect(code, err).toBe(0);
      expect(Buffer.from(srvPng).equals(fs.readFileSync(out)), `frame at ${t}s differs between server and CLI`).toBe(true);
    }
    // The project on disk validates on its own.
    expect(validateProject(ProjectStore.prototype.load.call(new ProjectStore(dir)).state).filter((p) => p.blocksExport && p.code.startsWith('TAKE'))).toEqual([]);
  }, 180_000);
});
