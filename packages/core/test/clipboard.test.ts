import { describe, expect, it } from 'vitest';
import { copySelection, pasteCommands, sequentialIds, secondsToTicks, trackFor } from '../src/index.js';
import { addCharacter, newSession } from './helpers.js';

describe('clipboard (FR-PER-07)', () => {
  it('pastes a character with its clips into another scene and remaps references to copied objects', () => {
    const { session, scene, episode } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const chair = session.apply({ commands: [{ name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.chair@1', name: 'Chair', transform: { x: 300 } } }] }).commands[0]!.params.id as string;
    const acting = trackFor(session.state.scenes[scene]!, maya, 'acting')!.id;
    const clip = session.apply({ commands: [{ name: 'clip.add', params: { scene, track: acting, start: secondsToTicks(2), end: secondsToTicks(3), asset: 'act.wave@1', params: { target: chair } } }] }).commands[0]!.params.id as string;
    const line = session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: maya, text: 'Hi.', start: secondsToTicks(1) } }] }).commands[0]!.params.id as string;
    const data = copySelection(session.state, scene, { instances: [maya, chair], clips: [clip, line] });
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    const other = session.apply({ commands: [{ name: 'scene.add', params: { episode, name: 'Two' } }] }).commands[0]!.params.id as string;
    const r = pasteCommands(session.state, other, data, { newId: sequentialIds(500), at: secondsToTicks(5) });
    session.apply({ commands: r.commands });
    const sc = session.state.scenes[other]!;
    expect(sc.instances.map((i) => i.name)).toEqual(['Maya', 'Chair']);
    const [m2, c2] = r.instances;
    const pasted = sc.clips.find((c) => c.asset === 'act.wave@1')!;
    expect(pasted.track).toBe(trackFor(sc, m2!, 'acting')!.id);
    expect(pasted.params.target).toBe(c2);
    // The earliest copied clip (the line at 1 s) lands at 5 s; the wave keeps its 1 s offset.
    expect(sc.clips.find((c) => c.line)!.start).toBe(secondsToTicks(5));
    expect(pasted.start).toBe(secondsToTicks(6));
    expect(r.warnings).toContain('Pasted lines need new takes');
  });

  it('pastes a recipe group onto same-named characters; same-scene object pastes are offset and renamed', () => {
    const { session, scene, episode } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const acting = trackFor(session.state.scenes[scene]!, maya, 'acting')!.id;
    const clip = session.apply({ commands: [{ name: 'clip.add', params: { scene, track: acting, start: 0, end: 48000, asset: 'act.nod@1' } }] }).commands[0]!.params.id as string;
    const group = copySelection(session.state, scene, { clips: [clip] });
    const other = session.apply({ commands: [{ name: 'scene.add', params: { episode, name: 'Two' } }] }).commands[0]!.params.id as string;
    // No Maya there yet: nothing to paste onto.
    expect(pasteCommands(session.state, other, group, { newId: sequentialIds(600) }).warnings[0]).toMatch(/No Maya/);
    const maya2 = addCharacter(session, other, 'Maya');
    const r = pasteCommands(session.state, other, group, { newId: sequentialIds(700) });
    session.apply({ commands: r.commands });
    expect(session.state.scenes[other]!.clips.find((c) => c.asset === 'act.nod@1')!.track).toBe(trackFor(session.state.scenes[other]!, maya2, 'acting')!.id);
    const dup = pasteCommands(session.state, scene, copySelection(session.state, scene, { instances: [maya] }), { newId: sequentialIds(800) });
    session.apply({ commands: dup.commands });
    const copy = session.state.scenes[scene]!.instances.find((i) => i.id === dup.instances[0])!;
    expect(copy.name).toBe('Maya copy');
    expect(copy.transform.x).toBe(session.state.scenes[scene]!.instances.find((i) => i.id === maya)!.transform.x + 40);
  });
});
