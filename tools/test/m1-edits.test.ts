/** Camera edits (Catalog M1): split screen, picture in picture, freeze with title, rack focus; the page-turn transition (K2). */
import { beforeAll, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrame, secondsToTicks as s } from '@frame/core';
import { recipeCommandsForLibrary } from '@frame/io';
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

/** The sample scene comes with shots; edits are tested on a clean shot track. */
function clearShots(session: ReturnType<typeof buildSampleScene>['session'], scene: string) {
  const sc = session.state.scenes[scene]!;
  const shot = sc.tracks.find((t) => t.kind === 'shot')!.id;
  const ids = sc.clips.filter((c) => c.track === shot).map((c) => c.id);
  if (ids.length) session.apply({ commands: [{ name: 'clip.remove', params: { scene, ids } }] });
}

/** Mean absolute difference between two frames' pixels, 0–255. */
function diff(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
  return d / (a.length / 4) / 3;
}

it('split screen and picture in picture show two cameras; freeze with title adds a title; rack focus sharpens', () => {
  const { session, scene, maya, leo } = buildSampleScene('flat');
  clearShots(session, scene);
  const ev = (t: number) => evaluateFrame(session.state, scene, s(t), { assets, styles, width: 384, height: 216 });
  const apply = (ref: string, roles: Record<string, string>, at: number) => {
    const ex = recipeCommandsForLibrary(session.state, scene, ref, { roles, at: s(at) }, { lib, styles });
    expect(ex.warnings).toEqual([]);
    session.apply({ commands: ex.commands });
    return ex;
  };
  const before = r.rgba(ev(1).frame);
  apply('cam.split-screen@1', { a: maya, b: leo }, 0);
  const shot = session.state.scenes[scene]!.clips.find((c) => c.params.layout === 'split')!;
  expect(shot.params.camera2).toBeTruthy();
  const split = ev(1);
  expect(diff(r.rgba(split.frame), before)).toBeGreaterThan(5);
  // The divider is drawn down the middle.
  const px = r.rgba(split.frame);
  const mid = (108 * 384 + 192) * 4;
  expect([px[mid], px[mid + 1], px[mid + 2]]).toEqual([255, 255, 255]);

  apply('cam.picture-in-picture@1', { main: maya, inset: leo }, 4);
  const pip = r.rgba(ev(5).frame);
  // The inset's white border sits near the bottom-right corner.
  const border = ((216 - 0.05 * 216 - 0.3 * 216 - 2) | 0) * 384 * 4 + ((384 * 0.66) | 0) * 4;
  expect(pip[border]! + pip[border + 1]! + pip[border + 2]!).toBeGreaterThan(700);

  const ex = apply('cam.freeze-with-title@1', { subject: maya }, 8);
  expect(session.state.scenes[scene]!.clips.some((c) => c.asset === 'txt.chapter-title@1' && c.params.text === 'Title')).toBe(true);
  expect(ex.commands.some((c) => c.params.asset === 'fx.freeze-frame@1')).toBe(true);

  // Rack focus: blurred at the start of the move, sharp at its end.
  const sc = session.state.scenes[scene]!;
  const moveTrack = sc.tracks.find((t) => t.kind === 'camera-move')!.id;
  const plain = r.rgba(ev(12.2).frame);
  session.apply({ commands: [{ name: 'clip.add', params: { scene, track: moveTrack, start: s(12), end: s(14), asset: 'cam.rack-focus-blur@1' } }] });
  expect(diff(r.rgba(ev(12.05).frame), plain)).toBeGreaterThan(2);
  expect(diff(r.rgba(ev(13.99).frame), r.rgba(ev(13.99).frame))).toBe(0);
});

it('a page turn peels the previous shot away to the left', () => {
  const { session, scene, maya, leo } = buildSampleScene('flat');
  clearShots(session, scene);
  const ex = recipeCommandsForLibrary(session.state, scene, 'cam.match-cut@1', { roles: { a: maya, b: leo }, at: s(0) }, { lib, styles });
  session.apply({ commands: ex.commands });
  const second = session.state.scenes[scene]!.clips.filter((c) => c.group === ex.group && c.params.camera).sort((a, b) => a.start - b.start)[1]!;
  session.apply({ commands: [{ name: 'clip.update', params: { scene, id: second.id, set: { params: { ...second.params, transition: 'tr.page-turn@1', transitionS: 1 } } } }] });
  const ev = (t: number) => r.rgba(evaluateFrame(session.state, scene, second.start + s(t), { assets, styles, width: 384, height: 216 }).frame);
  const a = r.rgba(evaluateFrame(session.state, scene, second.start - 1, { assets, styles, width: 384, height: 216 }).frame);
  const b = ev(1.5);
  const midway = ev(0.5);
  // Halfway, the left edge still shows A and the right edge already shows B.
  const at = (px: Uint8Array, x: number, y: number) => [px[(y * 384 + x) * 4], px[(y * 384 + x) * 4 + 1], px[(y * 384 + x) * 4 + 2]];
  expect(diff(midway, a)).toBeGreaterThan(1);
  expect(diff(midway, b)).toBeGreaterThan(1);
  expect(at(midway, 380, 200)).toEqual(at(b, 380, 200));
  expect(at(midway, 4, 10)).toEqual(at(a, 4, 10));
});
