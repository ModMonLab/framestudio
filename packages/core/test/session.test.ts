import { describe, expect, it } from 'vitest';
import { FrameError } from '@frame/schema';
import { describeCommands, lineTakeState, secondsToTicks, validateProject, trackFor } from '../src/index.js';
import { addCharacter, newSession } from './helpers.js';

describe('commands, revisions and undo (FR-ARC-02, FR-PER-02)', () => {
  it('applies commands, increments revision and records replayable commands with generated IDs', () => {
    const { session, scene } = newSession();
    const r = session.apply({ commands: [{ name: 'scene.rename', params: { id: scene, name: 'Cold open' } }] });
    expect(r.revision).toBe(1);
    expect(session.state.scenes[scene]!.name).toBe('Cold open');
    const maya = addCharacter(session, scene, 'Maya');
    expect(maya).toMatch(/^ins_/);
    const sc = session.state.scenes[scene]!;
    expect(sc.tracks.filter((t) => t.owner === maya).map((t) => t.kind)).toEqual(['dialogue', 'lipsync', 'acting', 'face', 'gaze']);
  });

  it('undo and redo restore exact states with descriptive labels', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const before = session.state;
    session.apply({ commands: [{ name: 'instance.update', params: { scene, id: maya, set: { transform: { x: 100 } } } }] });
    expect(session.undoLabel()).toBe('Move Maya');
    session.undo();
    expect(session.state.scenes[scene]).toEqual(before.scenes[scene]);
    expect(session.redoLabel()).toBe('Move Maya');
    session.redo();
    expect(session.state.scenes[scene]!.instances[0]!.transform.x).toBe(100);
  });

  it('keeps at least 200 undo steps', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    for (let i = 0; i < 250; i++) session.apply({ commands: [{ name: 'instance.update', params: { scene, id: maya, set: { transform: { x: i } } } }] });
    let n = 0;
    while (session.undo()) n++;
    expect(n).toBeGreaterThanOrEqual(200);
  });

  it('batches are atomic: a failing command leaves the project unchanged', () => {
    const { session, scene } = newSession();
    const before = session.state;
    expect(() => session.apply({ commands: [
      { name: 'scene.rename', params: { id: scene, name: 'X' } },
      { name: 'scene.rename', params: { id: 'scn_missing00', name: 'Y' } },
    ] })).toThrow(FrameError);
    expect(session.state).toBe(before);
    expect(session.revision).toBe(0);
  });

  it('dry-run returns resulting commands without writing', () => {
    const { session, scene } = newSession();
    const r = session.apply({ commands: [{ name: 'scene.rename', params: { id: scene, name: 'Dry' } }] }, { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.state.scenes[scene]!.name).toBe('Dry');
    expect(session.state.scenes[scene]!.name).toBe('Scene 1');
    expect(session.revision).toBe(0);
  });

  it('invalid parameters are rejected with schema issues', () => {
    const { session } = newSession();
    try {
      session.apply({ commands: [{ name: 'scene.rename', params: { id: 5 } }] });
      expect.unreachable();
    } catch (e) {
      expect((e as FrameError).code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify((e as FrameError).details)).toContain('issues');
    }
  });

  it('describeCommands lists every command with schema and summary', () => {
    const d = describeCommands();
    expect(d.length).toBeGreaterThan(40);
    for (const c of d) {
      expect(c.summary.length).toBeGreaterThan(5);
      expect(c.params.type).toBe('object');
    }
  });
});

