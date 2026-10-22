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
});
