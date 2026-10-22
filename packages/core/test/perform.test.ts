import { describe, expect, it } from 'vitest';
import { autoPerformanceCommands, channelConflicts, performAt, secondsToTicks, trackFor, validateProject, type ActionData } from '../src/index.js';
import { addCharacter, newSession } from './helpers.js';

/** Synthetic performance assets (engine data only; the engine never knows catalog names). */
const MANIFESTS: Record<string, { data: unknown }> = {
  'exp.happy@1': { data: { expression: { mouthCurve: 0.8, eyeHappy: 0.6, intensity: 100 } } },
  'exp.sad@1': { data: { expression: { mouthCurve: -0.8, browInner: 0.7, intensity: 100 } } },
  'exp.sleep@1': { data: { expression: { eyeOpen: 0, intensity: 100 } } },
  'act.raise-right@1': { data: { action: { channels: ['armR', 'handR'], loop: false, duration: 1, postures: ['standing', 'seated'], hand: 'R', keys: { armR: [{ t: 0, v: [0, 0, 0] }, { t: 1, v: [100, -200, 0] }], 'face.mouthCurve': [{ t: 0, v: 0 }, { t: 1, v: -0.5 }] } } } },
  'act.nod@1': { data: { action: { channels: ['head'], additive: true, loop: false, duration: 1, postures: ['standing', 'seated'], keys: { 'head.pitch': [{ t: 0, v: 0 }, { t: 0.5, v: 10 }, { t: 1, v: 0 }] } } } },
  'act.head-turn@1': { data: { action: { channels: ['head'], loop: false, duration: 1, postures: ['standing', 'seated'], keys: { 'head.yaw': [{ t: 0, v: 0 }, { t: 1, v: 20 }] } } } },
  'act.talk-a@1': { data: { action: { channels: ['armR', 'handR'], loop: true, duration: 1.5, postures: ['standing', 'seated'], hand: 'R', keys: { armR: [{ t: 0, v: [0, 0, 0] }, { t: 0.5, v: [40, -60, 0] }, { t: 1, v: [0, 0, 0] }] } } } },
  'act.talk-b@1': { data: { action: { channels: ['armL', 'armR', 'handL', 'handR'], loop: true, duration: 2, postures: ['standing', 'seated'], hand: 'both', keys: {} } } },
  'act.sit@1': { data: { action: { channels: ['posture', 'root'], loop: false, duration: 1, postures: ['standing'], resultPosture: 'seated', keys: {} } } },
  'act.seated-lean@1': { data: { action: { channels: ['posture', 'torso'], loop: true, duration: 4, postures: ['seated'], keys: { 'spine.pitch': [{ t: 0, v: 8 }] } } } },
};
const assets = { manifest: (r: string) => MANIFESTS[r] as never };
const ctx = { manifest: (r: string) => MANIFESTS[r] };
const s = secondsToTicks;

function setup() {
  const { session, scene } = newSession();
  const a = addCharacter(session, scene, 'Ada');
  const b = addCharacter(session, scene, 'Ben', 1200);
  // Deterministic tests: no idle, listening or automatic blinks unless a test turns them on.
  for (const id of [a, b]) session.apply({ commands: [{ name: 'instance.update', params: { scene, id, set: { character: { auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } } } }] });
  const sc = () => session.state.scenes[scene]!;
  const clip = (owner: string, kind: 'face' | 'acting', start: number, end: number, extra: Record<string, unknown>) =>
    session.apply({ commands: [{ name: 'clip.add', params: { scene, track: trackFor(sc(), owner, kind)!.id, start: s(start), end: s(end), ...extra } }] }).commands[0]!.params.id as string;
  const perf = (owner: string, t: number) => performAt(session.state, scene, owner, s(t), assets);
  return { session, scene, a, b, sc, clip, perf };
}

