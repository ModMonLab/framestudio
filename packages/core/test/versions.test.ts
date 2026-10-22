import { describe, expect, it } from 'vitest';
import { assetUsages, compareStates, trackFor } from '../src/index.js';
import { addCharacter, newSession } from './helpers.js';

const V1 = 'user.00000000-0000-4000-8000-000000000001@1';
const V2 = 'user.00000000-0000-4000-8000-000000000001@2';
const EXP1 = 'user.00000000-0000-4000-8000-0000000000e1@1';
const EXP2 = 'user.00000000-0000-4000-8000-0000000000e1@2';

describe('asset.updateUsages (FR-CHR-10, FR-AST-05)', () => {
  it('switches one instance, a scene or the project; other usages keep their version; undo restores', () => {
    const { session, scene } = newSession();
    const a = addCharacter(session, scene, 'Ada');
    const b = addCharacter(session, scene, 'Ben', 900);
    const face = trackFor(session.state.scenes[scene]!, a, 'face')!.id;
    const faceB = trackFor(session.state.scenes[scene]!, b, 'face')!.id;
    session.apply({ commands: [
      { name: 'clip.add', params: { scene, track: face, start: 0, end: 48000, asset: EXP1 } },
      { name: 'clip.add', params: { scene, track: faceB, start: 0, end: 48000, asset: EXP1 } },
    ] });
    const before = session.state;
    const one = session.apply({ commands: [{ name: 'asset.updateUsages', params: { from: V1, to: V2, scope: 'instance', scene, instance: a, looks: ['other'], fallbackLook: 'other' } }] });
    const sc = session.state.scenes[scene]!;
    expect(sc.instances.find((i) => i.id === a)!.asset).toBe(V2);
    expect(sc.instances.find((i) => i.id === a)!.character!.look).toBe('other');
    expect(sc.instances.find((i) => i.id === b)!.asset).toBe(V1);
    expect(one.label).toMatch(/^Update .+ to version 2 in Ada$/);
    // Clips owned by the instance switch with it in instance scope; the scene scope switches every clip.
    session.apply({ commands: [{ name: 'asset.updateUsages', params: { from: EXP1, to: EXP2, scope: 'instance', scene, instance: a } }] });
    expect(session.state.scenes[scene]!.clips.map((c) => c.asset)).toEqual([EXP2, EXP1]);
    session.apply({ commands: [{ name: 'asset.updateUsages', params: { from: EXP1, to: EXP2, scope: 'scene', scene } }] });
    expect(session.state.scenes[scene]!.clips.map((c) => c.asset)).toEqual([EXP2, EXP2]);
    expect(assetUsages(session.state, V1.slice(0, -2)).map((u) => `${u.kind}:${u.ref}`)).toEqual([`instance:${V2}`, `instance:${V1}`]);
    const cmp = compareStates(before, session.state);
    expect(cmp.scenes[0]!.versions).toEqual([{ instance: 'Ada', from: V1, to: V2 }]);
    expect(cmp.scenes[0]!.clips).toEqual({ added: 0, removed: 0, changed: 2 });
    session.undo();
    session.undo();
    session.undo();
    expect(session.state.scenes[scene]).toEqual(before.scenes[scene]);
    expect(compareStates(before, session.state).identical).toBe(true);
  });

  it('refuses switching to a different asset and incomplete scopes', () => {
    const { session, scene } = newSession();
    addCharacter(session, scene, 'Ada');
    const bad = (params: Record<string, unknown>) => () => session.apply({ commands: [{ name: 'asset.updateUsages', params: params as never }] });
    expect(bad({ from: V1, to: EXP1, scope: 'project' })).toThrow(/different assets/);
    expect(bad({ from: V1, to: V2, scope: 'scene' })).toThrow(/scene is required/);
    expect(bad({ from: V1, to: V2, scope: 'instance', scene })).toThrow(/instance is required/);
  });
});
