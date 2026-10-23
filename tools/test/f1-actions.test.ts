/** The full action library (Catalog F1): every action evaluates cleanly; postures, entrances and turns behave. */
import { expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import fs from 'node:fs';
import { evaluateFrame, motionAt, performAt, secondsToTicks as s, trackFor, type ActionData } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import { buildSampleScene } from './sample-scene.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lib = bundledLibrary(path.join(repo, 'content'));
const styles = loadStyles(path.join(repo, 'content'));
const assets = { manifest: (r: string) => lib.manifest(r) };

it('every catalog action exists, declares channels and postures, and performs without composition problems', () => {
  const list = yaml.parse(fs.readFileSync(path.join(repo, 'catalog/lists/35-f1-act.yaml'), 'utf8')) as { items: { id: string }[] };
  const { session, scene, maya } = buildSampleScene('flat');
  const track = trackFor(session.state.scenes[scene]!, maya, 'acting')!.id;
  const clips = session.state.scenes[scene]!.clips.filter((c) => c.track === track).map((c) => c.id);
  if (clips.length) session.apply({ commands: [{ name: 'clip.remove', params: { scene, ids: clips } }] });
  for (const { id } of list.items) {
    const m = lib.manifest(`${id}@1`);
    expect(m, id).toBeTruthy();
    const a = (m!.data as { action: ActionData }).action;
    expect(a.channels.length, id).toBeGreaterThan(0);
    expect(a.postures.length, id).toBeGreaterThan(0);
    if (a.locomotion || a.turn || !a.postures.includes('seated') && !a.postures.includes('standing')) continue;
    const posture = a.postures.includes('seated') ? 'seated' : 'standing';
    const inst = session.state.scenes[scene]!.instances.find((i) => i.id === maya)!;
    const r = session.apply({ commands: [
      { name: 'instance.update', params: { scene, id: maya, set: { character: { ...inst.character!, posture } } } },
      { name: 'clip.add', params: { scene, track, start: s(0.5), end: s(2.5), asset: `${id}@1` } },
    ] });
    const ev = evaluateFrame(session.state, scene, s(1.5), { assets, styles, width: 192, height: 108 });
    expect(ev.issues.filter((i) => i.includes('Maya')), id).toEqual([]);
    session.undo();
    expect(r.revision).toBeGreaterThan(0);
  }
});

it('posture actions end in their posture; enter walks on from the edge; exit walks off; turn-around faces the other way', () => {
  const { session, scene, maya } = buildSampleScene('flat');
  const sc = () => session.state.scenes[scene]!;
  const track = trackFor(sc(), maya, 'acting')!.id;
  const ids = sc().clips.filter((c) => c.track === track).map((c) => c.id);
  if (ids.length) session.apply({ commands: [{ name: 'clip.remove', params: { scene, ids } }] });
  const add = (asset: string, a: number, b: number) => session.apply({ commands: [{ name: 'clip.add', params: { scene, track, start: s(a), end: s(b), asset } }] });
  const inst = () => sc().instances.find((i) => i.id === maya)!;
  session.apply({ commands: [{ name: 'instance.update', params: { scene, id: maya, set: { character: { ...inst().character!, posture: 'standing' } } } }] });
  add('act.crouch@1', 0, 1);
  expect(performAt(session.state, scene, maya, s(2), assets).pose.posture).toBe('crouched');
  add('act.get-up@1', 2, 3.4);
  expect(performAt(session.state, scene, maya, s(4), assets).pose.posture).toBe('standing');
  const actionOf = (r: string) => (lib.manifest(r)?.data as { action?: ActionData } | undefined)?.action;
  const x0 = inst().transform.x;
  add('act.enter@1', 5, 7);
  expect(motionAt(sc(), inst(), s(5.05), actionOf).x).toBeLessThan(0); // off the left edge (the character stands left of centre)
  expect(motionAt(sc(), inst(), s(7.5), actionOf).x).toBeCloseTo(x0, 0);
  const flip0 = motionAt(sc(), inst(), s(7.5), actionOf).flip;
  add('act.turn-around@1', 8, 9);
  expect(motionAt(sc(), inst(), s(8.5), actionOf).view).toBe('front');
  expect(motionAt(sc(), inst(), s(9.5), actionOf).flip).toBe(!flip0);
  add('act.exit@1', 10, 12);
  expect(motionAt(sc(), inst(), s(12.5), actionOf).x).toBeLessThan(0);
});

it('the interaction recipes (G1) expand into editable clips with no missing assets', async () => {
  const { recipeCommandsForLibrary } = await import('@frame/io');
  for (const [ref, roles] of [['rcp.handshake@1', ['a', 'b']], ['rcp.hug@1', ['a', 'b']], ['rcp.high-five@1', ['a', 'b']], ['rcp.victory-moment@1', ['winner']], ['rcp.entrance@1', ['who']], ['rcp.exit-in-a-huff@1', ['who']]] as const) {
    const { session, scene, maya, leo } = buildSampleScene('flat');
    const ids = [maya, leo];
    const ex = recipeCommandsForLibrary(session.state, scene, ref, { roles: Object.fromEntries(roles.map((r, i) => [r, ids[i]!])), at: s(1) }, { lib, styles });
    expect(ex.warnings, ref).toEqual([]);
    session.apply({ commands: ex.commands });
    const ev = evaluateFrame(session.state, scene, s(2), { assets, styles, width: 192, height: 108 });
    expect(ev.issues, ref).toEqual([]);
  }
});