describe('expressions (FR-EXP-01..05)', () => {
  it('applies a timed expression with intensity and blends consecutive clips', () => {
    const { a, clip, perf } = setup();
    clip(a, 'face', 0, 2, { asset: 'exp.happy@1', blendOut: s(0.5) });
    clip(a, 'face', 1.5, 4, { asset: 'exp.sad@1', blendIn: s(0.5), params: { intensity: 50 } });
    expect(perf(a, 1).face.mouthCurve).toBeCloseTo(0.8, 5);
    const mid = perf(a, 1.75).face.mouthCurve; // cross-fade region
    expect(mid).toBeLessThan(0.8);
    expect(mid).toBeGreaterThan(-0.4);
    expect(perf(a, 3).face.mouthCurve).toBeCloseTo(-0.4, 5); // 50 % intensity
  });

  it('fine-tunes a clip without changing the preset, and the resting face applies when no clip is active', () => {
    const { session, scene, a, clip, perf } = setup();
    clip(a, 'face', 0, 2, { asset: 'exp.happy@1', params: { tune: { mouthCurve: 0.2, browOuterL: 0.5 } } });
    const f = perf(a, 1).face;
    expect(f.mouthCurve).toBeCloseTo(0.2, 5);
    expect(f.browOuterL).toBeCloseTo(0.5, 5);
    expect(MANIFESTS['exp.happy@1']!.data).toMatchObject({ expression: { mouthCurve: 0.8 } });
    session.apply({ commands: [{ name: 'instance.update', params: { scene, id: a, set: { character: { baseExpression: 'exp.sad@1' } } } }] });
    expect(perf(a, 3).face.mouthCurve).toBeLessThan(-0.5);
  });

  it('hold variation moves the face slightly while holding, deterministically', () => {
    const { a, clip, perf } = setup();
    clip(a, 'face', 0, 4, { asset: 'exp.happy@1', params: { hold: 1 } });
    const xs = [1, 1.5, 2, 2.5].map((t) => perf(a, t).face.mouthCurve);
    expect(new Set(xs.map((x) => x.toFixed(4))).size).toBeGreaterThan(1);
    for (const x of xs) expect(Math.abs(x - 0.8)).toBeLessThan(0.07);
    expect(perf(a, 1.5).face.mouthCurve).toBe(xs[1]);
  });

  it('blinks are automatic, suppressed during closed-eye expressions, and can be added or removed as clips', () => {
    const { session, scene, a, clip, perf } = setup();
    session.apply({ commands: [{ name: 'instance.update', params: { scene, id: a, set: { character: { auto: { idle: false, listening: false, blinks: true, talkingGestures: false } } } } }] });
    const samples = (from: number, to: number) => Array.from({ length: Math.round((to - from) * 48) }, (_x, i) => perf(a, from + i / 48).face.eyeOpenL);
    expect(Math.min(...samples(0, 8))).toBeLessThan(0.5); // at least one automatic blink in 8 s
    const off = clip(a, 'face', 8, 16, { params: { blink: false } });
    expect(Math.min(...samples(8, 16))).toBe(1);
    clip(a, 'face', 10, 10.2, { params: { blink: true } });
    expect(perf(a, 10.1).face.eyeOpenL).toBeLessThan(0.05);
    expect(off).toBeTruthy();
    clip(a, 'face', 16, 24, { asset: 'exp.sleep@1' });
    expect(Math.max(...samples(16.5, 24))).toBe(0);
  });
});

