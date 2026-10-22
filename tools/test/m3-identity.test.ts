import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterJointsAt, createProjectState, ProjectSession, resolveCharacter, secondsToTicks, sequentialIds, trackFor, validateProject, type ProjectState, type CharacterData } from '@frame/core';
import { composeCharacter, NEUTRAL_FACE, REST_POSE, rigCheck, rigCheckPasses, type PartData } from '@frame/rig';
import type { Item } from '@frame/render';
import { bundledLibrary, loadStyles } from '@frame/assets/node';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lib = bundledLibrary(path.join(repo, 'content'));
const styles = loadStyles(path.join(repo, 'content'));
const assets = { manifest: (r: string) => lib.manifest(r) };
const s = secondsToTicks;

describe('accessories, skin details, makeup and identity options (C1, A13, A14, A20, FR-CHR-11)', () => {
  it('every bundled cast member resolves every look with no missing parts', () => {
    const cast = lib.all().map((e) => e.manifest).filter((m) => m.kind === 'chr');
    expect(cast.length).toBe(14);
    for (const m of cast) {
      for (const look of (m.data as CharacterData).looks) {
        for (const family of ['flat', 'illustrated'] as const) {
          const r = resolveCharacter(m, look.id, family, styles[family], assets);
          expect(r.missing, `${m.id} ${look.id}`).toEqual([]);
        }
      }
    }
  });

  it('every new part passes the rig check in both families and every view it declares', () => {
    const parts = lib.all().map((e) => e.manifest).filter((m) => ['acc', 'skin-detail', 'makeup', 'identity'].includes(m.kind));
    expect(parts.length).toBe(84);
    for (const m of parts) expect(rigCheckPasses(rigCheck(m.data as PartData)), m.id).toBe(true);
  });

  it('a wheelchair user stays seated, rolls without a leg cycle, and takes locomotion clips without posture problems', () => {
    const ids = sequentialIds(700);
    const state: ProjectState = createProjectState(ids, { name: 'Id', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] }, appVersion: '0.1.0', now: '2026-10-22T00:00:00Z', seed: 2 });
    const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
    const scene = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
    const apply = (commands: { name: string; params: Record<string, unknown> }[]) => session.apply({ commands });
    const ravi = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.ravi-shah@1', name: 'Ravi', transform: { x: 300, y: 1000 }, character: { look: 'streamer', view: 'three', posture: 'standing', auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } } }]).commands[0]!.params.id as string;
    const acting = trackFor(session.state.scenes[scene]!, ravi, 'acting')!.id;
    apply([
      { name: 'clip.add', params: { scene, track: acting, start: s(1), end: s(4), asset: 'act.push-wheelchair@1', params: { path: [[900, 1000]] } } },
      { name: 'clip.add', params: { scene, track: acting, start: s(5), end: s(8), asset: 'act.walk@1', params: { path: [[1500, 1000]] } } },
    ]);
    const ctx = { assetExists: (r: string) => lib.has(r), manifest: (r: string) => lib.manifest(r) };
    expect(validateProject(session.state, ctx).filter((p) => p.code === 'POSTURE_MISMATCH' || p.blocksExport).map((p) => p.message)).toEqual([]);
    const j = (t: number) => characterJointsAt(session.state, scene, ravi, s(t), { assets, styles });
    // Seated: hips at knee height, and the legs keep their pose relative to the pelvis while rolling.
    const leg = (t: number): [number, number] => { const x = j(t); return [x.ankleL![0] - x.pelvis![0], x.ankleL![1] - x.pelvis![1]]; };
    const a = leg(1.6);
    for (const t of [2.1, 2.7, 3.3, 5.6, 6.4]) {
      const b = leg(t);
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(1);
    }
    expect(j(2.5).pelvis![0]).toBeGreaterThan(j(1.2).pelvis![0] + 50);
    expect(j(2.5).kneeL![1]).toBeLessThan(j(2.5).ankleL![1] - 20);
  });

  it('limb difference ends the forearm and omits that hand; prosthetics keep the hand', () => {
    const man = lib.manifest('chr.maya-bennett@1')!;
    const count = (extra: string[]) => {
      const { spec } = resolveCharacter(man, 'on-air', 'flat', styles.flat, assets, extra);
      const c = composeCharacter(spec, { view: 'front', flip: false, pose: REST_POSE, face: NEUTRAL_FACE, mouth: null, gaze: [0, 0], overlays: {} });
      const n = (it: Item): number => (it.k === 'group' ? (it.id === 'base.hands@1' ? 1 : 0) + it.items.reduce((x: number, y: Item) => x + n(y), 0) : 0);
      return n(c.item);
    };
    expect(count([])).toBe(2);
    expect(count(['identity.limb-difference@1'])).toBe(1);
    expect(count(['identity.prosthetic-arm@1'])).toBe(2);
  });
});
