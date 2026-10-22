import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterJointsAt, holderAt, motionAt, propStateAt, scheduleSceneAudio, seatCommands, soundCueCommands, createProjectState, evaluateFrame, performAt, ProjectSession, secondsToTicks, sequentialIds, trackFor, validateProject, type ProjectState } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import { autoCoverageForLibrary, bundledMediaFile, recipeCommandsForLibrary } from '@frame/io';
import type { Command } from '@frame/schema';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
const lib = bundledLibrary(content);
const styles = loadStyles(content);
const assets = { manifest: (r: string) => lib.manifest(r) };
const s = secondsToTicks;
const COVERAGE = { wide: 'cam.wide@1', single: 'cam.medium-close-up@1', two: 'cam.two-shot@1' };
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

  it('AC-07: picks up a mug and drinks (steam on) with a sound cue at contact, opens and closes a door, uses a phone (screen on); seeking mid-action shows the right state', async () => {
    const { session, scene, apply, sc } = project();
    const who = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.maya-bennett@1', name: 'Maya', transform: { x: 900, y: 1000 }, character: { look: 'on-air', view: 'three', posture: 'standing', auto: quiet } } }]).commands[0]!.params.id as string;
    const add = (asset: string, name: string, x: number, y: number, extra: Record<string, unknown> = {}) => apply([{ name: 'instance.add', params: { scene, kind: 'prop', asset, name, transform: { x, y }, depthPlane: 'mid', ...extra } }]).commands[0]!.params.id as string;
    add('prop.round-table@1', 'Table', 1150, 1010);
    const mug = add('prop.mug@1', 'Mug', 1100, 805, { propState: 'steam' });
    const door = add('prop.door@1', 'Door', 600, 1000, { propState: 'closed' });
    const phone = add('prop.phone@1', 'Phone', 1200, 805, { propState: 'off' });
    const acting = trackFor(sc(), who, 'acting')!.id;
    apply([
      { name: 'clip.add', params: { scene, track: acting, start: 0, end: s(4), asset: 'act.drink-from-mug@1', params: { prop: mug } } },
      { name: 'clip.add', params: { scene, track: acting, start: s(5), end: s(6.6), asset: 'act.open-door@1', params: { prop: door } } },
      { name: 'clip.add', params: { scene, track: acting, start: s(7), end: s(8.4), asset: 'act.close-door@1', params: { prop: door } } },
      { name: 'clip.add', params: { scene, track: acting, start: s(9), end: s(14), asset: 'act.use-phone@1', params: { prop: phone } } },
    ]);
    const ctx = { assetExists: (r: string) => lib.has(r), manifest: (r: string) => lib.manifest(r) };
    expect(validateProject(session.state, ctx).filter((p) => p.blocksExport).map((p) => p.message)).toEqual([]);
    const ev = (t: number) => evaluateFrame(session.state, scene, s(t), { assets, styles, width: 1920, height: 1080 });
    const centre = (b: { x: number; y: number; w: number; h: number }): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];
    const actionOf = (r: string) => (lib.manifest(r)?.data as { action?: never } | undefined)?.action;
    const inst = (id: string) => sc().instances.find((i) => i.id === id)!;

    // The mug sits on the table, is in the right hand mid-drink, then back on the table; steam stays on.
    const rest = centre(ev(0.05).boxes[mug]!);
    const mid = ev(2);
    const wrist = characterJointsAt(session.state, scene, who, s(2), { assets, styles }).wristR!;
    expect(Math.hypot(centre(mid.boxes[mug]!)[0] - wrist[0], centre(mid.boxes[mug]!)[1] - wrist[1])).toBeLessThan(60);
    expect(Math.hypot(centre(mid.boxes[mug]!)[0] - rest[0], centre(mid.boxes[mug]!)[1] - rest[1])).toBeGreaterThan(60);
    expect(centre(ev(4.2).boxes[mug]!)).toEqual(rest);
    expect(propStateAt(sc(), inst(mug), s(2), actionOf)).toBe('steam');
    // Door: closed, open after the open event, closed again after closing — at any seek order.
    for (const [t, st] of [[8.6, 'closed'], [5.2, 'closed'], [6.2, 'open'], [7.2, 'open'], [8.0, 'closed']] as const) expect(propStateAt(sc(), inst(door), s(t), actionOf)).toBe(st);
    // Phone: in hand with the screen on in the middle of use; off and back on the table afterwards.
    expect(propStateAt(sc(), inst(phone), s(11.5), actionOf)).toBe('on');
    expect(propStateAt(sc(), inst(phone), s(14.5), actionOf)).toBe('off');
    const phoneRest = centre(ev(0.05).boxes[phone]!);
    expect(Math.hypot(centre(ev(11.5).boxes[phone]!)[0] - phoneRest[0], centre(ev(11.5).boxes[phone]!)[1] - phoneRest[1])).toBeGreaterThan(60);
    expect(centre(ev(14.5).boxes[phone]!)).toEqual(phoneRest);

    // Sound cues become editable SFX clips at the events; they play bundled synthesised sounds.
    apply(soundCueCommands(session.state, scene, assets));
    const sfxTrack = sc().tracks.find((t) => t.kind === 'sfx' && t.owner === 'scene')!.id;
    const cues = sc().clips.filter((c) => c.track === sfxTrack).map((c) => [c.asset, Math.round((c.start / 48000) * 100) / 100, c.source]);
    expect(cues).toEqual([['sfx.mug-on-table@1', 3.4, 'auto'], ['sfx.door-open@1', 5.56, 'auto'], ['sfx.door-close@1', 7.77, 'auto'], ['sfx.phone-notification@1', 10.25, 'auto']]);
    // Regenerating does not duplicate.
    apply(soundCueCommands(session.state, scene, assets));
    expect(sc().clips.filter((c) => c.track === sfxTrack)).toHaveLength(4);
    const plan = scheduleSceneAudio(session.state, sc(), undefined, assets);
    const sfx = plan.events.filter((e) => e.bus === 'sfx');
    expect(sfx).toHaveLength(4);
    for (const e of sfx) expect(e.source.kind === 'media' && bundledMediaFile(content, e.source.hash)).toBeTruthy();
    if (process.env.FRAME_DEBUG_PNG) {
      const { createNodeRenderer } = await import('../../packages/render/src/node.js');
      const r = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
      const fs = await import('node:fs');
      for (const t of [0.05, 2, 6.2, 11.5]) fs.writeFileSync(`${process.env.FRAME_DEBUG_PNG}-ac07-${t}.png`, r.png(evaluateFrame(session.state, scene, s(t), { assets, styles, width: 960, height: 540, background: '#dddddd' }).frame));
    }
  });

  it('AC-06 path: three recipes (interruption, double take, hand over) and automatic coverage give a valid, conflict-free scene in two aspect ratios', () => {
    const { session, scene, apply, sc } = project();
    apply([{ name: 'scene.setDuration', params: { id: scene, durationS: 24 } }]);
    const char = (asset: string, look: string, name: string, x: number, flipX = false) => apply([{ name: 'instance.add', params: { scene, kind: 'character', asset, name, transform: { x, y: 1000, flipX }, character: { look, view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }]).commands[0]!.params.id as string;
    const maya = char('chr.maya-bennett@1', 'on-air', 'Maya', 500);
    const leo = char('chr.leo-park@1', 'everyday', 'Leo', 1000, true);
    const aiko = char('chr.aiko-tanaka@1', 'default', 'Aiko', 1450, true);
    const props = ['prop.round-table@1', 'prop.studio-chair@1', 'prop.studio-chair@1', 'prop.potted-plant@1', 'prop.floor-lamp@1', 'prop.on-air-sign@1', 'prop.desk-microphone@1', 'prop.phone@1', 'prop.door@1', 'prop.mug@1'];
    const ids = props.map((asset, i) => apply([{ name: 'instance.add', params: { scene, kind: 'prop', asset, name: `Prop ${i + 1}`, transform: { x: 150 + i * 170, y: asset.includes('mug') || asset.includes('phone') ? 805 : 1000 }, depthPlane: 'mid' } }]).commands[0]!.params.id as string);
    const mug = ids[9]!;
    const said: [string, string][] = [[maya, 'Welcome back to the show, everyone.'], [leo, 'Thanks. Great to be here today.'], [maya, 'So tell us about the new project you have been working on for months now.'], [aiko, 'Wait, can I jump in?'], [leo, 'Sure, go ahead.'], [aiko, 'I brought something for you.'], [maya, 'Oh, that is lovely.'], [leo, 'Well, that settles it then.']];
    const lines: string[] = [];
    let t = 0.5;
    for (const [who, text] of said) {
      const dur = Math.max(1.4, text.split(' ').length * 0.38);
      lines.push(apply([{ name: 'line.add', params: { scene, speaker: who, text, start: s(t), durationS: dur } }]).commands[0]!.params.id as string);
      t += dur + 0.4;
    }
    const o = { lib, styles };
    const interruption = recipeCommandsForLibrary(session.state, scene, 'rcp.interruption@1', { roles: { speaker: maya, interrupter: aiko }, line: lines[2]! }, o);
    expect(interruption.warnings).toEqual([]);
    apply(interruption.commands);
    const gag = recipeCommandsForLibrary(session.state, scene, 'rcp.double-take-gag@1', { roles: { reactor: leo, target: aiko }, at: s(t - 6) }, o);
    expect(gag.warnings).toEqual([]);
    apply(gag.commands);
    const handover = recipeCommandsForLibrary(session.state, scene, 'rcp.hand-over-object@1', { roles: { giver: aiko, receiver: maya, object: mug }, at: s(t + 0.5) }, o);
    expect(handover.warnings).toEqual([]);
    apply(handover.commands);
    apply(autoCoverageForLibrary(session.state, scene, { ...o, framings: COVERAGE }));
    const shotTrack = sc().tracks.find((x) => x.kind === 'shot')!.id;
    const shots = sc().clips.filter((c) => c.track === shotTrack).sort((a, b) => a.start - b.start);
    expect(shots.filter((c) => c.source === 'auto').length).toBeGreaterThan(3);
    expect(shots.filter((c) => c.source.startsWith('recipe:')).length).toBe(3);
    const ctx = { assetExists: (r: string) => lib.has(r), manifest: (r: string) => lib.manifest(r) };
    const problems = validateProject(session.state, ctx).filter((p) => p.blocksExport && !p.code.startsWith('TAKE_'));
    expect(problems.map((p) => `${p.code}: ${p.message}`)).toEqual([]);
    // Regenerating coverage keeps recipe shots and replaces only the automatic ones.
    const before = shots.length;
    apply(autoCoverageForLibrary(session.state, scene, { ...o, framings: COVERAGE }));
    expect(sc().clips.filter((c) => c.track === shotTrack)).toHaveLength(before);
    // Frames evaluate without issues in landscape and portrait.
    for (const [w, h, aspect] of [[640, 360, '16:9'], [360, 640, '9:16']] as const) {
      for (const tt of [1, 5, 12, t - 4, t + 1.5]) {
        const ev = evaluateFrame(session.state, scene, s(tt), { assets, styles, width: w, height: h, aspect });
        expect(ev.issues.filter((i) => !/missing asset/.test(i))).toEqual([]);
      }
    }
    // The mug passes from the giver's hand to the receiver's and stays there.
    const actionOf = (r: string) => (lib.manifest(r)?.data as { action?: never } | undefined)?.action;
    expect(holderAt(sc(), mug, s(t + 0.7), actionOf)?.holder.id).toBe(aiko);
    expect(holderAt(sc(), mug, s(t + 2), actionOf)?.holder.id).toBe(maya);
    expect(holderAt(sc(), mug, s(t + 6), actionOf)?.holder.id).toBe(maya);
  });
});
