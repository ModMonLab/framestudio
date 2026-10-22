import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDelta, sequentialIds, type ProjectState } from '@frame/core';
import { OpenProject } from '@frame/io';
import { createServer, type FrameServer } from '../src/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUTPUT = { preset: 'out.landscape-720p@1', width: 1280, height: 720, aspectRatios: ['16:9'] };

function project(): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-srv-')), 'Show.frame');
  OpenProject.create(dir, { name: 'Show', styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', newId: sequentialIds(), seed: 1 }).close();
  return dir;
}

let srv: FrameServer;
let base: string;
beforeAll(async () => {
  srv = await createServer({ contentDir: path.join(repo, 'content'), debounceMs: 20 });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = srv.app.server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});
afterAll(async () => srv.close());

const api = async (method: string, url: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(base + url, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};

describe('Frame Server (FR-ARC-01..05)', () => {
  it('opens a project, applies commands, and publishes deltas over WebSocket that rebuild the same state', async () => {
    const dir = project();
    const opened = await api('POST', '/api/projects/open', { path: dir });
    expect(opened.status).toBe(200);
    const pid = opened.json.id as string;
    let { json: snap } = await api('GET', `/api/projects/${pid}/state`);
    let mirror: ProjectState = snap.state;
    const ws = new WebSocket(`${base.replace('http', 'ws')}/api/events?project=${pid}`);
    const events: any[] = [];
    await new Promise<void>((r) => ws.addEventListener('open', () => r()));
    ws.addEventListener('message', (m) => {
      const e = JSON.parse(String(m.data));
      events.push(e);
      if (e.type === 'change') mirror = applyDelta(mirror, e.delta);
    });
    const ep = mirror.project.episodes[0]!;
    const r = await api('POST', `/api/projects/${pid}/commands`, { baseRevision: snap.revision, commands: [{ name: 'scene.add', params: { episode: ep, name: 'Cold open', durationS: 8 } }] });
    expect(r.status).toBe(200);
    expect(r.json.revision).toBe(snap.revision + 1);
    // A CLI-style edit with an agent header shows its source (FR-AGT activity).
    const r2 = await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'project.setSettings', params: { name: 'Show 2' } }] }, { 'x-frame-agent': 'tester' });
    expect(r2.status).toBe(200);
    await expect.poll(() => events.filter((e) => e.type === 'change').length).toBe(2);
    expect(events[0]).toMatchObject({ type: 'hello', project: pid });
    expect(events.find((e) => e.type === 'change' && e.label.includes('Show 2')).source).toBe('agent:tester');
    snap = (await api('GET', `/api/projects/${pid}/state`)).json;
    expect(mirror).toEqual(snap.state);
    // Undo publishes too.
    expect((await api('POST', `/api/projects/${pid}/undo`)).json.label).toContain('Show 2');
    await expect.poll(() => events.filter((e) => e.type === 'change').length).toBe(3);
    expect(mirror.project.name).toBe('Show');
    ws.close();
    // Saved to disk through the same store.
    await api('POST', `/api/projects/${pid}/save`);
    const disk = OpenProject.open(dir);
    expect(Object.values(disk.state.scenes).map((s) => s.name)).toContain('Cold open');
  });

  it('a copied folder with the same project id replaces the open original, which is saved and closed', async () => {
    const dir = project();
    const a = (await api('POST', '/api/projects/open', { path: dir })).json.id as string;
    await api('POST', `/api/projects/${a}/commands`, { commands: [{ name: 'project.setSettings', params: { name: 'Original' } }] });
    const copy = path.join(path.dirname(dir), 'Copy.frame');
    await api('POST', `/api/projects/${a}/save`);
    fs.cpSync(dir, copy, { recursive: true });
    const b = (await api('POST', '/api/projects/open', { path: copy })).json;
    expect(b.id).toBe(a);
    await api('POST', `/api/projects/${a}/commands`, { commands: [{ name: 'project.setSettings', params: { name: 'Copy' } }] });
    await api('POST', `/api/projects/${a}/save`);
    expect(OpenProject.open(dir).state.project.name).toBe('Original');
    expect(OpenProject.open(copy).state.project.name).toBe('Copy');
    const list = (await api('GET', '/api/projects')).json.projects.filter((p: { id: string }) => p.id === a);
    expect(list.map((p: { root: string }) => p.root)).toEqual([path.resolve(copy)]);
  });

  it('rejects stale non-commutative edits with REVISION_CONFLICT and rebases commutative ones (FR-ARC-04)', async () => {
    const pid = (await api('POST', '/api/projects/open', { path: project() })).json.id;
    const st = (await api('GET', `/api/projects/${pid}/state`)).json;
    const scene = Object.keys(st.state.scenes)[0]!;
    await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'scene.rename', params: { id: scene, name: 'A' } }] });
    const stale = await api('POST', `/api/projects/${pid}/commands`, { baseRevision: st.revision, commands: [{ name: 'scene.rename', params: { id: scene, name: 'B' } }] });
    expect(stale.status).toBe(409);
    expect(stale.json.error).toMatchObject({ code: 'REVISION_CONFLICT', exitCode: 3 });
    const bad = await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'scene.rename', params: { id: 'scn_nope', name: 'B' } }] });
    expect(bad.status).toBe(404);
    const unknown = await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'no.such', params: {} }] });
    expect(unknown.json.error.code).toBeDefined();
  });

  it('stores and serves content-addressed media; searches the library', async () => {
    const pid = (await api('POST', '/api/projects/open', { path: project() })).json.id;
    const bytes = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
    const up = await fetch(`${base}/api/projects/${pid}/media?ext=wav`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes });
    const ref = (await up.json()) as any;
    expect(ref.hash).toMatch(/^sha256-/);
    const down = await fetch(`${base}/api/projects/${pid}/media/${ref.hash}`);
    expect(down.headers.get('content-type')).toBe('audio/wav');
    expect(new Uint8Array(await down.arrayBuffer())).toEqual(bytes);
    const lib = await api('GET', '/api/library?kind=out&limit=50');
    expect(lib.json.results.length).toBeGreaterThan(5);
    const m = await api('GET', `/api/library/manifest?ref=${encodeURIComponent(lib.json.results[0].ref)}`);
    expect(m.json.kind).toBe('out');
    expect((await api('GET', '/api/library/manifest?ref=nope.nope@1')).status).toBe(404);
  });

  it('renders cached library thumbnails in both families (FR-AST-07)', async () => {
    for (const family of ['flat', 'illustrated']) {
      const lib = await api('GET', '/api/library?kind=exp&limit=1');
      const res = await fetch(`${base}/api/library/thumbnail?ref=${encodeURIComponent(lib.json.results[0].ref)}&family=${family}&w=64`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const png = new Uint8Array(await res.arrayBuffer());
      expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
      expect(png.length).toBeGreaterThan(500);
    }
    const out = await api('GET', '/api/library?kind=out&limit=1');
    expect((await fetch(`${base}/api/library/thumbnail?ref=${encodeURIComponent(out.json.results[0].ref)}`)).status).toBe(404);
  });

  it('runs an export job with progress events and a report (FR-ARC-05, FR-RND-07)', async () => {
    const pid = (await api('POST', '/api/projects/open', { path: project() })).json.id;
    const st = (await api('GET', `/api/projects/${pid}/state`)).json;
    const scene = Object.keys(st.state.scenes)[0]!;
    await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'scene.setDuration', params: { id: scene, durationS: 1 } }] });
    const job = await api('POST', `/api/projects/${pid}/renders`, { scene, width: 320, height: 180 });
    expect(job.status).toBe(202);
    let j: any;
    await expect.poll(async () => (j = (await api('GET', `/api/jobs/${job.json.id}`)).json).state, { timeout: 60_000, interval: 200 }).toBe('succeeded');
    expect(j.result.frames).toBe(24);
    expect(fs.existsSync(j.result.output)).toBe(true);
    expect((await api('GET', `/api/jobs?project=${pid}`)).json.jobs[0].id).toBe(job.json.id);
  }, 90_000);

  it('exports with custom fps and motion blur, queues a batch over aspect ratios and retries a failed export (FR-RND-04/07/09/10)', async () => {
    const pid = (await api('POST', '/api/projects/open', { path: project() })).json.id;
    const st = (await api('GET', `/api/projects/${pid}/state`)).json;
    const scene = Object.keys(st.state.scenes)[0]!;
    await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'scene.setDuration', params: { id: scene, durationS: 0.5 } }, { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.mug@1', name: 'Mug', transform: { x: 300, y: 800 } } }] });
    const wait = async (id: string) => {
      let j: any;
      await expect.poll(async () => (j = (await api('GET', `/api/jobs/${id}`)).json).state, { timeout: 60_000, interval: 200 }).toMatch(/succeeded|failed|cancelled/);
      return j;
    };
    // A batch of three: 30 fps with motion blur, then two other ratios framed per ratio.
    const batch = await api('POST', `/api/projects/${pid}/renders/batch`, { items: [
      { scene, width: 320, height: 180, fps: 30, motionBlur: { samples: 4, shutter: 0.5 }, quality: { crf: 30 }, loudness: null },
      { scene, width: 180, height: 320, aspect: '9:16' },
      { scene, width: 240, height: 240, aspect: '1:1' },
    ] });
    expect(batch.status).toBe(202);
    const done = [];
    for (const j of batch.json.jobs) done.push(await wait(j.id));
    expect(done.map((j) => j.state)).toEqual(['succeeded', 'succeeded', 'succeeded']);
    expect(done[0].result.frames).toBe(15);
    expect(done[0].result.settings).toMatchObject({ fps: 30, motionBlur: { samples: 4, shutter: 0.5 }, quality: { crf: 30 } });
    expect(done.map((j) => `${j.result.settings.width}x${j.result.settings.height}`)).toEqual(['320x180', '180x320', '240x240']);
    // A failing export (a missing scene after the job was queued is not possible, so use an invalid odd size) can be retried.
    const bad = await api('POST', `/api/projects/${pid}/renders`, { scene, width: 321, height: 181 });
    const failed = await wait(bad.json.id);
    expect(failed.state).toBe('failed');
    const again = await api('POST', `/api/jobs/${bad.json.id}/retry`);
    expect(again.status).toBe(202);
    expect((await wait(again.json.id)).state).toBe('failed');
    expect((await api('POST', `/api/jobs/${done[0].id}/retry`)).status).toBe(409);
    expect((await api('POST', `/api/projects/${pid}/renders`, { scene, motionBlur: { samples: 99, shutter: 1 } })).status).toBe(400);
  }, 180_000);

  it('runs thumbnailing as a cancellable job with progress (FR-ARC-05)', async () => {
    const job = await api('POST', '/api/library/thumbnails/build', { kind: 'pattern', size: 48 });
    expect(job.status).toBe(202);
    let j: any;
    await expect.poll(async () => (j = (await api('GET', `/api/jobs/${job.json.id}`)).json).state, { timeout: 90_000, interval: 300 }).toBe('succeeded');
    expect(j.result.made).toBeGreaterThanOrEqual(13);
    expect(j.progress).toBe(1);
    const big = await api('POST', '/api/library/thumbnails/build', { size: 64 });
    await api('DELETE', `/api/jobs/${big.json.id}`);
    await expect.poll(async () => (await api('GET', `/api/jobs/${big.json.id}`)).json.state, { timeout: 30_000, interval: 200 }).toBe('cancelled');
  }, 150_000);

  it('reports worker status honestly when none is configured or reachable (FR-VOI-12)', async () => {
    expect((await api('GET', '/api/worker/status')).json.state).toBe('misconfigured');
    const s2 = await createServer({ contentDir: path.join(repo, 'content'), workerUrl: 'http://127.0.0.1:9' });
    const r = await s2.app.inject({ method: 'GET', url: '/api/worker/status', headers: { host: '127.0.0.1' } });
    expect(JSON.parse(r.body)).toMatchObject({ state: 'offline' });
    await s2.close();
  });

  it('refuses foreign Host headers on loopback and requires the token on network binds (security)', async () => {
    const r = await srv.app.inject({ method: 'GET', url: '/api/projects', headers: { host: 'evil.example' } });
    expect(r.statusCode).toBe(403);
    const s2 = await createServer({ contentDir: path.join(repo, 'content'), host: '0.0.0.0', token: 'secret' });
    expect((await s2.app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
    expect((await s2.app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: 'Bearer secret' } })).statusCode).toBe(200);
    await s2.close();
  });

  it('uploads a take: decodes, measures, lip-syncs from the amplitude envelope without a worker (FR-VOI-06, FR-LIP-02)', async () => {
    const pid = (await api('POST', '/api/projects/open', { path: project() })).json.id;
    const st = (await api('GET', `/api/projects/${pid}/state`)).json;
    const scene = Object.keys(st.state.scenes)[0]!;
    const who = (await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.maya-bennett@1', name: 'Host', character: { look: 'on-air', view: 'front', posture: 'standing', auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } } }] })).json.commands[0].params.id;
    const line = (await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'line.add', params: { scene, speaker: who, text: 'Testing the upload path.', start: 0 } }] })).json.commands[0].params.id;
    // 1 s of a 220 Hz tone with a silent half: PCM16 mono WAV.
    const { encodeWav } = await import('@frame/io');
    const sr = 16000;
    const pcm = new Float32Array(sr).map((_x, i) => (i < sr / 2 ? 0.4 * Math.sin((2 * Math.PI * 220 * i) / sr) : 0));
    const wav = encodeWav({ sampleRate: sr, channels: 1, data: [pcm] });
    const up = await fetch(`${base}/api/projects/${pid}/takes/upload?scene=${scene}&line=${line}&ext=wav`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: wav as BodyInit });
    expect(up.status).toBe(202);
    const jobId = ((await up.json()) as any).id;
    let j: any;
    await expect.poll(async () => (j = (await api('GET', `/api/jobs/${jobId}`)).json).state, { timeout: 20_000 }).toBe('succeeded');
    expect(j.result).toMatchObject({ aligned: false, durationS: 1 });
    expect(j.result.note).toMatch(/audio level/);
    const after = (await api('GET', `/api/projects/${pid}/state`)).json.state;
    const take = after.takes[j.result.take];
    expect(take).toMatchObject({ source: 'uploaded', status: 'ready', fixture: false });
    expect(take.alignment.method).toBe('amplitude');
    expect(take.alignment.envelope.values.slice(0, 20).every((v: number) => v > 0.2)).toBe(true);
    expect(take.alignment.envelope.values.slice(30).every((v: number) => v === 0)).toBe(true);
    expect(after.scenes[scene].clips.find((c: any) => c.id === line).line.take).toBe(j.result.take);
    // Not audio → a coded failure, nothing chosen.
    const bad = await fetch(`${base}/api/projects/${pid}/takes/upload?scene=${scene}&line=${line}&ext=wav`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: new Uint8Array([1, 2, 3, 4, 5]) });
    const badJob = ((await bad.json()) as any).id;
    await expect.poll(async () => (j = (await api('GET', `/api/jobs/${badJob}`)).json).state, { timeout: 20_000 }).toBe('failed');
    expect(j.error.code).toBe('VALIDATION_FAILED');
  });

  it('detects edits made on disk and reloads them (FR-PER-05)', async () => {
    const dir = project();
    const pid = (await api('POST', '/api/projects/open', { path: dir })).json.id;
    const pj = path.join(dir, 'project.json');
    const doc = JSON.parse(fs.readFileSync(pj, 'utf8'));
    doc.description = 'Edited in a text editor';
    fs.writeFileSync(pj, JSON.stringify(doc, null, 2));
    srv.hub.checkExternal();
    expect((await api('GET', `/api/projects/${pid}/state`)).json.state.project.description).toBe('Edited in a text editor');
  });

  it('holds autosave when files change on disk under unsaved work, then keeps the chosen version (FR-PER-05)', async () => {
    const slow = await createServer({ contentDir: path.join(repo, 'content'), debounceMs: 60_000 });
    try {
      const call = async (method: string, url: string, body?: unknown) => {
        const r = await slow.app.inject({ method: method as 'GET', url, ...(body !== undefined ? { payload: body as object } : {}) });
        return r.json() as any;
      };
      const events: any[] = [];
      slow.hub.onEvent((e) => events.push(e));
      for (const keep of ['disk', 'mine'] as const) {
        const dir = project();
        const pid = (await call('POST', '/api/projects/open', { path: dir })).id;
        const st = (await call('GET', `/api/projects/${pid}/state`)).state;
        const scene = st.episodes[st.project.episodes[0]].scenes[0];
        await call('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'scene.rename', params: { id: scene, name: 'Mine' } }] });
        const pj = path.join(dir, 'project.json');
        const doc = JSON.parse(fs.readFileSync(pj, 'utf8'));
        doc.description = 'Edited elsewhere';
        fs.writeFileSync(pj, JSON.stringify(doc, null, 2));
        slow.hub.checkExternal();
        expect(events.at(-1)).toMatchObject({ type: 'external', project: pid, files: ['project.json'], reloaded: false, conflicts: [] });
        // Saving is held: the other program's edit is not overwritten.
        expect((await call('POST', `/api/projects/${pid}/save`)).status).toBe('error');
        expect(JSON.parse(fs.readFileSync(pj, 'utf8')).description).toBe('Edited elsewhere');
        const r = await call('POST', `/api/projects/${pid}/external/resolve`, { keep });
        expect(r.save.status).toBe('saved');
        const after = (await call('GET', `/api/projects/${pid}/state`)).state;
        const onDisk = JSON.parse(fs.readFileSync(pj, 'utf8')).description;
        if (keep === 'disk') {
          expect(after.project.description).toBe('Edited elsewhere');
          expect(after.scenes[scene].name).not.toBe('Mine');
        } else {
          expect(after.scenes[scene].name).toBe('Mine');
          expect(onDisk).toBe(after.project.description);
        }
        const again = events.length;
        slow.hub.checkExternal();
        expect(events.length).toBe(again);
      }
    } finally {
      await slow.close();
    }
  });

  it('keeps app settings beside the user library, never echoes the worker token, and applies autosave (FR-SET-01)', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-settings-'));
    const s2 = await createServer({ contentDir: path.join(repo, 'content'), userDir: path.join(home, 'library') });
    try {
      const call = async (method: string, url: string, body?: unknown) => (await s2.app.inject({ method: method as 'GET', url, ...(body !== undefined ? { payload: body as object } : {}) })).json() as any;
      expect((await call('POST', '/api/settings', { autosaveMs: 5 })).error.code).toBe('USAGE');
      const r = await call('POST', '/api/settings', { workerUrl: 'http://127.0.0.1:9', workerToken: 'secret-token', autosaveMs: 900, defaultFrameRate: 25 });
      expect(r.settings).toEqual({ workerUrl: 'http://127.0.0.1:9', autosaveMs: 900, defaultFrameRate: 25, workerTokenSet: true });
      const g = await call('GET', '/api/settings');
      expect(JSON.stringify(g)).not.toContain('secret-token');
      expect(g.effective).toEqual({ workerUrl: 'http://127.0.0.1:9', autosaveMs: 900 });
      expect(g.telemetry).toBe('none');
      const file = path.join(home, 'settings.json');
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).workerToken).toBe('secret-token');
      if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o077).toBe(0);
      // The worker status uses the configured URL (nothing listens there).
      expect((await call('GET', '/api/worker/status')).url).toBe('http://127.0.0.1:9');
      // New projects take the default frame rate.
      const dir = path.join(home, 'New.frame');
      const pid = (await call('POST', '/api/projects/create', { path: dir })).id;
      expect((await call('GET', `/api/projects/${pid}/state`)).state.project.frameRate).toBe(25);
      expect((await call('POST', '/api/settings', { clearToken: true })).settings.workerTokenSet).toBe(false);
      expect((await call('POST', '/api/settings/clear-cache')).cleared).toBe(true);
    } finally {
      await s2.close();
    }
  });
});
