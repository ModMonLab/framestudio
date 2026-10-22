import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrame, secondsToTicks, trackFor, type EvaluatedFrame } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import type { Item } from '@frame/render';
import { createNodeRenderer, type NodeRenderer } from '../../packages/render/src/node.js';
import { buildSampleScene } from './sample-scene.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
const lib = bundledLibrary(content);
const styles = loadStyles(content);
const assets = { manifest: (r: string) => lib.manifest(r) };
const s = secondsToTicks;
let r: NodeRenderer;
beforeAll(async () => {
  r = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
});

/** Every text item in a frame with its absolute position (group transforms applied). */
function texts(ev: EvaluatedFrame): { text: string; x: number; y: number; size: number }[] {
  const out: { text: string; x: number; y: number; size: number }[] = [];
  const walk = (items: Item[], tf: number[]) => {
    for (const it of items) {
      const m = it.tf ? [tf[0]! * it.tf[0] + tf[2]! * it.tf[1], tf[1]! * it.tf[0] + tf[3]! * it.tf[1], tf[0]! * it.tf[2] + tf[2]! * it.tf[3], tf[1]! * it.tf[2] + tf[3]! * it.tf[3], tf[0]! * it.tf[4] + tf[2]! * it.tf[5] + tf[4]!, tf[1]! * it.tf[4] + tf[3]! * it.tf[5] + tf[5]!] : tf;
      if (it.k === 'group') walk(it.items, m);
      else if (it.k === 'text') out.push({ text: it.text, x: m[0]! * it.x + m[2]! * it.y + m[4]!, y: m[1]! * it.x + m[3]! * it.y + m[5]!, size: it.size * m[0]! });
    }
  };
  walk(ev.frame.items, [1, 0, 0, 1, 0, 0]);
  return out;
}

describe('bubbles, titles, graphics and world text (FR-TXT-03..05, AC-23 path)', () => {
  it('a bubble tracks a walking character; lower thirds stay in the safe area in every aspect ratio; world text moves with the camera', () => {
    const { session, scene, leo } = buildSampleScene('flat');
    const sc = () => session.state.scenes[scene]!;
    const text = sc().tracks.find((t) => t.kind === 'text' && t.owner === 'scene')!.id;
    const add = (asset: string, start: number, end: number, params: Record<string, unknown>) => session.apply({ commands: [{ name: 'clip.add', params: { scene, track: text, start: s(start), end: s(end), asset, params } }] });
    // Leo walks across while a bubble is attached to him.
    session.apply({ commands: [{ name: 'instance.update', params: { scene, id: leo, set: { character: { posture: 'standing' } } } }, { name: 'clip.add', params: { scene, track: trackFor(sc(), leo, 'acting')!.id, start: s(9), end: s(12), asset: 'act.walk@1', params: { path: [[500, 1000]] } } }] });
    add('txt.speech-bubble-round@1', 9, 12, { attach: leo, text: 'Wait for me!' });
    const at = (t: number) => {
      const ev = evaluateFrame(session.state, scene, s(t), { assets, styles, width: 960, height: 540 });
      return { bubble: texts(ev).find((x) => x.text === 'Wait for me!')!, box: ev.boxes[leo]! };
    };
    const a = at(9.6);
    const b = at(11.4);
    expect(b.box.x).toBeLessThan(a.box.x - 100); // he moved left
    expect(Math.abs(a.bubble.x - (a.box.x + a.box.w / 2))).toBeLessThan(240);
    expect(Math.abs(b.bubble.x - (b.box.x + b.box.w / 2))).toBeLessThan(240);
    expect(b.bubble.x).toBeLessThan(a.bubble.x); // the bubble went with him

    // Lower third and a title, in 16:9, 9:16 and 1:1: all text inside the 5 % safe margins.
    add('txt.name-and-role-lower-third@1', 0, 4, { text: 'Maya Bennett', subtitle: 'Host' });
    add('txt.cold-open-title@1', 4, 8, { text: 'The Backup Recording' });
    for (const [w, h] of [[960, 540], [540, 960], [720, 720]] as const) {
      for (const t of [1.5, 6]) {
        const ev = evaluateFrame(session.state, scene, s(t), { assets, styles, width: w, height: h });
        const all = texts(ev).filter((x) => x.text === 'Maya Bennett' || x.text === 'Host' || x.text === 'The Backup Recording');
        expect(all.length).toBeGreaterThan(0);
        for (const x of all) {
          expect(x.y).toBeGreaterThanOrEqual(h * 0.05);
          expect(x.y + x.size).toBeLessThanOrEqual(h * 0.95);
          if (x.text !== 'The Backup Recording') expect(x.x).toBeGreaterThanOrEqual(w * 0.05);
        }
      }
    }

    // World text: a sign on the stage moves with the camera (the Leo close-up starts at 5 s).
    add('txt.sign-text@1', 0, 12, { text: 'ON AIR', x: 1500, y: 300, width: 260 });
    const wide = texts(evaluateFrame(session.state, scene, s(4.5), { assets, styles, width: 960, height: 540 })).find((x) => x.text === 'ON AIR')!;
    const close = texts(evaluateFrame(session.state, scene, s(6), { assets, styles, width: 960, height: 540 })).find((x) => x.text === 'ON AIR')!;
    expect(close.size).toBeGreaterThan(wide.size * 1.5);
    if (process.env.FRAME_DEBUG_PNG) {
      for (const t of [1.5, 6, 9.6, 11.4]) fs.writeFileSync(`${process.env.FRAME_DEBUG_PNG}-txt-${t}.png`, r.png(evaluateFrame(session.state, scene, s(t), { assets, styles, width: 960, height: 540 }).frame));
      fs.writeFileSync(`${process.env.FRAME_DEBUG_PNG}-txt-portrait.png`, r.png(evaluateFrame(session.state, scene, s(1.5), { assets, styles, width: 540, height: 960 }).frame));
    }
  });
});
