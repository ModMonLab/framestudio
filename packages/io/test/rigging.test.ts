import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePsdUint8Array, type Layer } from 'ag-psd';
import { checkCharacter, evaluateFrame, rigArtwork, rigProp, rigSet, suggestPlane, suggestPropTarget, suggestTarget, mouthLetter, type RigLayer } from '@frame/core';
import { libraryFor, loadStyles } from '@frame/assets/node';
import { createNodeRenderer } from '@frame/render/node';
import { readLayeredArtwork, sniffRaster, type OpenProject } from '../src/index.js';
import { CHAR, newProject } from './helpers.js';

const CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content');
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

/** A solid-colour layer. */
function rect(name: string, left: number, top: number, w: number, h: number, rgb: [number, number, number], hidden = false): Layer {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { name, left, top, right: left + w, bottom: top + h, hidden, imageData: { width: w, height: h, data } };
}

const MOUTHS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
/** A simple figure: 400 × 900 artwork, head on top, torso, arms, legs; every mouth shape a different width. */
function figure(view: string, mouths: string[]): Layer {
  return {
    name: view,
    children: [
      rect('leg_L', 205, 560, 40, 300, [40, 60, 120]), rect('leg_R', 155, 560, 40, 300, [40, 60, 120]),
      rect('torso', 140, 250, 120, 320, [200, 60, 60]),
      rect('upper_arm_L', 262, 260, 30, 150, [200, 60, 60]), rect('forearm_L', 262, 410, 26, 140, [230, 180, 140]),
      rect('upper_arm_R', 108, 260, 30, 150, [200, 60, 60]), rect('forearm_R', 112, 410, 26, 140, [230, 180, 140]),
      rect('head', 130, 40, 140, 180, [230, 180, 140]),
      rect('eye_L', 215, 110, 16, 16, [20, 20, 20]), rect('eye_R', 169, 110, 16, 16, [20, 20, 20]),
      ...mouths.map((m, i) => rect(`mouth_${m}`, 200 - (10 + i * 4), 170, 2 * (10 + i * 4), 12, [120, 20, 30], m !== 'X')),
    ],
  };
}

function psd(views: [string, string[]][]): Uint8Array {
  return writePsdUint8Array({ width: 400, height: 900, children: views.map(([v, m]) => figure(v, m)) }, { generateThumbnail: false } as never);
}

function store(p: OpenProject, layers: ReturnType<typeof readLayeredArtwork>['layers']): RigLayer[] {
  return layers.map((l) => ({ id: l.id, name: l.name, ...(l.view ? { view: l.view } : {}), bounds: l.bounds, ...(l.png ? { media: p.store.putMedia(l.png, { ext: 'png', mime: 'image/png' }).hash } : {}), ...(l.paths ? { paths: l.paths } : {}) }));
}

