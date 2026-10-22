import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrame } from '@frame/core';
import { libraryFor, loadStyles } from '@frame/assets/node';
import { createNodeRenderer } from '@frame/render/node';
import { FrameError } from '@frame/schema';
import { checkRaster, encodeWav, importFile, parseSvg, sniffRaster, type OpenProject } from '../src/index.js';
import { newProject } from './helpers.js';

const CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content');
const enc = new TextEncoder();
let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    return (e as FrameError).code;
  }
  return 'ok';
};

async function renderAt(p: OpenProject, scene: string, w = 480, h = 270) {
  const lib = libraryFor({ contentDir: CONTENT, projectAssets: p.state.assets });
  const r = await createNodeRenderer({ fontsDir: path.join(CONTENT, 'fonts'), images: (src) => {
    const f = src.startsWith('media:') ? p.store.findMedia(src.slice(6)) : undefined;
    return f ? new Uint8Array(fs.readFileSync(f)) : undefined;
  } });
  const ev = evaluateFrame(p.state, scene, 0, { assets: { manifest: (x) => lib.manifest(x) }, styles: loadStyles(CONTENT), width: w, height: h, background: '#000000' });
  return { rgba: r.rgba(ev.frame), ev, r };
}
const px = (rgba: Uint8Array, w: number, x: number, y: number) => Array.from(rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 3));

