import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/index.js';

async function frame(args: string[], cwd: string, stdin = '') {
  let out = '';
  let err = '';
  const code = await runCli(args, { stdout: (s) => (out += s), stderr: (s) => (err += s), stdin: async () => stdin, cwd, env: {} });
  let json: any;
  try {
    json = JSON.parse(out);
  } catch {
    /* human output */
  }
  return { code, out, err, json };
}

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'frame-cli-'));
}

describe('frame CLI (FR-CLI-01..07)', () => {
  it('init creates a project that validates (M0 exit evidence)', async () => {
    const dir = tmp();
    const r = await frame(['init', 'Show.frame', '--name', 'Show', '--family', 'illustrated', '--json'], dir);
    expect(r.code).toBe(0);
    expect(r.json.result.styleFamily).toBe('illustrated');
    const v = await frame(['validate', '--json', '--project', 'Show.frame'], dir);
    expect(v.code).toBe(0);
    expect(v.json.result.valid).toBe(true);
  });

  it('finds the project from the working directory and supports --dry-run', async () => {
    const dir = tmp();
    await frame(['init', 'Show.frame'], dir);
    const cwd = path.join(dir, 'Show.frame');
    const dry = await frame(['scene', 'add', 'Intro', '--dry-run', '--json'], cwd);
    expect(dry.json.result.dryRun).toBe(true);
    expect(dry.json.result.commands[0].name).toBe('scene.add');
    const list = await frame(['scene', 'list', '--json'], cwd);
    expect(list.json.result.scenes).toHaveLength(1);
    await frame(['scene', 'add', 'Intro', '--duration', '12'], cwd);
    const list2 = await frame(['scene', 'list', '--json'], cwd);
    expect(list2.json.result.scenes.map((s: any) => s.name)).toEqual(['Scene 1', 'Intro']);
  });

  it('uses documented exit codes and structured errors', async () => {
    const dir = tmp();
    expect((await frame(['bogus'], dir)).code).toBe(1);
    const nf = await frame(['info', '--json'], dir);
    expect(nf.code).toBe(4);
    expect(nf.json.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(nf.json.error.hint).toBeTruthy();
    await frame(['init', 'P'], dir);
    const bad = await frame(['scene', 'duration', 'scn_missing01', '5', '--project', 'P', '--json'], dir);
    expect(bad.code).toBe(4);
  });

  it('apply is atomic and honours --base-revision (exit 3 on conflict)', async () => {
    const dir = tmp();
    await frame(['init', 'P'], dir);
    const info = (await frame(['info', '--json', '--project', 'P'], dir)).json.result;
    const scene = info.episodes[0].scenes[0].id;
    const ok = await frame(['apply', '-', '--project', 'P', '--json'], dir, JSON.stringify([{ name: 'scene.rename', params: { id: scene, name: 'A' } }]));
    expect(ok.json.result.revision).toBe(1);
    const atomic = await frame(['apply', '-', '--project', 'P', '--json'], dir, JSON.stringify([
      { name: 'scene.rename', params: { id: scene, name: 'B' } },
      { name: 'scene.rename', params: { id: 'scn_missing01', name: 'C' } },
    ]));
    expect(atomic.code).toBe(4);
    expect((await frame(['info', '--json', '--project', 'P'], dir)).json.result.episodes[0].scenes[0].name).toBe('A');
    await frame(['scene', 'add', 'X', '--project', 'P'], dir);
    const stale = await frame(['apply', '-', '--project', 'P', '--json', '--base-revision', '1'], dir, JSON.stringify([{ name: 'scene.add', params: { episode: info.episodes[0].id, name: 'Y' } }]));
    expect(stale.code).toBe(3);
    expect(stale.json.error.code).toBe('REVISION_CONFLICT');
  });

  it('describe and schema are machine-readable (FR-CLI-03)', async () => {
    const dir = tmp();
    const d = await frame(['describe', '--json'], dir);
    expect(d.json.result.cli.some((c: any) => c.command === 'apply')).toBe(true);
    expect(d.json.result.engine.some((c: any) => c.name === 'line.add')).toBe(true);
    const s = await frame(['schema', 'scene', '--json'], dir);
    expect(s.json.result.$schema).toContain('json-schema.org');
    expect(s.json.result.properties.clips).toBeTruthy();
    const h = await frame(['scene', 'add', '--help'], dir);
    expect(h.out).toContain('Usage: frame scene add <name>');
  });

  it('settings set changes frame rate via the re-snap command and history records it', async () => {
    const dir = tmp();
    await frame(['init', 'P'], dir);
    const r = await frame(['settings', 'set', 'frameRate=30', 'name="Renamed"', '--project', 'P', '--json'], dir);
    expect(r.code).toBe(0);
    const g = await frame(['settings', 'get', '--project', 'P', '--json'], dir);
    expect(g.json.result).toMatchObject({ frameRate: 30, name: 'Renamed' });
    const h = await frame(['history', '--project', 'P', '--json'], dir);
    expect(h.json.result.entries).toHaveLength(1);
    expect(h.json.result.entries[0].source).toBe('cli');
  });

  it('versions save, list and restore', async () => {
    const dir = tmp();
    await frame(['init', 'P'], dir);
    const v = await frame(['versions', 'save', 'First', '--project', 'P', '--json'], dir);
    const info = (await frame(['info', '--json', '--project', 'P'], dir)).json.result;
    await frame(['scene', 'rename', info.episodes[0].scenes[0].id, 'Changed', '--project', 'P'], dir);
    await frame(['versions', 'restore', v.json.result.id, '--project', 'P'], dir);
    expect((await frame(['info', '--json', '--project', 'P'], dir)).json.result.episodes[0].scenes[0].name).toBe('Scene 1');
  });

  it('scene auto-performance generates editable talking and listening clips from the library (FR-ACT-07/08)', async () => {
    const dir = tmp();
    await frame(['init', 'Show.frame'], dir);
    const cwd = path.join(dir, 'Show.frame');
    const scene = (await frame(['scene', 'list', '--json'], cwd)).json.result.scenes[0].id as string;
    const auto = { idle: true, listening: true, blinks: true, talkingGestures: true };
    const add = (id: string, x: number) => ({ name: 'instance.add', params: { scene, id, kind: 'character', asset: 'chr.aiko-tanaka@1', name: id, transform: { x, y: 1000 }, character: { look: 'default', view: 'three', posture: 'standing', auto } } });
    const cmds = [add('ins_ada00001', 600), add('ins_ben00001', 1300),
      { name: 'line.add', params: { scene, speaker: 'ins_ada00001', text: 'We have a lot to talk about today, so let us begin.', start: 0, durationS: 5 } },
      { name: 'line.add', params: { scene, speaker: 'ins_ben00001', text: 'Absolutely. I have been looking forward to this conversation.', start: 288000, durationS: 4 } }];
    const file = path.join(dir, 'cmds.json');
    fs.writeFileSync(file, JSON.stringify(cmds));
    expect((await frame(['apply', file, '--json'], cwd)).code).toBe(0);
    const r = await frame(['scene', 'auto-performance', scene, '--json'], cwd);
    expect(r.code).toBe(0);
    expect(r.json.result.problems.filter((p: any) => p.code === 'CHANNEL_CONFLICT' || p.code === 'POSTURE_MISMATCH')).toEqual([]);
    const show = (await frame(['scene', 'show', scene, '--json'], cwd)).json.result;
    const autoClips = show.clips.filter((c: any) => c.source === 'auto');
    expect(autoClips.length).toBeGreaterThan(2);
    // Running it again replaces the auto clips rather than piling up.
    await frame(['scene', 'auto-performance', scene, '--json'], cwd);
    const again = (await frame(['scene', 'show', scene, '--json'], cwd)).json.result.clips.filter((c: any) => c.source === 'auto');
    expect(again.length).toBe(autoClips.length);
    // Using a door makes a sound cue on the Sound track.
    const door = [{ name: 'instance.add', params: { scene, id: 'ins_door0001', kind: 'prop', asset: 'prop.door@1', name: 'Door', transform: { x: 300, y: 1000 }, propState: 'closed' } }];
    fs.writeFileSync(file, JSON.stringify(door));
    await frame(['apply', file, '--json'], cwd);
    const acting = show.tracks.find((t: any) => t.owner === 'ins_ada00001' && t.kind === 'acting').id;
    fs.writeFileSync(file, JSON.stringify([{ name: 'clip.add', params: { scene, track: acting, start: 96000, end: 172800, asset: 'act.open-door@1', params: { prop: 'ins_door0001' } } }]));
    await frame(['apply', file, '--json'], cwd);
    const sc = await frame(['scene', 'sound-cues', scene, '--json'], cwd);
    expect(sc.code, sc.out + sc.err).toBe(0);
    const cues = (await frame(['scene', 'show', scene, '--json'], cwd)).json.result.clips.filter((c: any) => c.asset === 'sfx.door-open@1');
    expect(cues).toHaveLength(1);
  });

  it('applies recipes, frames cameras, covers a scene and saves clips as a recipe (FR-RCP, FR-CAM-01/05)', async () => {
    const dir = tmp();
    await frame(['init', 'Show.frame'], dir);
    const cwd = path.join(dir, 'Show.frame');
    const scene = (await frame(['scene', 'list', '--json'], cwd)).json.result.scenes[0].id as string;
    const auto = { idle: false, listening: false, blinks: true, talkingGestures: false };
    const add = (id: string, x: number) => ({ name: 'instance.add', params: { scene, id, kind: 'character', asset: 'chr.aiko-tanaka@1', name: id, transform: { x, y: 1000 }, character: { look: 'default', view: 'three', posture: 'standing', auto } } });
    const file = path.join(dir, 'cmds.json');
    fs.writeFileSync(file, JSON.stringify([add('ins_ada00001', 600), add('ins_ben00001', 1300),
      { name: 'line.add', params: { scene, id: 'clp_line0001', speaker: 'ins_ada00001', text: 'I think we should start right now.', start: 24000, durationS: 3 } },
      { name: 'line.add', params: { scene, id: 'clp_line0002', speaker: 'ins_ben00001', text: 'Agreed.', start: 216000, durationS: 1.2 } }]));
    expect((await frame(['apply', file, '--json'], cwd)).code).toBe(0);
    const list = (await frame(['recipe', 'list', '--json'], cwd)).json.result.recipes;
    expect(list.find((r: any) => r.ref === 'rcp.listen-and-nod@1')).toMatchObject({ roles: ['speaker', 'listener'], anchoredTo: 'speaker' });
    const r = await frame(['recipe', 'apply', scene, 'rcp.listen-and-nod@1', '--roles', 'speaker=ins_ada00001,listener=ins_ben00001', '--line', 'clp_line0001', '--json'], cwd);
    expect(r.code, r.out).toBe(0);
    expect(r.json.result.warnings).toEqual([]);
    const cam = await frame(['camera', 'frame', scene, 'cam.close-up@1', '--subjects', 'ins_ben00001', '--json'], cwd);
    expect(cam.code, cam.out).toBe(0);
    const cov = await frame(['scene', 'coverage', scene, '--json'], cwd);
    expect(cov.code, cov.out).toBe(0);
    expect(cov.json.result.problems.filter((p: any) => p.code === 'SHOT_OVERLAP' || p.code === 'CHANNEL_CONFLICT')).toEqual([]);
    const show = (await frame(['scene', 'show', scene, '--json'], cwd)).json.result;
    expect(show.clips.filter((c: any) => c.source === 'auto' && c.params.camera).length).toBeGreaterThan(1);
    const recipeClips = show.clips.filter((c: any) => c.source === 'recipe:rcp.listen-and-nod@1').map((c: any) => c.id);
    expect(recipeClips.length).toBe(5);
    const saved = await frame(['recipe', 'save', scene, ...recipeClips, '--name', 'My nods', '--json'], cwd);
    expect(saved.code, saved.out).toBe(0);
    expect(saved.json.result.roles).toEqual(['character1', 'character2']);
  });
});
