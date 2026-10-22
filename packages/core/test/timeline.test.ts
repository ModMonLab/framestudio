import { describe, expect, it } from 'vitest';
import { newSession } from './helpers.js';
import { secondsToTicks as s } from '../src/index.js';

describe('timeline editing commands (FR-TML-02/04)', () => {
  const setup = () => {
    const { session, scene } = newSession();
    const track = session.state.scenes[scene]!.tracks.find((t) => t.kind === 'sfx')!.id;
    const add = (a: number, b: number) => session.apply({ commands: [{ name: 'clip.add', params: { scene, track, start: s(a), end: s(b), params: {} } }] }).commands[0]!.params.id as string;
    const ids = [add(0, 1), add(1, 2), add(3, 4)];
    const at = () => session.state.scenes[scene]!.clips.map((c) => [c.start / 48000, c.end / 48000]);
    return { session, scene, track, ids, at };
  };

  it('ripple delete closes the gap on the track; plain delete leaves it', () => {
    const a = setup();
    a.session.apply({ commands: [{ name: 'clip.remove', params: { scene: a.scene, ids: [a.ids[1]!], ripple: true } }] });
    expect(a.at()).toEqual([[0, 1], [2, 3]]);
    a.session.undo();
    a.session.apply({ commands: [{ name: 'clip.remove', params: { scene: a.scene, ids: [a.ids[1]!] } }] });
    expect(a.at()).toEqual([[0, 1], [3, 4]]);
  });

  it('ripple delete of several clips shifts later clips by their total length', () => {
    const a = setup();
    a.session.apply({ commands: [{ name: 'clip.remove', params: { scene: a.scene, ids: [a.ids[0]!, a.ids[1]!], ripple: true } }] });
    expect(a.at()).toEqual([[1, 2]]);
  });

  it('moves several clips together and ripple-trims the end', () => {
    const a = setup();
    a.session.apply({ commands: [{ name: 'clip.move', params: { scene: a.scene, ids: [a.ids[0]!, a.ids[1]!], delta: s(0.5) } }] });
    expect(a.at()).toEqual([[0.5, 1.5], [1.5, 2.5], [3, 4]]);
    a.session.apply({ commands: [{ name: 'clip.trim', params: { scene: a.scene, id: a.ids[1]!, edge: 'end', to: s(3), ripple: true } }] });
    expect(a.at()).toEqual([[0.5, 1.5], [1.5, 3], [3.5, 4.5]]);
  });

  it('renames and moves markers', () => {
    const { session, scene } = newSession();
    const id = session.apply({ commands: [{ name: 'marker.add', params: { scene, name: 'Marker 1', at: s(2) } }] }).commands[0]!.params.id as string;
    session.apply({ commands: [{ name: 'marker.update', params: { scene, id, name: 'Punchline', at: s(3) } }] });
    expect(session.state.scenes[scene]!.markers).toEqual([{ id, name: 'Punchline', at: s(3) }]);
    expect(() => session.apply({ commands: [{ name: 'marker.update', params: { scene, id: 'mkr_missing01', name: 'x' } }] })).toThrow(/not found/);
  });
});