describe('rigging assistant (FR-IMP-03, AC-12 path)', () => {
  it('suggests targets from layer names', () => {
    expect(suggestTarget('Head')).toBe('head');
    expect(suggestTarget('eye_L')).toBe('eyes');
    expect(suggestTarget('Upper Arm R')).toBe('upper_arm_R');
    expect(suggestTarget('left hand')).toBe('hand_L');
    expect(suggestTarget('hair back')).toBe('hair_back');
    expect(suggestTarget('Shirt')).toBe('torso');
    expect(suggestTarget('Background')).toBe('ignore');
    expect(mouthLetter('mouth_C')).toBe('C');
    expect(mouthLetter('Mouth rest')).toBe('X');
  });

  it('reads a layered PSD with front and three-quarter views, rigs it, passes the rig check with declared view gaps, and renders it speaking', async () => {
    const bytes = psd([['Front', MOUTHS], ['Three-quarter', ['X']]]);
    const art = readLayeredArtwork(bytes, 'hero.psd');
    expect(art.source).toBe('psd');
    expect(art.views).toEqual(['front', 'three']);
    const head = art.layers.find((l) => l.name === 'head' && l.view === 'front')!;
    expect(head.bounds).toEqual([130, 40, 140, 180]);
    expect(sniffRaster(head.png!)).toMatchObject({ format: 'png', width: 140, height: 180 });
    expect(art.layers.find((l) => l.name === 'mouth_A')!.hidden).toBe(true);

    const p = newProject();
    const scene = Object.keys(p.state.scenes)[0]!;
    const layers = store(p, art.layers);
    const base = { name: 'Hero', layers, mapping: {}, newId: ids, author: 'tester', date: '2026-10-22', sourceFile: 'hero.psd', rights: 'I made this' };
    // The three-quarter view has only a resting mouth: refused unless a library mouth fills in.
    const first = rigArtwork(base);
    expect(first.problems.some((x) => x.severity === 'error' && /mouth shapes/.test(x.message))).toBe(true);
    const lib0 = libraryFor({ contentDir: CONTENT });
    const libMouth = lib0.byKind('mouth')[0]!.manifest;
    const res = rigArtwork({ ...base, libraryParts: { mouth: `${libMouth.id}@${libMouth.version}` } });
    expect(res.problems.filter((x) => x.severity === 'error')).toEqual([]);
    expect(res.views).toEqual(['front', 'three']);
    expect(res.character.viewExemptions).toMatchObject({ side: expect.any(String), back: expect.any(String) });
    expect(res.mouthShapes).toHaveLength(9);

    p.session.apply({ commands: [...res.parts, res.character].map((manifest) => ({ name: 'asset.addLocal', params: { manifest } })) });
    const lib = libraryFor({ contentDir: CONTENT, projectAssets: p.state.assets });
    const check = checkCharacter(res.character, (r) => lib.manifest(r));
    expect(check.problems.filter((x) => x.severity === 'error')).toEqual([]);
    expect(check.ok).toBe(true);
    expect(check.views).toEqual(['front', 'three', 'side', 'back']); // drawn or declared gaps
    expect(check.mouthShapes).toBe(9);

    // Use in a scene and render through the one renderer.
    const ref = `${res.character.id}@1`;
    p.session.apply({ commands: [{ name: 'instance.add', params: { scene, kind: 'character', asset: ref, name: 'Hero', transform: { x: 960, y: 1000 }, character: { ...CHAR, look: 'default', view: 'front', auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } } }] });
    const r = await createNodeRenderer({ fontsDir: path.join(CONTENT, 'fonts'), images: (src) => {
      const f = src.startsWith('media:') ? p.store.findMedia(src.slice(6)) : undefined;
      return f ? new Uint8Array(fs.readFileSync(f)) : undefined;
    } });
    const ev = evaluateFrame(p.state, scene, 0, { assets: { manifest: (x) => lib.manifest(x) }, styles: loadStyles(CONTENT), width: 480, height: 270, background: '#000000' });
    expect(ev.issues).toEqual([]);
    const box = ev.boxes[Object.values(p.state.scenes[scene]!.instances).find((i) => i.name === 'Hero')!.id]!;
    expect(box.h).toBeGreaterThan(80);
    const rgba = r.rgba(ev.frame);
    let skin = 0;
    let shirt = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] === 230 && rgba[i + 1] === 180 && rgba[i + 2] === 140) skin++;
      if (rgba[i] === 200 && rgba[i + 1] === 60 && rgba[i + 2] === 60) shirt++;
    }
    expect(skin).toBeGreaterThan(50);
    expect(shirt).toBeGreaterThan(50);
    if (process.env.FRAME_DEBUG_PNG) {
      // Manual inspection aid: front view at rest and the three-quarter view mid-wave.
      fs.writeFileSync(`${process.env.FRAME_DEBUG_PNG}-front.png`, r.png(ev.frame));
      const wave = lib.byKind('act').find((a) => a.manifest.id.includes('wave'))!.manifest;
      const sc = p.state.scenes[scene]!;
      const acting = sc.tracks.find((t) => t.kind === 'acting' && t.owner !== 'scene')!;
      p.session.apply({ commands: [{ name: 'clip.add', params: { scene, track: acting.id, start: 0, end: 96000, asset: `${wave.id}@${wave.version}` } }, { name: 'instance.update', params: { scene, id: sc.instances.find((i) => i.name === 'Hero')!.id, set: { character: { view: 'three' } } } }] });
      const ev2 = evaluateFrame(p.state, scene, 24000, { assets: { manifest: (x) => lib.manifest(x) }, styles: loadStyles(CONTENT), width: 480, height: 270, background: '#000000' });
      fs.writeFileSync(`${process.env.FRAME_DEBUG_PNG}-wave.png`, r.png(ev2.frame));
    }
  });

  const count = (rgba: Uint8Array, rgb: [number, number, number]) => {
    let n = 0;
    for (let i = 0; i < rgba.length; i += 4) if (rgba[i] === rgb[0] && rgba[i + 1] === rgb[1] && rgba[i + 2] === rgb[2]) n++;
    return n;
  };
  const renderer = (p: OpenProject) => createNodeRenderer({ fontsDir: path.join(CONTENT, 'fonts'), images: (src) => {
    const f = src.startsWith('media:') ? p.store.findMedia(src.slice(6)) : undefined;
    return f ? new Uint8Array(fs.readFileSync(f)) : undefined;
  } });

  it('rigs a prop with states from state layers and switches them in a scene', async () => {
    expect(suggestPropTarget({ name: 'state_on' })).toBe('state:on');
    expect(suggestPropTarget({ name: 'glow', group: 'State: Off' })).toBe('state:off');
    expect(suggestPropTarget({ name: 'Open' })).toBe('state:open');
    expect(suggestPropTarget({ name: 'stand' })).toBe('always');
    expect(suggestPropTarget({ name: 'Background' })).toBe('ignore');
    const bytes = writePsdUint8Array({ width: 200, height: 400, children: [
      rect('Background', 0, 0, 200, 400, [255, 255, 255]),
      rect('stand', 90, 100, 20, 300, [60, 60, 60]),
      { name: 'state_on', children: [rect('shade lit', 40, 20, 120, 90, [250, 220, 90])] },
      rect('state_off', 40, 20, 120, 90, [90, 90, 120]),
    ] }, { generateThumbnail: false } as never);
    const art = readLayeredArtwork(bytes, 'lamp.psd');
    const p = newProject();
    const scene = Object.keys(p.state.scenes)[0]!;
    const layers = store(p, art.layers).map((l, i) => ({ ...l, ...(art.layers[i]!.group ? { group: art.layers[i]!.group } : {}) }));
    const res = rigProp({ name: 'Lamp', layers, mapping: {}, height: 400, newId: ids, author: 'tester', date: '2026-10-22', sourceFile: 'lamp.psd', rights: 'I made this' });
    expect(res.problems.filter((x) => x.severity === 'error')).toEqual([]);
    expect(res.states).toEqual(['on', 'off']);
    expect(res.asset.parameters).toEqual([{ key: 'state', label: 'State', type: 'enum', options: ['on', 'off'], default: 'on' }]);
    // Origin at the bottom centre of the used layers (the background is ignored): 120 wide, 380 tall, scaled to 400.
    const bb = (res.asset.anchors as { bounds: number[] }).bounds;
    expect(bb[2]).toBeCloseTo(120 * 400 / 380, 1);
    expect(bb[3]).toBeCloseTo(400, 1);

    p.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest: res.asset } }] });
    const lib = libraryFor({ contentDir: CONTENT, projectAssets: p.state.assets });
    const ref = `${res.asset.id}@1`;
    const added = p.session.apply({ commands: [{ name: 'instance.add', params: { scene, kind: 'prop', asset: ref, name: 'Lamp', transform: { x: 960, y: 1000 } } }] });
    const id = added.commands[0]!.params.id as string;
    const r = await renderer(p);
    const frame = () => evaluateFrame(p.state, scene, 0, { assets: { manifest: (x) => lib.manifest(x) }, styles: loadStyles(CONTENT), width: 480, height: 270, background: '#000000' });
    const on = frame();
    expect(on.issues).toEqual([]);
    const lit = r.rgba(on.frame);
    expect(count(lit, [250, 220, 90])).toBeGreaterThan(100); // unset state draws the default (on)
    expect(count(lit, [90, 90, 120])).toBe(0);
    expect(count(lit, [60, 60, 60])).toBeGreaterThan(20);
    expect(count(lit, [255, 255, 255])).toBe(0);
    p.session.apply({ commands: [{ name: 'instance.update', params: { scene, id, set: { propState: 'off' } } }] });
    const off = r.rgba(frame().frame);
    expect(count(off, [250, 220, 90])).toBe(0);
    expect(count(off, [90, 90, 120])).toBeGreaterThan(100);
  });

  it('rigs a set into a location kit with set pieces on depth planes', async () => {
    expect(suggestPlane({ name: 'Sky' })).toBe('far');
    expect(suggestPlane({ name: 'floor' })).toBe('ground');
    expect(suggestPlane({ name: 'Wall' })).toBe('back');
    expect(suggestPlane({ name: 'desk' })).toBe('mid');
    expect(suggestPlane({ name: 'Foreground plant' })).toBe('front');
    const bytes = writePsdUint8Array({ width: 960, height: 540, children: [
      rect('Sky', 0, 0, 960, 300, [120, 170, 230]),
      rect('Floor', 0, 400, 960, 140, [150, 110, 70]),
      rect('Desk', 380, 300, 200, 120, [90, 60, 40]),
    ] }, { generateThumbnail: false } as never);
    const art = readLayeredArtwork(bytes, 'office.psd');
    const p = newProject();
    const scene = Object.keys(p.state.scenes)[0]!;
    const res = rigSet({ name: 'Office', layers: store(p, art.layers), mapping: {}, width: art.width, height: art.height, output: { width: 1920, height: 1080 }, newId: ids, author: 'tester', date: '2026-10-22', sourceFile: 'office.psd', rights: 'I made this' });
    expect(res.problems).toEqual([]);
    expect(res.pieces.map((x) => [x.key, x.plane, x.at])).toEqual([['sky', 'far', [960, 600]], ['floor', 'ground', [960, 1080]], ['desk', 'mid', [960, 840]]]);
    p.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest: res.asset } }] });
    const ref = `${res.asset.id}@1`;
    p.session.apply({ commands: res.pieces.map((x) => ({ name: 'instance.add', params: { scene, kind: 'set-piece', asset: ref, name: x.name, transform: { x: x.at[0], y: x.at[1] }, depthPlane: x.plane, params: { part: x.key } } })) });
    const lib = libraryFor({ contentDir: CONTENT, projectAssets: p.state.assets });
    const r = await renderer(p);
    const ev = evaluateFrame(p.state, scene, 0, { assets: { manifest: (x) => lib.manifest(x) }, styles: loadStyles(CONTENT), width: 480, height: 270, background: '#000000' });
    expect(ev.issues).toEqual([]);
    const rgba = r.rgba(ev.frame);
    // The set fills the frame: sky above, floor below, desk in front of both.
    expect(count(rgba, [120, 170, 230])).toBeGreaterThan(480 * 140);
    expect(count(rgba, [150, 110, 70])).toBeGreaterThan(480 * 55);
    expect(count(rgba, [90, 60, 40])).toBeGreaterThan(90 * 55);
    expect(count(rgba, [0, 0, 0])).toBeLessThan(480 * 270 * 0.15);
  });
});
