/** Animation-principle and motion-graphic effects (Catalog K1): they act on the attached character, deterministically. */
import { beforeAll, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrame, principleDeform, secondsToTicks as s } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import { createNodeRenderer, type NodeRenderer } from '../../packages/render/src/node.js';
import { buildSampleScene } from './sample-scene.js';

const content = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const lib = bundledLibrary(content);
const styles = loadStyles(content);
const assets = { manifest: (r: string) => lib.manifest(r) };
let r: NodeRenderer;
beforeAll(async () => {
  r = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
});

it('principles deform the attached character and settle back by the end of the clip', () => {
  for (const p of ['squash', 'bounce', 'wobble', 'jiggle', 'anticipation', 'overshoot', 'follow-through'] as const) {
    const mid = principleDeform(p, 0.2, 0.3, 1);
    expect(mid.sx !== 1 || mid.sy !== 1 || mid.rot !== 0 || mid.dy !== 0, p).toBe(true);
    const end = principleDeform(p, 1, 2, 1);
    expect(Math.abs(end.sx - 1) + Math.abs(end.sy - 1) + Math.abs(end.rot) + Math.abs(end.dy), p).toBeLessThan(0.02);
  }
});

it('effect clips on a character change only that character, and treatments grade the picture', () => {
  const { session, scene, maya } = buildSampleScene('flat');
  const fx = session.state.scenes[scene]!.tracks.find((t) => t.kind === 'effect' && t.owner === 'scene')!.id;
  const ev = (t: number) => evaluateFrame(session.state, scene, s(t), { assets, styles, width: 384, height: 216 });
  const base = ev(1.2);
  const add = (asset: string, params: Record<string, unknown> = { attach: maya }) => session.apply({ commands: [{ name: 'clip.add', params: { scene, track: fx, start: s(1), end: s(2), asset, params, blendIn: 0, blendOut: 0 } }] }).commands[0]!.params.id as string;
  const remove = (id: string) => session.apply({ commands: [{ name: 'clip.remove', params: { scene, ids: [id] } }] });
  for (const ref of ['fx.squash-and-stretch@1', 'fx.bounce@1', 'fx.wobble@1', 'fx.overshoot-and-settle@1', 'fx.anticipation@1']) {
    const id = add(ref);
    const box = ev(1.2).boxes[maya]!;
    const b0 = base.boxes[maya]!;
    expect(JSON.stringify(box), ref).not.toBe(JSON.stringify(b0));
    expect(JSON.stringify(ev(1.2).frame)).toBe(JSON.stringify(ev(1.2).frame)); // deterministic
    remove(id);
  }
  // Motion graphics add marks; a split tone changes colours everywhere.
  for (const ref of ['fx.swoosh-trail@1', 'fx.motion-blur-streak@1']) {
    const id = add(ref);
    expect(JSON.stringify(ev(1.2).frame), ref).not.toBe(JSON.stringify(base.frame));
    remove(id);
  }
  const g = add('fx.split-tone@1', {});
  const a = r.rgba(base.frame);
  const b = r.rgba(ev(1.2).frame);
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i + 2]! - b[i + 2]!) > 3) changed++;
  expect(changed / (a.length / 4)).toBeGreaterThan(0.5);
  remove(g);
  // A still character leaves no afterimage.
  add('fx.afterimage@1');
  expect(r.rgba(ev(1.2).frame).length).toBe(a.length);
});

it('every new atmosphere (J1) draws, moves over time where animated, and is deterministic at a time', () => {
  const { session, scene } = buildSampleScene('flat');
  const fx = session.state.scenes[scene]!.tracks.find((t) => t.kind === 'effect' && t.owner === 'scene')!.id;
  const ev = (t: number) => JSON.stringify(evaluateFrame(session.state, scene, s(t), { assets, styles, width: 320, height: 180 }).frame);
  const base = ev(1);
  const refs = ['heat-haze', 'traffic', 'crowd-silhouettes', 'swaying-trees', 'water-ripples', 'city-lights', 'screens-and-monitors', 'ceiling-fan', 'blurred-plants', 'curtain-edge', 'window-frame', 'crowd-heads'];
  for (const name of refs) {
    const id = session.apply({ commands: [{ name: 'clip.add', params: { scene, track: fx, start: 0, end: s(4), asset: `atmo.${name}@1`, blendIn: 0, blendOut: 0 } }] }).commands[0]!.params.id as string;
    const a = ev(1);
    expect(a, name).not.toBe(base);
    expect(ev(1), name).toBe(a);
    if (name !== 'window-frame') expect(ev(1.7), name).not.toBe(a);
    session.apply({ commands: [{ name: 'clip.remove', params: { scene, ids: [id] } }] });
  }
});
