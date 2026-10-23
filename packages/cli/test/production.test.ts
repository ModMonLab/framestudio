import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CliEnvelope, CliMutation, check, issues } from '@frame/schema';
import { runCli } from '../src/index.js';

async function frame(args: string[], cwd: string, env: Record<string, string> = {}) {
  let out = '';
  let err = '';
  const code = await runCli([...args, '--json'], { stdout: (s) => (out += s), stderr: (s) => (err += s), stdin: async () => '', cwd, env: { FRAME_USER_DIR: path.join(cwd, '..', 'user-lib'), ...env } });
  const json = JSON.parse(out);
  // Every --json output is a published envelope (FR-CLI-07).
  expect(issues(CliEnvelope, json)).toEqual([]);
  return { code, json, err };
}

const first = async (cwd: string, query: string) => (await frame(['assets', 'search', query, '--limit', '1'], cwd)).json.result.results[0].ref as string;

describe('frame CLI command groups (FR-CLI-05)', () => {
  it('stages, directs, undoes across runs, diffs revisions and renders a turnaround', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-cli-prod-'));
    expect((await frame(['init', 'Show.frame', '--name', 'Show'], root)).code).toBe(0);
    const cwd = path.join(root, 'Show.frame');
    const opened = await frame(['open'], cwd);
    expect(opened.json.result.name).toBe('Show');
    const rev0 = opened.json.result.revision;

    const chr = await first(cwd, 'type:chr');
    const placed = await frame(['place', chr, '--at', '700,1000', '--name', 'Ana'], cwd);
    expect(placed.code, JSON.stringify(placed.json)).toBe(0);
    expect(check(CliMutation, placed.json.result)).toBe(true);
    const prop = await first(cwd, 'type:prop');
    expect((await frame(['place', prop, '--at', '1300,900', '--depth', 'mid', '--name', 'Thing'], cwd)).code).toBe(0);
    expect((await frame(['move', 'Thing', '--by', '20,-10'], cwd)).code).toBe(0);
    const line = await frame(['line', 'add', '--speaker', 'Ana', '--text', 'Hello there.', '--at', '0.5'], cwd);
    expect(line.code, JSON.stringify(line.json)).toBe(0);
    const lineId = line.json.result.line;
    expect((await frame(['line', 'set', lineId, '--emotion', 'happy', '--pace', '1.1'], cwd)).code).toBe(0);
    const act = await first(cwd, 'type:act');
    const a = await frame(['act', 'add', act, '--who', 'Ana', '--at', '1', '--dur', '1.5'], cwd);
    expect(a.code, JSON.stringify(a.json)).toBe(0);
    const exp = await first(cwd, 'type:exp');
    expect((await frame(['face', 'add', exp, '--who', 'Ana', '--at', '0'], cwd)).code).toBe(0);
    expect((await frame(['look-at', 'Thing', '--who', 'Ana', '--at', '2', '--dur', '1'], cwd)).code).toBe(0);
    const music = await first(cwd, 'type:music');
    expect((await frame(['sound', 'add', music, '--gain', '-6'], cwd)).code).toBe(0);
    // A sound is not an action: refused with a usage error.
    expect((await frame(['act', 'add', music, '--who', 'Ana'], cwd)).code).toBe(1);
    const cam = await frame(['camera', 'add', '--name', 'Close', '--center', '700,500', '--width', '800'], cwd);
    expect(cam.code).toBe(0);
    expect((await frame(['camera', 'set', 'Close', 'width=900', 'center.x=720'], cwd)).code).toBe(0);
    expect((await frame(['shot', 'add', 'Close', '--at', '0', '--dur', '2'], cwd)).code).toBe(0);

    const show = (await frame(['scene', 'show', (await frame(['scene', 'list'], cwd)).json.result.scenes[0].id], cwd)).json.result;
    const thing = show.instances.find((i: any) => i.name === 'Thing');
    expect(thing.transform).toMatchObject({ x: 1320, y: 890 });
    expect(thing.depthPlane).toBe('mid');
    const camera = show.cameras.find((c: any) => c.name === 'Close');
    expect(camera).toMatchObject({ width: 900, center: { x: 720, y: 500 } });
    const gaze = show.clips.find((c: any) => c.params?.target === thing.id);
    expect(gaze).toBeTruthy();
    expect(show.clips.find((c: any) => c.id === lineId).line.delivery).toMatchObject({ emotion: 'happy', pace: 1.1 });

    // Undo works across separate CLI runs (the stack is kept with the project), and redo restores.
    const before = (await frame(['info'], cwd)).json.result.revision;
    const u = await frame(['undo'], cwd);
    expect(u.code, JSON.stringify(u.json)).toBe(0);
    expect(u.json.result.label).toMatch(/shot|Close|Add/i);
    const r = await frame(['redo'], cwd);
    expect(r.code).toBe(0);
    expect(r.json.result.revision).toBeGreaterThan(before);

    const diff = (await frame(['diff', String(rev0)], cwd)).json.result;
    expect(diff.commands['instance.add']).toBeGreaterThanOrEqual(2);
    expect(diff.commands['clip.add']).toBeGreaterThanOrEqual(4);

    // Characters: create, change as a new version, add a look, render a turnaround.
    const created = await frame(['char', 'create', '--from', chr, '--name', 'Robin'], cwd);
    expect(created.code, JSON.stringify(created.json)).toBe(0);
    const ref = created.json.result.ref as string;
    const set = await frame(['char', 'set', ref, 'colors.hair=#3a2a20', 'role=Host'], cwd);
    expect(set.code, JSON.stringify(set.json)).toBe(0);
    expect(set.json.result.ref).toMatch(/@2$/);
    const look = await frame(['char', 'look', 'add', set.json.result.ref, 'evening', 'name=Evening', 'colors.top=#202840'], cwd);
    expect(look.code, JSON.stringify(look.json)).toBe(0);
    const office = await frame(['char', 'look', 'add', look.json.result.ref, 'office', 'preset=look.office'], cwd);
    expect(office.code, JSON.stringify(office.json)).toBe(0);
    const sheet = await frame(['char', 'sheet', look.json.result.ref, '--out', 'robin.png', '--width', '640'], cwd);
    expect(sheet.code, JSON.stringify(sheet.json)).toBe(0);
    const png = fs.readFileSync(path.join(cwd, 'robin.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');

    // Voice and worker without a worker: listed honestly, never faked.
    const voices = (await frame(['voice', 'list'], cwd)).json.result.voices;
    expect(Array.isArray(voices)).toBe(true);
    expect((await frame(['worker', 'status'], cwd)).json.result.state).toBe('misconfigured');
    const gen = await frame(['takes', 'generate', lineId], cwd);
    expect(gen.json.error.code).toBe('WORKER_UNAVAILABLE');
    const clone = await frame(['voice', 'create', '--name', 'X', '--from-audio', 'nope.wav'], cwd);
    expect(clone.json.error.code).toBe('CONSENT_REQUIRED');
    expect((await frame(['jobs', 'list'], cwd)).code).toBe(1);
  }, 120_000);
});

