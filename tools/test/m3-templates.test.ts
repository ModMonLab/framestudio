import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProjectState, evaluateFrame, ProjectSession, secondsToTicks, sequentialIds, templateFromScene, validateProject, type ProjectState } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import { replaceCastCommands, templateCommandsForLibrary } from '@frame/io';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
const lib = bundledLibrary(content);
const styles = loadStyles(content);
const assets = { manifest: (r: string) => lib.manifest(r) };
const o = { lib, styles };
const s = secondsToTicks;
const OUTPUT = { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] };
const ctx = { assetExists: (r: string) => lib.has(r), manifest: (r: string) => lib.manifest(r) };

function project() {
  const ids = sequentialIds(900);
  const state: ProjectState = createProjectState(ids, { name: 'Templates', styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', now: '2026-10-22T00:00:00Z', seed: 5 });
  const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
  return { session, episode: state.project.episodes[0]! };
}
const templates = lib.all().map((e) => e.manifest).filter((m) => m.kind === 'tpl').map((m) => `${m.id}@${m.version}`);

describe('Production templates (FR-TPL, AC-22)', () => {
  it('ships every P1 template', () => {
    expect(templates).toHaveLength(16);
  });

  it.each(templates)('AC-22: %s creates a scene that validates and plays in every aspect ratio', (ref) => {
    const { session, episode } = project();
    const r = templateCommandsForLibrary(session.state, episode, ref, {}, o);
    session.apply({ commands: r.commands });
    const scene = session.state.scenes[r.sceneId]!;
    const problems = validateProject(session.state, ctx).filter((p) => p.scene === r.sceneId || !p.scene);
    expect(problems.map((p) => `${p.code}: ${p.message}`)).toEqual([]);
    // Shots cover the scene and every camera is framed on its cast.
    const shotTrack = scene.tracks.find((t) => t.kind === 'shot')!.id;
    const shots = scene.clips.filter((c) => c.track === shotTrack).sort((a, b) => a.start - b.start);
    expect(shots[0]!.start).toBe(0);
    expect(shots.at(-1)!.end).toBe(scene.duration);
    for (const [w, h, aspect] of [[640, 360, '16:9'], [360, 640, '9:16'], [400, 400, '1:1']] as const) {
      for (const f of [0.1, 0.35, 0.6, 0.9]) {
        const ev = evaluateFrame(session.state, r.sceneId, Math.round(scene.duration * f), { assets, styles, width: w, height: h, aspect });
        expect(ev.issues).toEqual([]);
      }
    }
    // Every character is in its first shot.
    const first = evaluateFrame(session.state, r.sceneId, s(0.5), { assets, styles, width: 640, height: 360, aspect: '16:9' });
    const firstCam = scene.cameras.find((c) => c.id === shots[0]!.params.camera)!;
    for (const id of firstCam.subjects) expect(first.boxes[id], `${ref} ${id}`).toBeTruthy();
  });

  it('FR-TPL-03: replacing the cast keeps clips and shots and reframes the cameras', () => {
    const { session, episode } = project();
    const r = templateCommandsForLibrary(session.state, episode, 'tpl.two-person-podcast@1', { cast: { guest: 'chr.marcus-hale@1' } }, o);
    session.apply({ commands: r.commands });
    const guest = r.ids.guest!;
    expect(session.state.scenes[r.sceneId]!.instances.find((i) => i.id === guest)!.asset).toBe('chr.marcus-hale@1');
    const before = session.state.scenes[r.sceneId]!;
    const clips = before.clips.length;
    const cam = before.cameras.find((c) => c.subjects.length === 1 && c.subjects[0] === r.ids.host)!;
    const camBefore = { ...cam.center, w: cam.width };
    session.apply({ commands: replaceCastCommands(session.state, r.sceneId, r.ids.host!, 'chr.ben-carter@1', o) });
    const after = session.state.scenes[r.sceneId]!;
    const host = after.instances.find((i) => i.id === r.ids.host)!;
    expect(host.asset).toBe('chr.ben-carter@1');
    expect(host.character!.look).toBe('school');
    expect(after.clips).toHaveLength(clips);
    const cam2 = after.cameras.find((c) => c.id === cam.id)!;
    // A child is shorter than an adult presenter: the single is reframed.
    expect({ ...cam2.center, w: cam2.width }).not.toEqual(camBefore);
    expect(validateProject(session.state, ctx).filter((p) => p.blocksExport).map((p) => p.message)).toEqual([]);
  });

  it('FR-TPL-02: a scene saved as a template recreates the same set-up', () => {
    const { session, episode } = project();
    const r = templateCommandsForLibrary(session.state, episode, 'tpl.mystery-scene@1', {}, o);
    session.apply({ commands: r.commands });
    const tpl = templateFromScene(session.state, r.sceneId);
    expect(tpl.roles.map((x) => x.default)).toEqual(['chr.elena-novak@1', 'chr.luc-a-ferreira@1']);
    const orig = session.state.scenes[r.sceneId]!;
    // Re-applying the saved data gives the same number of instances, clips and cameras.
    const fake = { ...lib, manifest: (ref: string) => (ref === 'tpl.saved@1' ? { id: 'tpl.saved', version: 1, kind: 'tpl', name: 'Saved', data: { template: tpl } } : lib.manifest(ref)) } as typeof lib;
    const again = templateCommandsForLibrary(session.state, episode, 'tpl.saved@1', {}, { lib: fake, styles });
    session.apply({ commands: again.commands });
    const copy = session.state.scenes[again.sceneId]!;
    expect(copy.instances.length).toBe(orig.instances.length);
    expect(copy.clips.length).toBe(orig.clips.length);
    expect(copy.cameras.length).toBe(orig.cameras.length);
    expect(validateProject(session.state, ctx).filter((p) => p.blocksExport).map((p) => p.message)).toEqual([]);
  });
});