describe('actions, channels and postures (FR-ACT-01..03, FR-CAM-07)', () => {
  it('samples action keys, mirrors them for the other hand, and applies face keys', () => {
    const { a, b, clip, perf } = setup();
    clip(a, 'acting', 0, 1, { asset: 'act.raise-right@1' });
    clip(b, 'acting', 0, 1, { asset: 'act.raise-right@1', params: { hand: 'L' } });
    const pa = perf(a, 0.5);
    expect((pa.pose as never as { armR: { t: number[] } }).armR.t[1]).toBeLessThan(-50);
    expect(pa.face.mouthCurve).toBeLessThan(-0.1);
    const pb = perf(b, 0.5).pose as never as { armL: { t: number[] }; armR: { t: number[] } };
    expect(pb.armL.t[1]).toBeLessThan(-50);
  });

  it('additive actions layer; posture persists after a posture change; a seated-only action needs seating first', () => {
    const { a, sc, clip, perf, session } = setup();
    clip(a, 'acting', 0, 1, { asset: 'act.head-turn@1' });
    clip(a, 'acting', 0, 1, { asset: 'act.nod@1' });
    const head = perf(a, 0.5).pose.head;
    expect(head.yaw).toBeCloseTo(10, 0);
    expect(head.pitch).toBeCloseTo(10, 0);
    const early = clip(a, 'acting', 1.5, 3, { asset: 'act.seated-lean@1' });
    let problems = validateProject(session.state, ctx).filter((p) => p.code === 'POSTURE_MISMATCH');
    expect(problems.map((p) => p.target)).toEqual([{ kind: 'clip', id: early }]);
    clip(a, 'acting', 4, 5, { asset: 'act.sit@1' });
    clip(a, 'acting', 6, 8, { asset: 'act.seated-lean@1' });
    expect(perf(a, 3.9).pose.posture).toBe('standing');
    expect(perf(a, 5.5).pose.posture).toBe('seated'); // the clip ended; the character stays seated
    problems = validateProject(session.state, ctx).filter((p) => p.code === 'POSTURE_MISMATCH');
    expect(problems).toHaveLength(1); // only the early one
    expect(sc().clips.length).toBeGreaterThan(0);
  });

  it('flags same-channel overlaps as blocking conflicts; additive, blended, other-channel and blink clips do not conflict', () => {
    const { session, a, sc, clip } = setup();
    clip(a, 'acting', 0, 2, { asset: 'act.raise-right@1' });
    clip(a, 'acting', 1, 3, { asset: 'act.raise-right@1', params: { hand: 'L' } }); // mirrored: armL, no conflict
    clip(a, 'acting', 0, 2, { asset: 'act.head-turn@1' });
    clip(a, 'acting', 0.5, 1.5, { asset: 'act.nod@1' }); // additive over a head action
    clip(a, 'face', 0, 2, { asset: 'exp.happy@1', blendOut: s(0.5) });
    clip(a, 'face', 1.6, 3, { asset: 'exp.sad@1', blendIn: s(0.5) }); // overlap within the blend
    clip(a, 'face', 1, 1.2, { params: { blink: true } });
    expect(channelConflicts(sc(), ctx)).toEqual([]);
    const bad = clip(a, 'acting', 1.5, 2.5, { asset: 'act.raise-right@1' });
    const k = channelConflicts(sc(), ctx);
    expect(k.map((x) => [x.channel, x.b.id])).toEqual([['armR', bad]]);
    const p = validateProject(session.state, ctx).filter((x) => x.code === 'CHANNEL_CONFLICT');
    expect(p).toHaveLength(1);
    expect(p[0]!.blocksExport).toBe(true);
  });
});

describe('automatic performance clips (FR-ACT-07/08)', () => {
  const actionOf = (r: string) => (MANIFESTS[r]?.data as { action?: ActionData } | undefined)?.action;
  it('generates talking gestures inside lines and listening nods, as editable auto clips; regeneration keeps baked clips', () => {
    const { session, scene, a, b, sc } = setup();
    const line = (who: string, start: number, dur: number) => session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: who, text: 'Some words here for the line', start: s(start), durationS: dur } }] }).commands[0]!.params.id as string;
    line(a, 0, 6);
    line(b, 7, 6);
    const opts = { talking: ['act.talk-a@1', 'act.talk-b@1'], listening: ['act.nod@1'], actionOf, gestureSize: 60, idleEnergy: 80 };
    const cmds = autoPerformanceCommands(session.state, scene, a, opts);
    session.apply({ commands: cmds });
    const acting = trackFor(sc(), a, 'acting')!.id;
    const auto = () => sc().clips.filter((c) => c.track === acting && c.source === 'auto');
    const talk = auto().filter((c) => c.asset !== 'act.nod@1');
    const nods = auto().filter((c) => c.asset === 'act.nod@1');
    expect(talk.length).toBeGreaterThan(1);
    for (const c of talk) {
      expect(c.start).toBeGreaterThanOrEqual(0);
      expect(c.end).toBeLessThanOrEqual(s(6));
    }
    expect(nods.length).toBeGreaterThan(0);
    for (const c of nods) expect(c.start).toBeGreaterThanOrEqual(s(7));
    expect(channelConflicts(sc(), ctx)).toEqual([]);
    // Deterministic: regenerating gives the same clips.
    const again = autoPerformanceCommands(session.state, scene, a, opts);
    expect(again.filter((c) => c.name === 'clip.add')).toEqual(cmds.filter((c) => c.name === 'clip.add'));
    // Bake one; regeneration removes only the remaining auto clips and avoids the baked clip's channels.
    session.apply({ commands: [{ name: 'clip.update', params: { scene, id: talk[0]!.id, set: { bake: true } } }] });
    session.apply({ commands: autoPerformanceCommands(session.state, scene, a, opts) });
    expect(sc().clips.find((c) => c.id === talk[0]!.id)!.source).toBe('manual');
    expect(channelConflicts(sc(), ctx)).toEqual([]);
  });
});
