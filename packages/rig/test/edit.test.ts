import { describe, expect, it } from 'vitest';
import { convertFamily, evalPoint, mirrorView, movePoint, newPointName, rigCheck, usedPoints, type PartData, type ViewArt } from '../src/index.js';

const view = (): ViewArt => ({
  points: { a: { p: [0, 0] }, b: { p: [1, 0], d: { size: [0.1, 0] } }, c: { p: [0.5, 1] }, spare: { p: [3, 3] } },
  layers: [{ slot: 'hair.front', space: 'head', shapes: [{ id: 's', path: [['M', 'a'], ['L', 'b'], ['L', 'c'], ['Z']], fill: 'hair' }] }],
  anchors: { earL: { space: 'head', at: [0.9, 0] } },
});

describe('part editing (FR-PED-01/04)', () => {
  it('moves a point and draws a parameter binding', () => {
    const mp = view().points.b!;
    const moved = movePoint(mp, { size: 1 }, [2, 1]);
    expect(evalPoint(moved, { size: 1 })).toEqual([2, 1]);
    expect(moved.d).toEqual({ size: [0.1, 0] });
    const bound = movePoint(mp, { size: 0.5 }, [1.25, 0.5], 'size');
    expect(bound.p).toEqual([1, 0]);
    expect(evalPoint(bound, { size: 0.5 })).toEqual([1.25, 0.5]);
    expect(evalPoint(bound, { size: 0 })).toEqual([1, 0]);
    expect(movePoint(mp, { size: 0 }, [9, 9], 'size')).toEqual(mp);
  });

  it('lists used points, names new ones, and mirrors views', () => {
    expect([...usedPoints(view())].sort()).toEqual(['a', 'b', 'c']);
    expect(newPointName(view())).toBe('p5');
    const m = mirrorView(view());
    expect(m.points.b).toEqual({ p: [-1, 0], d: { size: [-0.1, 0] } });
    expect(m.anchors).toEqual({ earR: { space: 'head', at: [-0.9, 0] } });
  });

  it('drafts Illustrated from Flat (gradient shading, line work) and back, keeping the part valid', () => {
    const flat = { views: { front: view(), three: view(), side: view(), back: view() } };
    const ill = convertFamily(flat, 'illustrated');
    const s = ill.views.front!.layers[0]!.shapes![0]!;
    expect(s.fill).toEqual({ lin: { from: 'a', to: 'c', stops: [[0, 'hair.light'], [0.55, 'hair'], [1, 'hair.shade']] } });
    expect(s.stroke).toEqual({ c: 'line', w: 0.6, cap: 'round' });
    const part: PartData = { slot: 'hair', families: { flat, illustrated: ill } };
    expect(rigCheck(part).filter((i) => i.severity === 'error')).toEqual([]);
    const back = convertFamily(ill, 'flat');
    expect(back.views.front!.layers[0]!.shapes![0]).toEqual({ id: 's', path: view().layers[0]!.shapes![0]!.path, fill: 'hair' });
  });
});
