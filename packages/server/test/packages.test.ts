import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sequentialIds } from '@frame/core';
import { OpenProject } from '@frame/io';
import { createServer, type FrameServer } from '../src/index.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUTPUT = { preset: 'out.landscape-720p@1', width: 1280, height: 720, aspectRatios: ['16:9'] };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'frame-srv-pkg-'));
function project(name: string): string {
  const dir = path.join(tmp(), `${name}.frame`);
  OpenProject.create(dir, { name, styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', newId: sequentialIds(name === 'A' ? 0 : 500), seed: 1 }).close();
  return dir;
}

let srv: FrameServer;
let base: string;
beforeAll(async () => {
  srv = await createServer({ contentDir: path.join(repo, 'content'), debounceMs: 20 });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
});
afterAll(async () => srv.close());

const json = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};
const bytes = async (url: string) => {
  const res = await fetch(base + url);
  return { status: res.status, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition'), data: new Uint8Array(await res.arrayBuffer()) };
};
const upload = async (url: string, data: Uint8Array) => {
  const res = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/zip' }, body: data });
  return { status: res.status, json: (await res.json()) as any };
};

describe('package endpoints (FR-DAT-10/11, FR-IMP-04)', () => {
  it('exports a character from one project, imports it into another, and opens a project package as a new folder', async () => {
    const a = (await json('POST', '/api/projects/open', { path: project('A') })).json.id as string;
    const b = (await json('POST', '/api/projects/open', { path: project('B') })).json.id as string;
    const made = await json('POST', `/api/projects/${a}/characters`, { spec: { name: 'Robin', from: 'chr.aiko-tanaka@1' } });
    expect(made.status).toBe(200);
    const ref = made.json.ref as string;

    const pkg = await bytes(`/api/projects/${a}/packages/export?format=framechar&refs=${encodeURIComponent(ref)}`);
    expect(pkg.status).toBe(200);
    expect(pkg.type).toBe('application/zip');
    expect(pkg.disposition).toContain('robin.framechar');

    const dry = await upload(`/api/projects/${b}/packages/import?dryRun=true`, pkg.data);
    expect(dry.json.added).toEqual([ref]);
    const imp = await upload(`/api/projects/${b}/packages/import`, pkg.data);
    expect(imp.status).toBe(200);
    expect((await json('GET', `/api/library/manifest?ref=${encodeURIComponent(ref)}&project=${b}`)).json.name).toBe('Robin');
    // A damaged package is refused with a coded error.
    const broken = pkg.data.slice(0, 100);
    const bad = await upload(`/api/projects/${b}/packages/import`, broken);
    expect(bad.status).toBe(422);
    expect(bad.json.error.code).toBe('INVALID_PACKAGE');

    const proj = await bytes(`/api/projects/${a}/package`);
    expect(proj.disposition).toContain('a.frameproj');
    const dest = path.join(tmp(), 'Copy.frame');
    const opened = await upload(`/api/projects/import-package?path=${encodeURIComponent(dest)}`, proj.data);
    expect(opened.status).toBe(200);
    expect(opened.json.name).toBe('A');
    const st = await json('GET', `/api/projects/${opened.json.id}/state`);
    expect(Object.keys(st.json.state.assets)).toContain(ref);
  });
});