const WORKER = process.env.FRAME_TEST_WORKER_URL;
describe.skipIf(!WORKER)('frame CLI voice group with the Voice Worker (FR-CLI-05, fixture engine: not real speech)', () => {
  it('designs, saves and assigns a voice, builds a range, generates, chooses and re-aligns takes in local mode', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-cli-voice-'));
    await frame(['init', 'Show.frame', '--name', 'Show'], root);
    const cwd = path.join(root, 'Show.frame');
    const env = { FRAME_WORKER_URL: WORKER! };
    expect((await frame(['worker', 'doctor'], cwd, env)).json.result.state).toBe('connected');
    const chr = await first(cwd, 'type:chr');
    await frame(['place', chr, '--name', 'Ana'], cwd);
    const sid = (await frame(['scene', 'list'], cwd)).json.result.scenes[0].id;
    const ana = (await frame(['scene', 'show', sid], cwd)).json.result.instances.find((i: any) => i.name === 'Ana').id;
    const line = (await frame(['line', 'add', '--speaker', 'Ana', '--text', 'Good morning, everyone.'], cwd)).json.result.line;
    const d = await frame(['voice', 'design', '--description', 'Warm narrator in her forties', '--line', 'Good morning, everyone. Thanks for joining us for another long and wonderful show today.', '--candidates', '2', '--seed', '3'], cwd, env);
    expect(d.code, JSON.stringify(d.json)).toBe(0);
    expect(d.json.result.candidates).toHaveLength(2);
    const v = await frame(['voice', 'create', '--name', 'Narrator', '--from-candidate', '1', '--assign', `${sid}/${ana}`], cwd, env);
    expect(v.code, JSON.stringify(v.json)).toBe(0);
    const range = await frame(['voice', 'range', 'build', v.json.result.ref, '--emotions', 'happy', '--min-similarity', '0', '--update-users'], cwd, env);
    expect(range.code, JSON.stringify(range.json)).toBe(0);
    expect(range.json.result.ref).toMatch(/@2$/);
    const g = await frame(['takes', 'generate', line, '--takes', '2', '--seed', '5'], cwd, env);
    expect(g.code, JSON.stringify(g.json)).toBe(0);
    const takes = g.json.result.takes.map((t: any) => t.take);
    expect(takes, JSON.stringify(g.json)).toHaveLength(2);
    expect(g.json.result.takes.every((t: any) => t.status === 'ready'), JSON.stringify(g.json)).toBe(true);
    const ch = await frame(['takes', 'choose', line, '2'], cwd);
    expect(ch.code, JSON.stringify(ch.json)).toBe(0);
    const show = (await frame(['scene', 'show', sid], cwd)).json.result;
    expect(show.clips.find((c: any) => c.id === line).line.take).toBe(takes[1]);
    const al = await frame(['align', takes[0]], cwd, env);
    expect(al.code, JSON.stringify(al.json)).toBe(0);
    expect(al.json.result.words).toBeGreaterThan(0);
  }, 180_000);
});
