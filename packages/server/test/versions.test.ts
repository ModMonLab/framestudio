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

describe('character versions and project versions (FR-CHR-10, FR-AST-05, FR-PER-03; AC-11 path)', () => {
  it('saves a new character version, updates one scene only, survives reopen, and restores a project snapshot', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-ver-')), 'Series.frame');
    OpenProject.create(dir, { name: 'Series', styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', newId: sequentialIds(900), seed: 1 }).close();
    const pid = (await api('POST', '/api/projects/open', { path: dir })).json.id as string;
    let st = (await api('GET', `/api/projects/${pid}/state`)).json.state;
    const ep1 = st.project.episodes[0];
    const scene1 = st.episodes[ep1].scenes[0];
    const made = await api('POST', `/api/projects/${pid}/characters`, { spec: { name: 'Robin', from: 'chr.aiko-tanaka@1' }, place: { scene: scene1 } });
    const v1 = made.json.ref as string;
    // Use the character in a second episode too.
    const ep2 = await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'episode.add', params: { name: 'Episode 2' } }] });
    expect(ep2.status).toBe(200);
    st = (await api('GET', `/api/projects/${pid}/state`)).json.state;
    const scene2 = st.episodes[st.project.episodes[1]].scenes[0];
    await api('POST', `/api/projects/${pid}/commands`, { commands: [{ name: 'instance.add', params: { scene: scene2, kind: 'character', asset: v1, name: 'Robin', character: { look: 'casual', view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }] });
    const snap = await api('POST', `/api/projects/${pid}/versions`, { name: 'Before redesign' });
    expect(snap.status).toBe(200);

    // Version 2: new hair and a single look; only scene 2 switches.
    const saved = await api('POST', `/api/projects/${pid}/characters/versions`, {
      from: v1, spec: { parts: { hair: 'hair.afro@1' }, looks: [{ id: 'studio', name: 'Studio', garments: [], accessories: [], colors: {} }], changes: 'New hair' },
      update: { scope: 'scene', scene: scene2 },
    });
    expect(saved.status).toBe(200);
    expect(saved.json.isNew).toBe(false);
    const v2 = saved.json.ref as string;
    expect(v2).toBe(v1.replace(/@1$/, '@2'));
    st = (await api('GET', `/api/projects/${pid}/state`)).json.state;
    const i1 = st.scenes[scene1].instances.find((i: any) => i.name === 'Robin');
    const i2 = st.scenes[scene2].instances.find((i: any) => i.name === 'Robin');
    expect(i1.asset).toBe(v1);
    expect(i2.asset).toBe(v2);
    expect(i2.character.look).toBe('studio'); // 'casual' does not exist in v2 → default look
    expect(st.assets[v1]).toBeDefined(); // v1 is immutable and kept
    expect(st.assets[v2].changes).toBe('New hair');

    const usages = await api('GET', `/api/library/usages?id=${encodeURIComponent(v1.replace(/@1$/, ''))}`);
    const refs = usages.json.projects[0].usages.map((u: any) => `${u.kind}:${u.ref}`);
    expect(refs).toEqual(expect.arrayContaining([`instance:${v1}`, `instance:${v2}`, `cast:${v1}`]));

    // Version comparison shows the change, survives reopen, and restore is one undoable step.
    const cmp = await api('GET', `/api/projects/${pid}/versions/${snap.json.id}/compare`);
    expect(cmp.json.scenes.find((s: any) => s.id === scene2).versions).toEqual([{ instance: 'Robin', from: v1, to: v2 }]);
    expect(cmp.json.assets.added).toEqual([v2]);
    await api('POST', `/api/projects/${pid}/save`);
    await api('POST', `/api/projects/${pid}/close`);
    const reopened = (await api('POST', '/api/projects/open', { path: dir })).json.id as string;
    st = (await api('GET', `/api/projects/${reopened}/state`)).json.state;
    expect(st.scenes[scene2].instances.find((i: any) => i.name === 'Robin').asset).toBe(v2);
    const restored = await api('POST', `/api/projects/${reopened}/versions/${snap.json.id}/restore`);
    expect(restored.json.label).toBe('Restore version "Before redesign"');
    st = (await api('GET', `/api/projects/${reopened}/state`)).json.state;
    expect(st.scenes[scene2].instances.find((i: any) => i.name === 'Robin').asset).toBe(v1);
    expect(st.assets[v2]).toBeUndefined();
    await api('POST', `/api/projects/${reopened}/undo`);
    st = (await api('GET', `/api/projects/${reopened}/state`)).json.state;
    expect(st.scenes[scene2].instances.find((i: any) => i.name === 'Robin').asset).toBe(v2);

    // A version opens as a separate project (new id and name) with its media.
    const copyDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frame-ver-copy-')), 'Copy.frame');
    const copy = await api('POST', `/api/projects/${reopened}/versions/${snap.json.id}/copy`, { path: copyDir });
    expect(copy.status).toBe(200);
    expect(copy.json.id).not.toBe(reopened);
    expect(copy.json.name).toBe('Series — Before redesign');
    const cst = (await api('GET', `/api/projects/${copy.json.id}/state`)).json.state;
    expect(cst.scenes[scene2].instances.find((i: any) => i.name === 'Robin').asset).toBe(v1);
    expect((await api('POST', `/api/projects/${reopened}/versions/${snap.json.id}/copy`, { path: copyDir })).status).toBe(409);

    // Saving a library character creates a new project character, swapped in where asked.
    const lib = await api('POST', `/api/projects/${reopened}/characters/versions`, { from: 'chr.aiko-tanaka@1', asNew: true, spec: { name: 'Aiko B' } });
    expect(lib.json.isNew).toBe(true);
    expect(lib.json.ref).toMatch(/^user\..+@1$/);
    expect((await api('POST', `/api/projects/${reopened}/characters/versions`, { from: 'chr.aiko-tanaka@1', update: { scope: 'project' } })).status).toBe(400);
  });
});
