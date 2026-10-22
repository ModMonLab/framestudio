import { describe, expect, it } from 'vitest';
import { alignCommands, boxLines, snapDelta } from '../src/index.js';
import { newSession } from './helpers.js';

describe('placement (FR-STG-03)', () => {
  it('snaps an edge or centre to the nearest line within the threshold and reports the guide', () => {
    const moving = { x: 100, y: 100, w: 50, h: 80 };
    const lines = { x: [...boxLines([{ x: 300, y: 0, w: 40, h: 40 }]).x, { at: 205, kind: 'centre' as const }], y: [{ at: 300, kind: 'ground' as const }] };
    // Right edge 100+50+dx near 300 → snaps to 300.
    let r = snapDelta(moving, 147, 0, lines, 6);
    expect(r.dx).toBe(150);
    expect(r.guides).toEqual([{ axis: 'x', at: 300, kind: 'object' }]);
    // Centre near the stage centre line.
    r = snapDelta(moving, 78, 0, lines, 6);
    expect(r.dx).toBe(80);
    expect(r.guides[0]!.kind).toBe('centre');
    // Bottom onto a ground line; far from everything → unchanged.
    r = snapDelta(moving, 0, 118, lines, 6);
    expect(r.dy).toBe(120);
    expect(snapDelta(moving, 30, 30, lines, 6)).toEqual({ dx: 30, dy: 30, guides: [] });
  });

  it('aligns and distributes on boxes; locked objects stay', () => {
    const { session, scene } = newSession();
    const ids = session.apply({ commands: [100, 400, 1000].map((x) => ({ name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.mug@1', name: `M${x}`, transform: { x, y: 500 + x / 10 } } })) }).commands.map((c) => c.params.id as string);
    const sc = () => session.state.scenes[scene]!;
    const items = () => sc().instances.map((i) => ({ id: i.id, box: { x: i.transform.x - 20, y: i.transform.y - 40, w: 40, h: 40 } }));
    session.apply({ commands: alignCommands(sc(), items(), 'top') });
    expect(new Set(sc().instances.map((i) => i.transform.y)).size).toBe(1);
    session.apply({ commands: alignCommands(sc(), items(), 'distribute-h') });
    const xs = sc().instances.map((i) => i.transform.x).sort((a, b) => a - b);
    expect(xs[1]! - xs[0]!).toBe(xs[2]! - xs[1]!);
    session.apply({ commands: [{ name: 'instance.update', params: { scene, id: ids[0]!, set: { locked: true } } }] });
    const before = sc().instances.find((i) => i.id === ids[0])!.transform.x;
    session.apply({ commands: alignCommands(sc(), items(), 'right') });
    expect(sc().instances.find((i) => i.id === ids[0])!.transform.x).toBe(before);
    expect(alignCommands(sc(), items().slice(0, 2), 'distribute-v')).toEqual([]);
  });
});