describe('optimistic concurrency (FR-ARC-04)', () => {
  it('rejects a stale non-commutative batch with REVISION_CONFLICT', () => {
    const { session, scene } = newSession();
    session.apply({ commands: [{ name: 'scene.add', params: { episode: session.state.project.episodes[0]!, name: 'B' } }] });
    try {
      session.apply({ baseRevision: 0, commands: [{ name: 'scene.add', params: { episode: session.state.project.episodes[0]!, name: 'C' } }] });
      expect.unreachable();
    } catch (e) {
      expect((e as FrameError).code).toBe('REVISION_CONFLICT');
    }
    expect(scene).toBeTruthy();
  });

  it('rebases a stale commutative batch touching different clips', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const acting = trackFor(session.state.scenes[scene]!, maya, 'acting')!.id;
    const a = session.apply({ commands: [{ name: 'clip.add', params: { scene, track: acting, start: 0, end: 24000 } }] }).commands[0]!.params.id as string;
    const base = session.revision;
    session.apply({ commands: [{ name: 'clip.update', params: { scene, id: a, set: { start: 2000 } } }] });
    const r = session.apply({ baseRevision: base, commands: [{ name: 'clip.add', params: { scene, track: acting, start: 48000, end: 60000 } }] });
    expect(r.rebased).toBe(true);
  });

  it('conflicts when a stale batch touches the same clip', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const acting = trackFor(session.state.scenes[scene]!, maya, 'acting')!.id;
    const a = session.apply({ commands: [{ name: 'clip.add', params: { scene, track: acting, start: 0, end: 24000 } }] }).commands[0]!.params.id as string;
    const base = session.revision;
    session.apply({ commands: [{ name: 'clip.update', params: { scene, id: a, set: { start: 2000 } } }] });
    expect(() => session.apply({ baseRevision: base, commands: [{ name: 'clip.update', params: { scene, id: a, set: { end: 30000 } } }] })).toThrow(/changed since/);
  });

  it('reverts all changes of an agent session as one step (FR-AGT-04)', () => {
    const { session, scene } = newSession();
    session.apply({ source: 'agent:s1', commands: [{ name: 'scene.rename', params: { id: scene, name: 'Agent name' } }] });
    session.apply({ source: 'agent:s1', commands: [{ name: 'scene.setNotes', params: { id: scene, notes: 'n' } }] });
    session.revertSource('agent:s1');
    expect(session.state.scenes[scene]!.name).toBe('Scene 1');
    expect(session.state.scenes[scene]!.notes).toBe('');
  });
});

describe('dialogue lines and takes (FR-DLG)', () => {
  function withLine() {
    const ctx = newSession();
    const maya = addCharacter(ctx.session, ctx.scene, 'Maya');
    const line = ctx.session.apply({ commands: [{ name: 'line.add', params: { scene: ctx.scene, speaker: maya, text: 'Hello there, how are you?' } }] }).commands[0]!.params.id as string;
    return { ...ctx, maya, line };
  }

  it('creates a line with an estimated duration and Missing take state', () => {
    const { session, scene, line } = withLine();
    const c = session.state.scenes[scene]!.clips.find((x) => x.id === line)!;
    expect(c.end - c.start).toBeGreaterThan(secondsToTicks(1));
    expect(lineTakeState(session.state, c)).toBe('Missing');
  });

  it('choosing a take sets clip length; editing text marks it outdated; confirm is explicit for recordings', () => {
    const { session, scene, line } = withLine();
    const take = session.apply({ commands: [{ name: 'take.add', params: { take: { line, lineRevision: 1, source: 'recorded', fixture: false, status: 'ready', durationS: 2.5 } } }] }).commands[0]!.params.id as string;
    session.apply({ commands: [{ name: 'line.chooseTake', params: { scene, id: line, take } }] });
    let c = session.state.scenes[scene]!.clips.find((x) => x.id === line)!;
    expect(c.end - c.start).toBe(secondsToTicks(2.5));
    expect(lineTakeState(session.state, c)).toBe('Ready');
    session.apply({ commands: [{ name: 'line.setText', params: { scene, id: line, text: 'Hello, how are you?' } }] });
    c = session.state.scenes[scene]!.clips.find((x) => x.id === line)!;
    expect(c.line!.revision).toBe(2);
    expect(lineTakeState(session.state, c)).toBe('Outdated');
    expect(() => session.apply({ commands: [{ name: 'line.chooseTake', params: { scene, id: line, take } }] })).toThrow(/previous text/);
    session.apply({ commands: [{ name: 'take.confirm', params: { id: take } }] });
    session.apply({ commands: [{ name: 'line.chooseTake', params: { scene, id: line, take } }] });
    c = session.state.scenes[scene]!.clips.find((x) => x.id === line)!;
    expect(lineTakeState(session.state, c)).toBe('Ready');
  });

  it('generated takes can never be confirmed for new text (P7)', () => {
    const { session, scene, line } = withLine();
    const take = session.apply({ commands: [{ name: 'take.add', params: { take: { line, lineRevision: 1, source: 'generated', fixture: true, status: 'ready', durationS: 1 } } }] }).commands[0]!.params.id as string;
    session.apply({ commands: [{ name: 'line.setText', params: { scene, id: line, text: 'Different' } }] });
    expect(() => session.apply({ commands: [{ name: 'take.confirm', params: { id: take } }] })).toThrow(/cannot be confirmed/);
  });

  it('missing takes, overlaps and clips past the end block export (FR-CAM-07, FR-RND-08)', () => {
    const { session, scene, maya, line } = withLine();
    const st = session.state.scenes[scene]!;
    const c = st.clips.find((x) => x.id === line)!;
    session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: maya, text: 'Overlapping', start: c.start + 1000 } }] });
    const acting = trackFor(st, maya, 'face')!.id;
    session.apply({ commands: [
      { name: 'clip.add', params: { scene, track: acting, start: 0, end: 48000, asset: 'exp.smile@1' } },
      { name: 'clip.add', params: { scene, track: acting, start: 24000, end: 60000, asset: 'exp.sad@1' } },
      { name: 'clip.add', params: { scene, track: st.tracks.find((t) => t.kind === 'shot')!.id, start: 0, end: 48000, params: { camera: st.defaultCamera } } },
      { name: 'clip.add', params: { scene, track: st.tracks.find((t) => t.kind === 'shot')!.id, start: 40000, end: 900000, params: { camera: st.defaultCamera } } },
    ] });
    const codes = validateProject(session.state).filter((p) => p.blocksExport).map((p) => p.code);
    expect(codes).toContain('TAKE_MISSING');
    expect(codes).toContain('SPEAKER_OVERLAP');
    expect(codes).toContain('CHANNEL_CONFLICT');
    expect(codes).toContain('SHOT_OVERLAP');
    expect(codes).toContain('PAST_SCENE_END');
  });
});