describe('image and audio import (FR-IMP-01/02)', () => {
  it('parses SVG into layers of paths with transforms and refuses unsafe documents', () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="200" height="100" viewBox="0 0 200 100">
      <defs><linearGradient id="g"><stop offset="0" stop-color="#336699"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
      <rect width="200" height="100" fill="#eeeeee"/>
      <g id="head" inkscape:label="head" transform="translate(10 20)"><circle cx="50" cy="30" r="20" fill="url(#g)"/><path d="M0 0 L10 10 Z" style="fill:none;stroke:rgb(255,0,0);stroke-width:2"/></g>
      <g data-name="eye_L"><ellipse cx="150" cy="50" rx="5" ry="8" fill="black" opacity="0.5"/><script>alert(1)</script><image href="http://evil/x.png"/></g>
    </svg>`;
    const { drawing, warnings } = parseSvg(svg);
    expect(drawing.layers.map((l) => l.name)).toEqual(['Background', 'head', 'eye_L']);
    const head = drawing.layers[1]!;
    expect(head.shapes[0]).toMatchObject({ fill: '#336699', tf: [1, 0, 0, 1, 10, 20] });
    expect(head.shapes[1]).toMatchObject({ stroke: '#FF0000', strokeWidth: 2 });
    expect(head.shapes[1]!.fill).toBeUndefined();
    expect(head.bounds[0]).toBeCloseTo(10, 0);
    expect(head.bounds[1]).toBeCloseTo(20, 0);
    expect(drawing.layers[2]!.shapes[0]).toMatchObject({ fill: '#000000', opacity: 0.5 });
    // Bounds contain the shape (arcs are bounded loosely by their radii).
    const [bx, by, bw, bh] = drawing.layers[2]!.bounds;
    expect(bx).toBeLessThanOrEqual(145);
    expect(by).toBeLessThanOrEqual(42);
    expect(bx + bw).toBeGreaterThanOrEqual(155);
    expect(by + bh).toBeGreaterThanOrEqual(58);
    expect(warnings.join(' ')).toMatch(/script/);
    expect(warnings.join(' ')).toMatch(/image/);
    expect(warnings.join(' ')).toMatch(/Gradients/);
    expect(code(() => parseSvg('<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg width="1" height="1"><rect width="1" height="1"/></svg>'))).toBe('VALIDATION_FAILED');
    expect(code(() => parseSvg('<svg width="10" height="10"><rect width="1"'))).toBe('VALIDATION_FAILED');
    expect(code(() => parseSvg('<html><body/></html>'))).toBe('VALIDATION_FAILED');
    expect(code(() => parseSvg('<svg width="10" height="10"><text>hi</text></svg>'))).toBe('VALIDATION_FAILED');
  });

  it('recognises raster formats by content, not name, and enforces limits', async () => {
    const r = await createNodeRenderer({ fontsDir: path.join(CONTENT, 'fonts') });
    const png = r.png({ width: 64, height: 32, background: '#FF0000', items: [] });
    expect(sniffRaster(png)).toMatchObject({ format: 'png', width: 64, height: 32 });
    expect(code(() => checkRaster(enc.encode('GIF89a not supported here')))).toBe('VALIDATION_FAILED');
    // Minimal headers of the other formats.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03, 0, 0, 0, 0, 0, 0]);
    expect(sniffRaster(jpeg)).toMatchObject({ format: 'jpeg', width: 64, height: 48 });
    const webp = new Uint8Array(30);
    webp.set(enc.encode('RIFF'), 0);
    webp.set(enc.encode('WEBPVP8X'), 8);
    webp.set([99, 0, 0, 49, 0, 0], 24);
    expect(sniffRaster(webp)).toMatchObject({ format: 'webp', width: 100, height: 50 });
  });

  it('imports a PNG and an SVG as image assets with provenance, places them, and renders them with the one renderer', async () => {
    const p = newProject();
    const scene = Object.keys(p.state.scenes)[0]!;
    const r0 = await createNodeRenderer({ fontsDir: path.join(CONTENT, 'fonts') });
    const png = r0.png({ width: 200, height: 100, background: '#FF0000', items: [] });
    expect(code(() => importFile(p, png, { fileName: 'red.png', rights: 'licensed', author: 't' }))).toBe('USAGE');
    const dry = importFile(p, png, { fileName: 'red.png', rights: 'own', author: 'tester', scene, as: 'background', dryRun: true }, { newId: ids });
    expect(dry.dryRun).toBe(true);
    expect(Object.keys(p.state.assets)).toEqual([]);
    const res = importFile(p, png, { fileName: 'red.png', rights: 'own', author: 'tester', scene, as: 'background' }, { newId: ids, now: '2026-10-22T00:00:00Z' });
    const m = p.state.assets[res.asset!]!;
    expect(m.kind).toBe('img');
    expect(m.provenance).toMatchObject({ method: 'imported', sourceFile: 'red.png', date: '2026-10-22', author: 'tester' });
    expect(m.license).toMatchObject({ commercialUse: true });
    expect(p.store.verifyMedia(res.media!)).toBe(true);
    const inst = p.state.scenes[scene]!.instances.find((i) => i.id === res.instance)!;
    expect(inst.kind).toBe('image');
    expect(inst.transform.scale).toBeGreaterThan(1); // covers the stage
    let out = await renderAt(p, scene);
    expect(px(out.rgba, 480, 240, 135)).toEqual([255, 0, 0]);
    expect(out.ev.issues).toEqual([]);

    const svg = enc.encode('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 100 100"><g id="disc"><circle cx="50" cy="50" r="50" fill="#0000ff"/></g></svg>');
    const v = importFile(p, svg, { fileName: 'blue disc.svg', rights: 'public-domain', author: 'tester', scene, x: 960, y: 540 }, { newId: ids });
    expect(p.state.assets[v.asset!]!.name).toBe('blue disc');
    out = await renderAt(p, scene);
    expect(px(out.rgba, 480, 240, 135)).toEqual([0, 0, 255]);
    // One undo removes the import.
    p.session.undo();
    out = await renderAt(p, scene);
    expect(px(out.rgba, 480, 240, 135)).toEqual([255, 0, 0]);
  });

  it('imports audio as a music clip with measured duration and refuses files that do not decode', () => {
    const p = newProject();
    const scene = Object.keys(p.state.scenes)[0]!;
    const sr = 48000;
    const tone = new Float32Array(sr * 2).map((_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / sr));
    const wav = encodeWav({ sampleRate: sr, channels: 1, data: [tone] });
    const res = importFile(p, wav, { fileName: 'theme.wav', rights: 'licensed', licence: 'CC-BY-4.0', attribution: 'Composer', author: 't', scene, as: 'music', at: 48000 }, { newId: ids });
    const sc = p.state.scenes[scene]!;
    const clip = sc.clips.find((c) => c.id === res.clip)!;
    expect(sc.tracks.find((t) => t.id === clip.track)!.kind).toBe('music');
    expect(clip.end - clip.start).toBe(2 * 48000);
    expect(clip.start).toBe(48000);
    expect(clip.media).toBe(res.media);
    expect((clip.params.provenance as { licence: string }).licence).toBe('CC-BY-4.0');
    expect(code(() => importFile(p, enc.encode('RIFF....not audio'), { fileName: 'broken.wav', rights: 'own', author: 't', scene }))).toBe('VALIDATION_FAILED');
    expect(code(() => importFile(p, wav, { fileName: 'x.exe', rights: 'own', author: 't' }))).toBe('VALIDATION_FAILED');
    expect(code(() => importFile(p, wav, { fileName: 'x.wav', rights: 'own', author: 't', scene, as: 'background' }))).toBe('USAGE');
  });
});
