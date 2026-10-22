import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sequentialIds } from '@frame/core';
import { OpenProject } from '@frame/io';
import { createServer, type FrameServer } from '../src/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let srv: FrameServer;
let base: string;
beforeAll(async () => {
  srv = await createServer({ contentDir: path.join(repo, 'content'), debounceMs: 20 });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
});
afterAll(async () => srv.close());
const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};

describe('part editor saves (FR-PED-02/05)', () => {
  it('saves a new part from a library part, versions it, and keeps failing parts as unusable drafts', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-parts-')), 'P.frame');
    OpenProject.create(dir, { name: 'P', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-720p@1', width: 1280, height: 720, aspectRatios: ['16:9'] }, appVersion: '0.1.0', newId: sequentialIds(300), seed: 1 }).close();
    const pid = (await api('POST', '/api/projects/open', { path: dir })).json.id as string;
    const hair = (await api('GET', `/api/library/manifest?ref=hair.afro@1&project=${pid}`)).json;
    const data = JSON.parse(JSON.stringify(hair.data));
    const front = data.families.flat.views.front;
    const k = Object.keys(front.points)[0];
    front.points[k].p = [front.points[k].p[0] + 0.05, front.points[k].p[1]];
    const saved = await api('POST', `/api/projects/${pid}/parts`, { from: 'hair.afro@1', name: 'Afro (tall)', data });
    expect(saved.json).toMatchObject({ isNew: true, draft: false });
    expect(saved.json.ref).toMatch(/^user\..+@1$/);
    const m = (await api('GET', `/api/library/manifest?ref=${encodeURIComponent(saved.json.ref)}&project=${pid}`)).json;
    expect(m).toMatchObject({ kind: 'hair', name: 'Afro (tall)', provenance: { method: 'authored' } });
    expect(m.provenance.notes).toContain('hair.afro@1');
    const v2 = await api('POST', `/api/projects/${pid}/parts`, { from: saved.json.ref, name: 'Afro (tall)', data, changes: 'Same, saved again' });
    expect(v2.json.ref).toBe(saved.json.ref.replace(/@1$/, '@2'));

    // A broken part: refused as usable, accepted as a draft that the library will not apply.
    const broken = JSON.parse(JSON.stringify(data));
    delete broken.families.illustrated;
    const refused = await api('POST', `/api/projects/${pid}/parts`, { from: saved.json.ref, name: 'Broken', data: broken, asNew: true });
    expect(refused.status).toBe(422);
    const draft = await api('POST', `/api/projects/${pid}/parts`, { from: saved.json.ref, name: 'Broken', data: broken, asNew: true, draft: true });
    expect(draft.json.draft).toBe(true);
    const found = await api('GET', `/api/library?q=Broken&project=${pid}`);
    expect(found.json.results[0].incompatible).toMatch(/^Draft part/);
  });
});