describe('structure (FR-PRJ-02/03, FR-DAT-04)', () => {
  it('shortening a scene past clips requires explicit confirmation and never truncates', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: maya, text: 'A line', start: secondsToTicks(8) } }] });
    expect(() => session.apply({ commands: [{ name: 'scene.setDuration', params: { id: scene, durationS: 5 } }] })).toThrow(/past the new end/);
    const r = session.apply({ commands: [{ name: 'scene.setDuration', params: { id: scene, durationS: 5, allowTruncate: true } }] });
    expect((r.reports[0] as { affected: unknown[] }).affected).toHaveLength(1);
    expect(session.state.scenes[scene]!.clips).toHaveLength(1);
  });

  it('changing frame rate re-snaps clip boundaries and reports moved clips', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const track = trackFor(session.state.scenes[scene]!, maya, 'acting')!.id;
    session.apply({ commands: [{ name: 'clip.add', params: { scene, track, start: 2000, end: 50000 } }] });
    const r = session.apply({ commands: [{ name: 'project.setFrameRate', params: { frameRate: 30 } }] });
    const moved = (r.reports[0] as { moved: { start: number; end: number }[] }).moved;
    expect(moved).toHaveLength(1);
    expect(moved[0]!.start % 1600).toBe(0);
    expect(moved[0]!.end % 1600).toBe(0);
  });

  it('deleting an episode deletes all of its scenes', () => {
    const { session } = newSession();
    const ep = session.apply({ commands: [{ name: 'episode.add', params: { name: 'Two' } }] }).commands[0]!.params.id as string;
    session.apply({ commands: [{ name: 'scene.add', params: { episode: ep, name: 'B' } }, { name: 'scene.add', params: { episode: ep, name: 'C' } }] });
    const ids = [...session.state.episodes[ep]!.scenes];
    expect(ids).toHaveLength(3);
    session.apply({ commands: [{ name: 'episode.delete', params: { id: ep } }] });
    for (const id of ids) expect(session.state.scenes[id]).toBeUndefined();
  });

  it('duplicating an episode gives new IDs and keeps the same asset versions and takes', () => {
    const { session, scene, episode } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const line = session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: maya, text: 'Hi' } }] }).commands[0]!.params.id as string;
    const take = session.apply({ commands: [{ name: 'take.add', params: { take: { line, lineRevision: 1, source: 'uploaded', fixture: false, status: 'ready', durationS: 1 } } }] }).commands[0]!.params.id as string;
    session.apply({ commands: [{ name: 'line.chooseTake', params: { scene, id: line, take } }] });
    const r = session.apply({ commands: [{ name: 'episode.duplicate', params: { id: episode } }] });
    const newEp = r.commands[0]!.params.newId as string;
    const newScene = session.state.episodes[newEp]!.scenes[0]!;
    expect(newScene).not.toBe(scene);
    const ns = session.state.scenes[newScene]!;
    expect(ns.instances[0]!.id).not.toBe(maya);
    expect(ns.instances[0]!.asset).toBe(session.state.scenes[scene]!.instances[0]!.asset);
    const nline = ns.clips[0]!;
    expect(nline.line!.take).toBeDefined();
    expect(nline.line!.take).not.toBe(take);
    expect(session.state.takes[nline.line!.take!]!.line).toBe(nline.id);
    expect(lineTakeState(session.state, nline)).toBe('Ready');
  });
});
