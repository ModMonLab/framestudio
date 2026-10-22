import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrame, secondsToTicks, trackFor } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
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

/** Mean RGB of a frame. */
function mean(rgba: Uint8Array): [number, number, number] {
  let a = 0;
  let b = 0;
  let c = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    a += rgba[i]!;
    b += rgba[i + 1]!;
    c += rgba[i + 2]!;
  }
  return [a / n, b / n, c / n];
}

describe('effects, atmosphere and transitions (FR-FX-01..04)', () => {
  it('weather, lighting, grades, symbols, silhouettes, freeze and shot transitions render identically and deterministically', () => {
    const { session, scene, maya, leo } = buildSampleScene('flat');
    const sc = () => session.state.scenes[scene]!;
    const fx = sc().tracks.find((t) => t.kind === 'effect' && t.owner === 'scene')!.id;
    const shotTrack = sc().tracks.find((t) => t.kind === 'shot')!.id;
    const ev = (t: number, w = 480, h = 270) => evaluateFrame(session.state, scene, s(t), { assets, styles, width: w, height: h });
    const base = mean(r.rgba(ev(1).frame));
    const add = (asset: string, start: number, end: number, params: Record<string, unknown> = {}) =>
      session.apply({ commands: [{ name: 'clip.add', params: { scene, track: fx, start: s(start), end: s(end), asset, params, blendIn: 0, blendOut: 0 } }] }).commands[0]!.params.id as string;

    // Night lighting darkens and blues the frame; rain adds streaks; a noir grade removes colour.
    const night = add('atmo.night@1', 0, 2);
    const lit = mean(r.rgba(ev(1).frame));
    expect(lit[0] + lit[1] + lit[2]).toBeLessThan((base[0] + base[1] + base[2]) * 0.8);
    session.apply({ commands: [{ name: 'clip.remove', params: { scene, ids: [night] } }] });
    add('atmo.heavy-rain@1', 0, 2);
    const rain1 = JSON.stringify(ev(1).frame);
    expect(rain1).toBe(JSON.stringify(ev(1).frame)); // deterministic at a time
    expect(rain1).not.toBe(JSON.stringify(ev(1.1).frame)); // moves over time
    add('atmo.noir@1', 2, 3);
    const noir = r.rgba(ev(2.5).frame);
    let colourful = 0;
    for (let i = 0; i < noir.length; i += 4) if (Math.max(Math.abs(noir[i]! - noir[i + 1]!), Math.abs(noir[i + 1]! - noir[i + 2]!)) > 12) colourful++;
    expect(colourful / (noir.length / 4)).toBeLessThan(0.01);

    // A symbol follows its character; a silhouette turns the character dark.
    add('fx.question-mark@1', 3, 4, { attach: leo });
    const q = ev(3.5);
    expect(JSON.stringify(q.frame)).toContain('"text":"?"');
    add('fx.dramatic-silhouette@1', 4, 5, { attach: maya });
    expect(JSON.stringify(ev(4.5).frame)).toContain('colorMatrix');

    // Freeze holds the picture while time moves on.
    add('fx.freeze-frame@1', 6, 7);
    expect(JSON.stringify(ev(6.2).frame.items.slice(0, 5))).toBe(JSON.stringify(ev(6.8).frame.items.slice(0, 5)));

    // The shot at 5 s (cut to Leo) gets a crossfade: halfway through, both pictures are blended.
    const leoShot = sc().clips.find((c) => c.track === shotTrack && c.start === s(5))!;
    session.apply({ commands: [{ name: 'clip.update', params: { scene, id: leoShot.id, set: { params: { transition: 'tr.crossfade@1', transitionS: 1 } } } }] });
    const mid = ev(5.5);
    const groups = mid.frame.items.filter((i) => i.k === 'group' && !('id' in i && i.id));
    expect(groups.some((g) => g.k === 'group' && g.op !== undefined && g.op > 0.3 && g.op < 0.7)).toBe(true);
    const a = mean(r.rgba(ev(4.95).frame));
    const b = mean(r.rgba(ev(6.2).frame));
    const m = mean(r.rgba(mid.frame));
    for (let i = 0; i < 3; i++) expect(m[i]!).toBeGreaterThan(Math.min(a[i]!, b[i]!) - 6);

    if (process.env.FRAME_DEBUG_PNG) {
      for (const t of [1, 2.5, 3.5, 4.5, 5.5]) fs.writeFileSync(`${process.env.FRAME_DEBUG_PNG}-fx-${t}.png`, r.png(ev(t, 960, 540).frame));
    }
    expect(trackFor(sc(), maya, 'acting')).toBeTruthy();
  });
});
