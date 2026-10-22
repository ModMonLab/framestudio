import { describe, expect, it } from 'vitest';
import { expandRecipe, recipeFromClips, secondsToTicks, trackFor, type RecipeData } from '../src/index.js';
import { addCharacter, newSession } from './helpers.js';

const s = secondsToTicks;

describe('recipes (FR-RCP-01..04)', () => {
  const data: RecipeData = {
    roles: [{ key: 'speaker', label: 'Speaker', kind: 'character' }, { key: 'listener', label: 'Listener', kind: 'character' }],
    anchor: { role: 'speaker' }, duration: 4,
    steps: [
      { role: 'listener', track: 'gaze', at: { line: 'start' }, end: { line: 'end' }, params: { target: '$speaker' } },
      { role: 'listener', track: 'acting', asset: 'act.nod@1', at: { word: 'last' }, dur: 0.8 },
      { role: 'speaker', track: 'face', asset: 'exp.missing@1', at: 0, dur: 1 },
      { track: 'shot', at: { frac: 0.5 }, end: { line: 'end' }, shot: { framing: 'cam.close-up@1', subjects: ['listener'] } },
    ],
  };

  it('expands a line-anchored recipe into grouped clips on the right tracks, aligned to the words, with role substitution and a framed shot', () => {
    const { session, scene } = newSession();
    const a = addCharacter(session, scene, 'Ada');
    const b = addCharacter(session, scene, 'Ben', 1200);
    const line = session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: a, text: 'one two three four', start: s(2), durationS: 4 } }] }).commands[0]!.params.id as string;
    const ex = expandRecipe(session.state, scene, 'rcp.test@1', data, { roles: { speaker: a, listener: b }, line, exists: (r) => r !== 'exp.missing@1', frame: () => ({ center: { x: 1200, y: 600 }, width: 700, rotation: 0 }) });
    expect(ex.warnings).toEqual(['Step 3: exp.missing@1 is not in the library yet; skipped']);
    session.apply({ commands: ex.commands });
    const sc = session.state.scenes[scene]!;
    const made = sc.clips.filter((c) => c.group === ex.group);
    expect(made).toHaveLength(3);
    expect(made.every((c) => c.source === 'recipe:rcp.test@1')).toBe(true);
    const gaze = made.find((c) => c.track === trackFor(sc, b, 'gaze')!.id)!;
    expect([gaze.start, gaze.end, gaze.params.target]).toEqual([s(2), s(6), a]);
    // Estimated words: 4 words over 4 s → the last word starts at 3 s into the line.
    const nod = made.find((c) => c.asset === 'act.nod@1')!;
    expect(nod.start).toBe(s(5));
    const shot = made.find((c) => c.params.camera)!;
    expect(shot.start).toBe(s(4));
    expect(sc.cameras.find((c) => c.id === shot.params.camera)).toMatchObject({ width: 700, subjects: [b] });
    // The group moves as one (P6).
    session.apply({ commands: [{ name: 'clip.move', params: { scene, ids: made.map((c) => c.id), delta: s(1) } }] });
    expect(session.state.scenes[scene]!.clips.find((c) => c.id === nod.id)!.start).toBe(s(6));
  });

  it('refuses unassigned roles and lines by the wrong speaker; saves a selection as a recipe with role placeholders', () => {
    const { session, scene } = newSession();
    const a = addCharacter(session, scene, 'Ada');
    const b = addCharacter(session, scene, 'Ben', 1200);
    const line = session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: b, text: 'hello there', start: 0, durationS: 2 } }] }).commands[0]!.params.id as string;
    expect(() => expandRecipe(session.state, scene, 'rcp.test@1', data, { roles: { speaker: a }, line })).toThrow(/Listener/);
    expect(() => expandRecipe(session.state, scene, 'rcp.test@1', data, { roles: { speaker: a, listener: b }, line })).toThrow(/spoken by the Speaker/);
    const sc = () => session.state.scenes[scene]!;
    const c1 = session.apply({ commands: [{ name: 'clip.add', params: { scene, track: trackFor(sc(), a, 'gaze')!.id, start: s(1), end: s(3), params: { target: b } } }] }).commands[0]!.params.id as string;
    const c2 = session.apply({ commands: [{ name: 'clip.add', params: { scene, track: trackFor(sc(), b, 'face')!.id, start: s(2), end: s(4), asset: 'exp.smile@1' } }] }).commands[0]!.params.id as string;
    const r = recipeFromClips(session.state, scene, [c1, c2]);
    expect(r.roles.map((x) => x.key)).toEqual(['character1', 'character2']);
    expect(r.steps).toEqual([
      { role: 'character1', track: 'gaze', params: { target: '$character2' }, at: 0, dur: 2 },
      { role: 'character2', track: 'face', asset: 'exp.smile@1', params: {}, at: 1, dur: 2 },
    ]);
    // Applying it to other characters reproduces the timing.
    const ex = expandRecipe(session.state, scene, 'rcp.mine@1', r, { roles: { character1: b, character2: a }, at: s(5) });
    expect(ex.commands.map((c) => [c.params.start, c.params.params])).toEqual([[s(5), { target: a }], [s(6), {}]]);
  });
});
