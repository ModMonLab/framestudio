import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { characterJointsAt, createProjectState, ProjectSession, samplePrincipled, secondsToTicks, sequentialIds, trackFor, type ProjectState } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lib = bundledLibrary(path.join(repo, 'content'));
const styles = loadStyles(path.join(repo, 'content'));
const assets = { manifest: (r: string) => lib.manifest(r) };
const s = secondsToTicks;

function scene(params: Record<string, unknown>) {
  const ids = sequentialIds(800);
  const state: ProjectState = createProjectState(ids, { name: 'M', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] }, appVersion: '0.1.0', now: '2026-10-22T00:00:00Z', seed: 4 });
  const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
  const sc = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
  const who = session.apply({ commands: [{ name: 'instance.add', params: { scene: sc, kind: 'character', asset: 'chr.maya-bennett@1', name: 'Maya', transform: { x: 900, y: 1000 }, character: { look: 'on-air', view: 'three', posture: 'standing', auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } } }] }).commands[0]!.params.id as string;
  const track = trackFor(session.state.scenes[sc]!, who, 'acting')!.id;
  session.apply({ commands: [{ name: 'clip.add', params: { scene: sc, track, start: s(1), end: s(2.6), asset: 'act.point-at@1', blendIn: 0, blendOut: 0, params } }] });
  return (t: number) => characterJointsAt(session.state, sc, who, s(t), { assets, styles });
}

describe('motion principles and pose editing (FR-ACT-09/10)', () => {
  it('anticipation leads opposite to the coming motion; overshoot carries past where it stops', () => {
    const keys = [{ t: 0, v: 0 }, { t: 0.4, v: 10 }, { t: 1, v: 10 }];
    expect(samplePrincipled(keys, 0.02, { anticipation: 1 })!).toBeLessThan(0);
    expect(samplePrincipled(keys, 0.44, { overshoot: 1 })!).toBeGreaterThan(10);
    expect(samplePrincipled(keys, 0.8, { anticipation: 1, overshoot: 1 })).toBe(10);
    expect(samplePrincipled(keys, 0.2, {})).toBe(sampleNo(keys, 0.2));
  });

  it('per-clip principles change the performed pose; without them the action is unchanged', () => {
    const plain = scene({});
    const lively = scene({ anticipation: 1, overshoot: 1, squash: 1 });
    // Mid-reach the pointing hand is ahead of the plain action, and the body stretches.
    const d = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(d(lively(1.25).wristR!, plain(1.25).wristR!)).toBeGreaterThan(3);
    expect(Math.abs(lively(1.25).head![1] - plain(1.25).head![1])).toBeGreaterThan(0.5);
    // Held part of the point: identical.
    expect(d(lively(2.0).wristR!, plain(2.0).wristR!)).toBeLessThan(0.5);
  });

  it('pose keys add offsets on named controls at clip-relative times and interpolate between them', () => {
    const plain = scene({});
    const posed = scene({ pose: { armL: [{ t: 0, v: [0, 0, 0] }, { t: 1, v: [0, 0.6, 0] }] } });
    expect(posed(1.01).wristL![1]).toBeCloseTo(plain(1.01).wristL![1], 0);
    // Raising the left arm by the end of the clip lifts the left wrist (screen y up is negative).
    expect(posed(2.5).wristL![1]).toBeLessThan(plain(2.5).wristL![1] - 20);
  });
});

function sampleNo(keys: { t: number; v: number }[], u: number) {
  return samplePrincipled(keys, u, { anticipation: 0, overshoot: 0 });
}
