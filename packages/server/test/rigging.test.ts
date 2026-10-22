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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'frame-rigging-'));

let srv: FrameServer;
let base: string;
beforeAll(async () => {
  srv = await createServer({ contentDir: path.join(repo, 'content'), userDir: path.join(tmp(), 'library'), debounceMs: 20 });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
});
afterAll(async () => srv.close());
const api = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: res.status, json: (await res.json()) as any };
};
const read = async (pid: string, name: string, svg: string) =>
  (await (await fetch(`${base}/api/projects/${pid}/rigging/read?name=${name}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: Buffer.from(svg) })).json()) as any;

describe('rigging assistant: props and sets (FR-IMP-03)', () => {
  it('builds a prop with states and a location kit, places them and renders without issues', async () => {
    const dir = path.join(tmp(), 'Rig.frame');
    OpenProject.create(dir, { name: 'Rig', styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', newId: sequentialIds(0), seed: 1 }).close();
    const pid = (await api('POST', '/api/projects/open', { path: dir })).json.id as string;
    let st = (await api('GET', `/api/projects/${pid}/state`)).json.state;
    const scene = st.episodes[st.project.episodes[0]].scenes[0];

    const lamp = await read(pid, 'lamp.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><g id="stand"><rect x="90" y="100" width="20" height="300" fill="#3c3c3c"/></g><g id="state_on"><rect x="40" y="20" width="120" height="90" fill="#fadc5a"/></g><g id="state_off"><rect x="40" y="20" width="120" height="90" fill="#5a5a78"/></g></svg>');
    expect(lamp.layers.map((l: any) => l.propSuggestion)).toEqual(['always', 'state:on', 'state:off']);
    const body = { kind: 'prop', name: 'Lamp', fileName: 'lamp.svg', rights: 'I drew this', layers: lamp.layers, mapping: {}, height: 300 };
    const dry = await api('POST', `/api/projects/${pid}/rigging/build`, body);
    expect(dry.status).toBe(200);
    expect(dry.json).toMatchObject({ ok: true, states: ['on', 'off'] });
    const saved = await api('POST', `/api/projects/${pid}/rigging/build`, { ...body, save: true, place: { scene, x: 640, y: 680 } });
    expect(saved.status).toBe(200);
    expect(saved.json.instances).toHaveLength(1);

    const office = await read(pid, 'office.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><g id="Sky"><rect x="0" y="0" width="640" height="200" fill="#78aae6"/></g><g id="Floor"><rect x="0" y="260" width="640" height="100" fill="#966e46"/></g><g id="Desk"><rect x="240" y="200" width="160" height="90" fill="#5a3c28"/></g></svg>');
    expect(office.layers.map((l: any) => l.planeSuggestion)).toEqual(['far', 'ground', 'mid']);
    const set = await api('POST', `/api/projects/${pid}/rigging/build`, { kind: 'set', name: 'Office', fileName: 'office.svg', rights: 'I drew this', layers: office.layers, mapping: {}, width: office.width, artHeight: office.height, save: true, place: { scene } });
    expect(set.status).toBe(200);
    expect(set.json.instances).toHaveLength(3);

    // Missing rights are refused.
    expect((await api('POST', `/api/projects/${pid}/rigging/build`, { ...body, rights: '' })).status).toBe(400);

    st = (await api('GET', `/api/projects/${pid}/state`)).json.state;
    const inst = st.scenes[scene].instances;
    expect(inst.filter((i: any) => i.kind === 'set-piece').map((i: any) => i.depthPlane)).toEqual(['far', 'ground', 'mid']);
    const problems = (await api('GET', `/api/projects/${pid}/validate`)).json;
    expect(JSON.stringify(problems)).not.toMatch(/not found/);
    const frame = await fetch(`${base}/api/projects/${pid}/frame?scene=${scene}&width=320&height=180`);
    expect(frame.status).toBe(200);
    expect(frame.headers.get('content-type')).toBe('image/png');
  });
});
