import { describe, expect, it, beforeAll } from 'vitest';
import path from 'node:path';
import { createNodeRenderer, type NodeRenderer } from '../src/node.js';
import { checkGolden } from '../src/golden.js';
import { compose, rotate, translate, type Frame } from '../src/index.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const fontsDir = path.resolve(here, '../../../content/fonts');
let r: NodeRenderer;

beforeAll(async () => {
  r = await createNodeRenderer({ fontsDir });
});

const sample: Frame = {
  width: 480,
  height: 270,
  background: '#EDE6DA',
  items: [
    { k: 'rect', x: 0, y: 190, w: 480, h: 80, fill: { linear: { from: [0, 190], to: [0, 270], stops: [{ offset: 0, color: '#B98C5E' }, { offset: 1, color: '#8A6440' }] } } },
    { k: 'group', tf: translate(140, 120), items: [
      { k: 'ellipse', cx: 0, cy: 0, rx: 46, ry: 54, fill: { color: '#E8B48F' }, stroke: { paint: { color: '#5A3B2A' }, width: 2 } },
      { k: 'path', d: 'M -20 -6 Q -14 -12 -8 -6 M 8 -6 Q 14 -12 20 -6', stroke: { paint: { color: '#2A1E18' }, width: 3 } },
      { k: 'path', d: 'M -14 22 Q 0 34 14 22 Z', fill: { color: '#7A2E2E' } },
    ] },
    { k: 'group', op: 0.6, blur: 4, items: [{ k: 'ellipse', cx: 330, cy: 200, rx: 70, ry: 10, fill: { color: '#000000' } }] },
    { k: 'rect', x: 280, y: 60, w: 100, h: 130, r: 10, fill: { radial: { center: [330, 110], radius: 90, stops: [{ offset: 0, color: '#6A90FF' }, { offset: 1, color: '#22336E' }] } }, tf: compose(translate(330, 125), rotate(-6), translate(-330, -125)) },
    { k: 'text', text: 'Frame — golden ✓', x: 240, y: 222, size: 24, family: 'Inter', weight: 700, color: '#FFFFFF', align: 'center', outline: { color: '#000000', width: 2 } },
    { k: 'text', text: '', spans: [{ text: 'Karaoke ', color: '#FFD84A', weight: 800 }, { text: 'words', color: '#FFFFFF' }], x: 20, y: 16, size: 18, family: 'Inter', color: '#FFFFFF' },
  ],
};

describe('renderer (FR-RND-01/02, NFR-03)', () => {
  it('renders deterministically: same display list → identical pixels', () => {
    const a = r.rgba(sample);
    const b = r.rgba(sample);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('matches the approved golden frame', () => {
    const res = checkGolden(r, path.join(here, 'golden'), 'sample-primitives', sample);
    expect(res.status, JSON.stringify(res)).not.toBe('mismatch');
  });

  it('measures text with bundled fonts', () => {
    const m = r.raster.measureText({ text: 'Hello Frame', size: 20, family: 'Inter' });
    expect(m.width).toBeGreaterThan(90);
    expect(m.width).toBeLessThan(140);
  });
});
