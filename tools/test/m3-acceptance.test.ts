import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterJointsAt, motionAt, seatCommands, createProjectState, evaluateFrame, performAt, ProjectSession, secondsToTicks, sequentialIds, trackFor, validateProject, type ProjectState } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import type { Command } from '@frame/schema';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
const lib = bundledLibrary(content);
const styles = loadStyles(content);
const assets = { manifest: (r: string) => lib.manifest(r) };
const s = secondsToTicks;
const OUTPUT = { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] };

function project() {
  const ids = sequentialIds(500);
  const state: ProjectState = createProjectState(ids, { name: 'M3', styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', now: '2026-10-22T00:00:00Z', seed: 3 });
  const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
  const scene = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
  const apply = (commands: Command[]) => session.apply({ commands });
  apply([{ name: 'scene.setDuration', params: { id: scene, durationS: 14 } }]);
  return { session, scene, apply, sc: () => session.state.scenes[scene]! };
}
const quiet = { idle: false, listening: false, blinks: false, talkingGestures: false };

describe('M3 acceptance paths', () => {
  it('AC-08: enters along a curved path, stops on a mark, turns to face another, sits; the listener\'s gaze follows; no foot sliding; seeks do not drift', async () => {
    const { session, scene, apply, sc } = project();
    const walker = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.maya-bennett@1', name: 'Walker', transform: { x: -150, y: 1000 }, character: { look: 'on-air', view: 'three', posture: 'standing', auto: quiet } } }]).commands[0]!.params.id as string;
    const listener = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.leo-park@1', name: 'Listener', transform: { x: 450, y: 940, flipX: true }, character: { look: 'everyday', view: 'three', posture: 'standing', auto: { ...quiet, listening: true } } } }]).commands[0]!.params.id as string;
    apply([{ name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.studio-chair@1', name: 'Chair', transform: { x: 900, y: 1000 }, depthPlane: 'mid' } }]);
    apply([{ name: 'stage.addMark', params: { scene, name: 'Chair', x: 900, y: 1000, facing: 'right' } }]);
    const acting = trackFor(sc(), walker, 'acting')!.id;
    const gaze = trackFor(sc(), listener, 'gaze')!.id;
    apply([
      { name: 'clip.add', params: { scene, track: acting, start: 0, end: s(6), asset: 'act.walk@1', params: { path: [[300, 990], [600, 1010]], mark: 'Chair', curve: true } } },
      { name: 'clip.add', params: { scene, track: acting, start: s(6.5), end: s(6.6), params: { turn: listener } } },
      { name: 'clip.add', params: { scene, track: acting, start: s(7), end: s(8.2), asset: 'act.sit-down@1' } },
      { name: 'clip.add', params: { scene, track: gaze, start: 0, end: s(9), params: { target: walker } } },
    ]);
    const ctx = { assetExists: (r: string) => lib.has(r), manifest: (r: string) => lib.manifest(r) };
    expect(validateProject(session.state, ctx).filter((p) => p.blocksExport || p.code === 'POSTURE_MISMATCH').map((p) => p.message)).toEqual([]);

    // Path: it starts off-stage, passes the waypoints and stops on the mark.
    const at = (t: number) => characterJointsAt(session.state, scene, walker, s(t), { assets, styles });
    const ev = (t: number) => evaluateFrame(session.state, scene, s(t), { assets, styles, width: 1920, height: 1080 });
    const box0 = ev(0.01).boxes[walker]!;
    const boxEnd = ev(6.2).boxes[walker]!;
    expect(box0.x + box0.w / 2).toBeLessThan(0); // off-stage left
    expect(Math.abs(boxEnd.x + boxEnd.w / 2 - 900)).toBeLessThan(80); // on the mark

    // Foot sliding: while a foot is planted (lowest ankle on the ground), its stage x stays within 2 px at 1080p.
    let worst = 0;
    let planted = 0;
    const step = 1 / 96;
    for (let t = 0.6; t < 5.4; t += step) {
      const a = at(t);
      const b = at(t + step);
      for (const side of ['L', 'R'] as const) {
        const ankleA = a[`ankle${side}`]!;
        const ankleB = b[`ankle${side}`]!;
        const ground = Math.max(a.ankleL![1], a.ankleR![1]);
        const groundB = Math.max(b.ankleL![1], b.ankleR![1]);
        // Planted in both samples: at ground height (within 0.5 px).
        if (Math.abs(ankleA[1] - ground) < 0.5 && Math.abs(ankleB[1] - groundB) < 0.5 && Math.abs(ankleA[1] - ankleB[1]) < 0.5) {
          planted++;
          worst = Math.max(worst, Math.abs(ankleA[0] - ankleB[0]));
        }
      }
    }
    expect(planted).toBeGreaterThan(300); // most of the walk has a planted foot
    expect(worst).toBeLessThan(2);
    if (process.env.FRAME_DEBUG_PNG) await import('../../packages/render/src/node.js').then(async ({ createNodeRenderer }) => {
      const r = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
      const fs = await import('node:fs');
      for (const t of [1, 1.2, 1.4, 3, 6.4, 9]) fs.writeFileSync(`${process.env.FRAME_DEBUG_PNG}-${t}.png`, r.png(evaluateFrame(session.state, scene, s(t), { assets, styles, width: 960, height: 540, background: '#dddddd' }).frame));
    });

    // Facing: walks right (not flipped), turns back to face the listener behind (flipped), sits and stays seated there.
    const actionOf = (r: string) => (lib.manifest(r)?.data as { action?: never } | undefined)?.action;
    const inst = sc().instances.find((i) => i.id === walker)!;
    expect(motionAt(sc(), inst, s(3), actionOf).flip).toBe(false);
    expect(motionAt(sc(), inst, s(6.4), actionOf).flip).toBe(false);
    expect(motionAt(sc(), inst, s(9), actionOf).flip).toBe(true);
    expect(performAt(session.state, scene, walker, s(9), assets).pose.posture).toBe('seated');
    // The listener's gaze follows the walker: left while the walker approaches, right once the walker has passed.
    const g1 = performAt(session.state, scene, listener, s(0.5), assets).gaze[0];
    const g2 = performAt(session.state, scene, listener, s(5.8), assets).gaze[0];
    expect(g1).toBeLessThan(-0.5);
    expect(g2).toBeGreaterThan(0.5);
    expect(sc().instances.find((i) => i.id === listener)!.transform.x).toBe(450);

    // Repeated seeks give identical frames (no drift): evaluate in random order and compare.
    const times = [3.3, 0.7, 5.1, 3.3, 6.4, 0.7];
    const frames = times.map((t) => JSON.stringify(ev(t).frame));
    expect(frames[0]).toBe(frames[3]);
    expect(frames[1]).toBe(frames[5]);
  });

  it('FR-STG-04: seating puts the hips on the seat anchor for the character\'s proportions, in front of the seat', () => {
    const { session, scene, apply, sc } = project();
    const chair = apply([{ name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.studio-chair@1', name: 'Chair', transform: { x: 700, y: 980, scale: 1.1 }, depthPlane: 'mid' } }]).commands[0]!.params.id as string;
    for (const [asset, look] of [['chr.maya-bennett@1', 'on-air'], ['chr.leo-park@1', 'everyday']] as const) {
      const who = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset, name: 'Sitter', transform: { x: 300, y: 1000, scale: 1.12 }, character: { look, view: 'three', posture: 'standing', auto: quiet } } }]).commands[0]!.params.id as string;
      apply(seatCommands(session.state, scene, who, chair, { assets, styles }));
      const inst = sc().instances.find((i) => i.id === who)!;
      const seat = (lib.manifest('prop.studio-chair@1')!.anchors as { seat: [number, number] }).seat;
      const pelvis = characterJointsAt(session.state, scene, who, 0, { assets, styles }).pelvis!;
      expect(inst.character!.posture).toBe('seated');
      expect(Math.abs(pelvis[0] - (700 + seat[0] * 1.1))).toBeLessThan(2);
      expect(Math.abs(pelvis[1] - (980 + seat[1] * 1.1))).toBeLessThan(2);
      expect(inst.depthPlane).toBe('mid');
      expect(inst.order).toBeGreaterThan(sc().instances.find((i) => i.id === chair)!.order);
      apply([{ name: 'instance.remove', params: { scene, ids: [who] } }]);
    }
  });
});
