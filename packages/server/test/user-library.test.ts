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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'frame-userlib-'));
function project(name: string, seed: number): string {
  const dir = path.join(tmp(), `${name}.frame`);
  OpenProject.create(dir, { name, styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', newId: sequentialIds(seed), seed: 1 }).close();
  return dir;
}

let srv: FrameServer;
let base: string;
const userDir = path.join(tmp(), 'library');
beforeAll(async () => {
  srv = await createServer({ contentDir: path.join(repo, 'content'), userDir, debounceMs: 20 });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
});
afterAll(async () => srv.close());
const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};

describe('user library, favourites and collections (FR-AST-01/06)', () => {
  it('saves a project character and an imported image to the user library and uses them in another project', async () => {
    const a = (await api('POST', '/api/projects/open', { path: project('A', 0) })).json.id as string;
    const b = (await api('POST', '/api/projects/open', { path: project('B', 700) })).json.id as string;
    const chr = (await api('POST', `/api/projects/${a}/characters`, { spec: { name: 'Robin', from: 'chr.aiko-tanaka@1' } })).json.ref as string;
    const imgRes = await fetch(`${base}/api/projects/${a}/import?name=logo.png&rights=own`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from(await (await fetch(`${base}/api/library/thumbnail?ref=chr.aiko-tanaka@1&w=32`)).arrayBuffer()) });
    const img = ((await imgRes.json()) as { asset: string }).asset;
    expect(img).toMatch(/^user\./);
    const saved = await api('POST', `/api/projects/${a}/library/save`, { refs: [chr, img] });
    expect(saved.status).toBe(200);
    expect(saved.json.added.sort()).toEqual([chr, img].sort());
    expect(fs.existsSync(path.join(userDir, `${chr}.json`))).toBe(true);
    expect(fs.readdirSync(path.join(userDir, 'media')).length).toBe(1);
    expect((await api('POST', `/api/projects/${a}/library/save`, { refs: [chr] })).json.unchanged).toEqual([chr]);

    // Another project sees them as "user" assets; using one copies it (and its media) into the project.
    const found = await api('GET', `/api/library?q=Robin&project=${b}`);
    expect(found.json.results[0]).toMatchObject({ ref: chr, source: 'user' });
    const adopted = await api('POST', `/api/projects/${b}/library/adopt`, { refs: [img] });
    expect(adopted.json.added).toEqual([img]);
    const st = (await api('GET', `/api/projects/${b}/state`)).json.state;
    expect(st.assets[img]).toBeDefined();
    const media = st.assets[img].data.image.media.hash as string;
    expect((await fetch(`${base}/api/projects/${b}/media/${media}`)).status).toBe(200);
    expect((await api('POST', `/api/projects/${b}/library/adopt`, { refs: [img] })).json.added).toEqual([]);
  });

  it('stores favourites and named collections', async () => {
    expect((await api('GET', '/api/user/prefs')).json).toEqual({ schemaVersion: 1, favourites: [], collections: [] });
    const put = await api('PUT', '/api/user/prefs', { favourites: ['hair.afro', 'hair.afro'], collections: [{ id: 'c1', name: ' Podcast set ', items: ['prop.mug'] }] });
    expect(put.json).toEqual({ schemaVersion: 1, favourites: ['hair.afro'], collections: [{ id: 'c1', name: 'Podcast set', items: ['prop.mug'] }] });
    expect((await api('GET', '/api/user/prefs')).json.collections[0].name).toBe('Podcast set');
    expect((await api('PUT', '/api/user/prefs', { favourites: [], collections: [{ id: 'x', name: '' }] })).status).toBe(400);
  });
});
