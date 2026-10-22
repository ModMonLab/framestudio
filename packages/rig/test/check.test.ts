import { describe, expect, it } from 'vitest';
import { rigCheck, rigCheckPasses, type PartData, type ViewArt } from '../src/index.js';

const view = (over: Partial<ViewArt> = {}): ViewArt => ({
  points: { a: { p: [0, 0] }, b: { p: [1, 0], d: { size: [0.1, 0] } }, c: { p: [0, 1] } },
  layers: [{ slot: 'hair.front', space: 'head', shapes: [{ id: 's', path: [['M', 'a'], ['L', 'b'], ['Q', 'c', 'a'], ['Z']], fill: 'hair', stroke: { c: 'hair.line', w: 2 } }] }],
  ...over,
});
const part = (over: Partial<PartData> = {}): PartData => ({
  slot: 'hair',
  families: { flat: { views: { front: view(), three: view(), side: view(), back: view() } }, illustrated: { views: { front: view(), three: view(), side: view(), back: view() } } },
  ...over,
});

describe('rig check (FR-AST-08, Catalog §0 rules 1–3)', () => {
  it('passes a complete part', () => {
    expect(rigCheck(part()).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('requires both families and all views or documented exemptions', () => {
    const missingFamily = part({ families: { flat: part().families.flat! } });
    expect(rigCheckPasses(rigCheck(missingFamily))).toBe(false);
    const noBack = part();
    delete noBack.families.flat!.views.back;
    expect(rigCheck(noBack).some((i) => i.view === 'back' && i.severity === 'error')).toBe(true);
    noBack.families.flat!.exempt = { back: 'Covered by the hood from behind' };
    expect(rigCheck(noBack).some((i) => i.view === 'back' && i.family === 'flat' && i.severity === 'error')).toBe(false);
  });

  it('rejects unknown slots, dangling point references, bad clips and fit spaces; warns on unknown colours', () => {
    const bad = view({
      layers: [
        { slot: 'hair.middle', shapes: [{ path: [['M', 'a']] }] },
        { slot: 'sleeve.*', space: 'elbow' as never, shapes: [{ path: [['M', 'zz']], clip: 'nope', fill: 'Not A Colour' }] },
      ],
    });
    const p = part();
    p.families.flat!.views.front = bad;
    const msgs = rigCheck(p).map((i) => `${i.severity}: ${i.message}`);
    expect(msgs).toContain('error: Unknown layering slot "hair.middle" (FR-CHR-07)');
    expect(msgs).toContain('error: Unknown fit space "elbow"');
    expect(msgs).toContain('error: Layer sleeve.*: path uses unknown point "zz"');
    expect(msgs).toContain('error: Layer sleeve.*: clips to unknown shape "nope"');
    expect(msgs).toContain('warning: Layer sleeve.*: colour "Not A Colour" is neither a palette slot nor #hex');
    // Near/far wildcard slots are valid when both resolutions exist.
    expect(msgs.some((m) => m.includes('Unknown layering slot "sleeve.*"'))).toBe(false);
  });

  it('checks parameter defaults', () => {
    const p = part({ params: [{ key: 'len', label: 'Length', type: 'number', default: 5, range: [0, 1] }, { key: 'part', label: 'Parting', type: 'enum', default: 'mid', options: ['left', 'right'] }] });
    expect(rigCheck(p).filter((i) => i.message.startsWith('Parameter')).length).toBe(2);
  });
});
