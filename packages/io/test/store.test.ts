import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FrameError } from '@frame/schema';
import { OpenProject, ProjectStore, stableStringify } from '../src/index.js';
import { CHAR, newProject, tmpdir } from './helpers.js';

function scenesOf(p: OpenProject) {
  return Object.keys(p.state.scenes);
}

describe('project store (FR-DAT-06..09, FR-PER-01)', () => {
  it('creates the folder layout and reopens to an equal state', () => {
    const p = newProject();
    const scene = scenesOf(p)[0]!;
    p.session.apply({ commands: [{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.test-a@1', name: 'Ada', character: CHAR } }] });
    expect(p.saveState.status).toBe('unsaved');
    expect(p.flush()).toBe(true);
    expect(p.saveState.status).toBe('saved');
    for (const d of ['project.json', 'episodes', 'assets/media', 'assets/takes', 'locks', 'history', 'renders']) expect(fs.existsSync(path.join(p.store.root, d))).toBe(true);
    const re = OpenProject.open(p.store.root);
    expect(re.state).toEqual(p.state);
    expect(re.session.revision).toBe(p.session.revision);
    expect(re.load!.problems.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('writes pretty JSON with stable key order', () => {
    const p = newProject();
    p.flush();
    const text = fs.readFileSync(path.join(p.store.root, 'project.json'), 'utf8');
    expect(text).toBe(stableStringify(JSON.parse(text)));
    const keys = Object.keys(JSON.parse(text));
    expect(keys).toEqual([...keys].sort());
  });

  it('moves scene files between episodes and deletes removed files', () => {
    const p = newProject();
    const [scene] = scenesOf(p);
    const ep1 = p.state.project.episodes[0]!;
    const r = p.session.apply({ commands: [{ name: 'episode.add', params: { name: 'Two' } }] });
    const ep2 = r.commands[0]!.params.id as string;
    p.session.apply({ commands: [{ name: 'scene.add', params: { episode: ep1, name: 'Second' } }] });
    p.session.apply({ commands: [{ name: 'scene.move', params: { id: scene!, episode: ep2, index: 0 } }] });
    p.flush();
    expect(fs.existsSync(path.join(p.store.root, `episodes/${ep1}/scenes/${scene}.json`))).toBe(false);
    expect(fs.existsSync(path.join(p.store.root, `episodes/${ep2}/scenes/${scene}.json`))).toBe(true);
    p.session.apply({ commands: [{ name: 'episode.delete', params: { id: ep2 } }] });
    p.flush();
    expect(fs.existsSync(path.join(p.store.root, `episodes/${ep2}`))).toBe(false);
    expect(OpenProject.open(p.store.root).state).toEqual(p.state);
  });

  it('recovers journaled commits after an unclean stop (FR-PER-04)', () => {
    const p = newProject();
    const scene = scenesOf(p)[0]!;
    p.flush();
    for (let i = 0; i < 20; i++) p.session.apply({ commands: [{ name: 'scene.rename', params: { id: scene, name: `Name ${i}` } }] });
    // no flush: simulate the process dying before the debounced save
    const re = OpenProject.open(p.store.root);
    expect(re.load!.recovered).toBe(20);
    expect(re.state).toEqual(p.state);
    expect(re.session.revision).toBe(p.session.revision);
  });

  it('a crash between writing an episode and its new scene recovers without stale problems (NFR-08)', () => {
    const p = newProject();
    p.flush();
    const ep = p.state.project.episodes[0]!;
    p.session.apply({ commands: [{ name: 'scene.add', params: { episode: ep, name: 'Added' } }] });
    // Simulate the kill window: the journal holds the commit and episode.json was written, the scene file was not.
    const rel = `episodes/${ep}/episode.json`;
    fs.writeFileSync(path.join(p.store.root, rel), stableStringify(p.state.episodes[ep]));
    const re = OpenProject.open(p.store.root);
    expect(re.state).toEqual(p.state);
    expect(re.load!.problems.filter((x) => x.severity === 'error')).toEqual([]);
  });

  it('ignores a torn final journal line', () => {
    const p = newProject();
    const scene = scenesOf(p)[0]!;
    p.flush();
    p.session.apply({ commands: [{ name: 'scene.rename', params: { id: scene, name: 'Kept' } }] });
    fs.appendFileSync(path.join(p.store.root, 'history/journal.jsonl'), '{"revision": 99, "entities": {"proj');
    const re = OpenProject.open(p.store.root);
    expect(re.state.scenes[scene]!.name).toBe('Kept');
  });

  it('refuses a newer schema without modifying the file (FR-DAT-05)', () => {
    const p = newProject();
    p.flush();
    const file = path.join(p.store.root, 'project.json');
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    doc.schemaVersion = 99;
    fs.writeFileSync(file, JSON.stringify(doc));
    const before = fs.readFileSync(file, 'utf8');
    try {
      OpenProject.open(p.store.root);
      expect.unreachable();
    } catch (e) {
      expect((e as FrameError).code).toBe('SCHEMA_TOO_NEW');
    }
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('reports invalid folders with a validation report (FR-PRJ-07)', () => {
    const dir = tmpdir();
    expect(() => new ProjectStore(dir).load()).toThrow(/No Frame project/);
    const p = newProject();
    p.flush();
    const scene = scenesOf(p)[0]!;
    const ep = p.state.project.episodes[0]!;
    fs.writeFileSync(path.join(p.store.root, `episodes/${ep}/scenes/${scene}.json`), '{"schemaVersion":1,"id":"bad"}');
    const re = new ProjectStore(p.store.root).load();
    expect(re.problems.some((x) => x.code === 'SCHEMA')).toBe(true);
  });

  it('detects external changes (FR-PER-05)', () => {
    const p = newProject();
    p.flush();
    expect(p.store.externalChanges()).toEqual([]);
    const file = path.join(p.store.root, 'project.json');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"Show"', '"Edited elsewhere"'));
    expect(p.store.externalChanges()).toEqual(['project.json']);
  });

  it('stores media content-addressed and once (FR-DAT-07)', () => {
    const p = newProject();
    const a = p.store.putMedia(new TextEncoder().encode('hello'), { ext: 'wav', mime: 'audio/wav' });
    const b = p.store.putMedia(new TextEncoder().encode('hello'), { ext: 'wav', mime: 'audio/wav' });
    expect(a.hash).toBe(b.hash);
    expect(fs.readdirSync(path.join(p.store.root, 'assets/media'))).toHaveLength(1);
    expect(p.store.verifyMedia(a.hash)).toBe(true);
    fs.writeFileSync(p.store.findMedia(a.hash)!, 'tampered');
    expect(p.store.verifyMedia(a.hash)).toBe(false);
  });

  it('saves, lists and loads named versions (FR-PER-03)', () => {
    const p = newProject();
    const scene = scenesOf(p)[0]!;
    p.flush();
    p.store.saveVersion(p.state, p.session.revision, 'Before rename', 'snap_00000001');
    p.session.apply({ commands: [{ name: 'scene.rename', params: { id: scene, name: 'After' } }] });
    const versions = p.store.listVersions();
    expect(versions.map((v) => v.name)).toEqual(['Before rename']);
    expect(p.store.loadVersion('snap_00000001').scenes[scene]!.name).toBe('Scene 1');
  });

  it('keeps work in memory and retries when saving fails (AC-16 disk full)', () => {
    const p = newProject();
    const scene = scenesOf(p)[0]!;
    p.flush();
    p.session.apply({ commands: [{ name: 'scene.rename', params: { id: scene, name: 'Unsaved work' } }] });
    const real = p.store.save.bind(p.store);
    p.store.save = () => {
      throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };
    expect(p.flush()).toBe(false);
    expect(p.saveState.status).toBe('error');
    expect(p.saveState.error).toMatch(/ENOSPC/);
    expect(p.state.scenes[scene]!.name).toBe('Unsaved work');
    p.store.save = real;
    expect(p.flush()).toBe(true);
    expect(OpenProject.open(p.store.root).state.scenes[scene]!.name).toBe('Unsaved work');
  });
});
