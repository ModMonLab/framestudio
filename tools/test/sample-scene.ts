/** Builds the M1 sample: a two-host podcast scene staged entirely with engine commands. */
import { createProjectState, ProjectSession, sequentialIds, secondsToTicks, trackFor, type ProjectState } from '@frame/core';
import type { Alignment, Command } from '@frame/schema';

export const OUTPUT = { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9', '9:16'] };
const KIT = 'kit.podcast-studio@1';
const char = (look: string) => ({ look, view: 'three' as const, posture: 'seated' as const, auto: { idle: true, listening: true, blinks: true, talkingGestures: false } });

/** A deterministic fixture alignment for tests (labelled as fixture; never real speech). */
export function fixtureAlignment(text: string, durationS: number): Alignment {
  const words = text.replace(/[^A-Za-z' ]/g, '').split(/\s+/).filter(Boolean);
  const per = durationS / words.length;
  const phon = ['HH', 'AH', 'L', 'OW', 'M', 'IY', 'B', 'AE', 'K', 'W', 'EH', 'S', 'P', 'AA', 'T', 'UW', 'F', 'ER'];
  const phonemes: Alignment['phonemes'] = [];
  let k = 0;
  words.forEach((_w, i) => {
    const n = 3;
    for (let j = 0; j < n; j++) phonemes.push({ p: phon[k++ % phon.length]!, start: i * per + (j * per * 0.9) / n, end: i * per + ((j + 1) * per * 0.9) / n });
  });
  return { words: words.map((w, i) => ({ text: w, start: i * per, end: i * per + per * 0.9 })), phonemes, method: 'fixture', confidence: 1 };
}

export function buildSampleScene(family: 'flat' | 'illustrated' = 'flat'): { session: ProjectSession; scene: string; maya: string; leo: string } {
  const ids = sequentialIds(100);
  const state: ProjectState = createProjectState(ids, { name: 'The Backup Recording', styleFamily: family, frameRate: 24, output: OUTPUT, appVersion: '0.1.0', now: '2026-10-22T00:00:00Z', seed: 42 });
  const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
  const scene = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
  const apply = (commands: Command[]) => session.apply({ commands });
  apply([{ name: 'scene.setDuration', params: { id: scene, durationS: 12 } }]);
  const setPiece = (part: string, x: number, y: number, plane: string) => ({ name: 'instance.add', params: { scene, kind: 'set-piece', asset: KIT, name: part, transform: { x, y }, depthPlane: plane, params: { part } } });
  apply([setPiece('wall', 960, 700, 'back'), setPiece('window', 960, 640, 'back'), setPiece('slats', 960, 650, 'back'), setPiece('floor', 960, 1080, 'ground')]);
  apply([
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.on-air-sign@1', name: 'On-air sign', transform: { x: 960, y: 150 }, depthPlane: 'back', propState: 'on' } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.potted-plant@1', name: 'Plant', transform: { x: 210, y: 700, scale: 1 }, depthPlane: 'back' } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.floor-lamp@1', name: 'Floor lamp', transform: { x: 1700, y: 700 }, depthPlane: 'back', propState: 'on' } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.studio-chair@1', name: 'Chair A', transform: { x: 640, y: 985 }, depthPlane: 'mid' } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.studio-chair@1', name: 'Chair B', transform: { x: 1280, y: 985 }, depthPlane: 'mid' } },
  ]);
  const maya = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.maya-bennett@1', name: 'Maya Bennett', transform: { x: 640, y: 1000, scale: 1.12 }, character: char('on-air') } }]).commands[0]!.params.id as string;
  const leo = apply([{ name: 'instance.add', params: { scene, kind: 'character', asset: 'chr.leo-park@1', name: 'Leo Park', transform: { x: 1280, y: 1000, scale: 1.12, flipX: true }, character: char('everyday') } }]).commands[0]!.params.id as string;
  apply([
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.round-table@1', name: 'Round table', transform: { x: 960, y: 1060 }, depthPlane: 'front' } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.desk-microphone@1', name: 'Mic (Maya)', transform: { x: 800, y: 858 }, depthPlane: 'front', propState: 'on' } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.desk-microphone@1', name: 'Mic (Leo)', transform: { x: 1120, y: 858, flipX: true }, depthPlane: 'front', propState: 'on' } },
    { name: 'instance.add', params: { scene, kind: 'prop', asset: 'prop.mug@1', name: 'Mug', transform: { x: 960, y: 858 }, depthPlane: 'front', propState: 'steam' } },
  ]);
  const st = () => session.state.scenes[scene]!;
  const lines: [string, string, number, number][] = [[maya, 'Welcome back. Today we are talking about the recording.', 0.4, 4.2], [leo, 'You mean the recording you forgot to start?', 5.0, 3.0]];
  for (const [who, text, start, dur] of lines) {
    const line = apply([{ name: 'line.add', params: { scene, speaker: who, text, start: secondsToTicks(start), durationS: dur } }]).commands[0]!.params.id as string;
    const take = apply([{ name: 'take.add', params: { take: { line, lineRevision: 1, source: 'generated', fixture: true, status: 'ready', durationS: dur, alignment: fixtureAlignment(text, dur), engine: 'fixture' } } }]).commands[0]!.params.id as string;
    apply([{ name: 'line.chooseTake', params: { scene, id: line, take } }]);
  }
  apply([
    { name: 'clip.add', params: { scene, track: trackFor(st(), maya, 'face')!.id, start: 0, end: secondsToTicks(4.6), asset: 'exp.smile@1', blendIn: 4800, blendOut: 4800 } },
    { name: 'clip.add', params: { scene, track: trackFor(st(), maya, 'acting')!.id, start: secondsToTicks(1), end: secondsToTicks(4.4), asset: 'act.calm-talk@1', blendIn: 9600, blendOut: 9600 } },
    { name: 'clip.add', params: { scene, track: trackFor(st(), leo, 'face')!.id, start: secondsToTicks(4.8), end: secondsToTicks(8.4), asset: 'exp.skeptical@1', blendIn: 4800, blendOut: 4800 } },
    { name: 'clip.add', params: { scene, track: trackFor(st(), leo, 'acting')!.id, start: secondsToTicks(5.6), end: secondsToTicks(7.8), asset: 'act.point-at@1' } },
    { name: 'clip.add', params: { scene, track: trackFor(st(), maya, 'face')!.id, start: secondsToTicks(8.5), end: secondsToTicks(12), asset: 'exp.embarrassed@1', blendIn: 4800 } },
  ]);
  // Cameras and shots.
  const wide = st().defaultCamera;
  apply([{ name: 'camera.update', params: { scene, id: wide, set: { name: 'Wide', center: { x: 960, y: 560 }, width: 1920 } } }]);
  const leoCam = apply([{ name: 'camera.add', params: { scene, name: 'Leo close-up', center: { x: 1250, y: 520 }, width: 860, lens: '85mm', subjects: [leo] } }]).commands[0]!.params.id as string;
  const shotTrack = st().tracks.find((t) => t.kind === 'shot')!.id;
  apply([
    { name: 'clip.add', params: { scene, track: shotTrack, start: 0, end: secondsToTicks(5), params: { camera: wide } } },
    { name: 'clip.add', params: { scene, track: shotTrack, start: secondsToTicks(5), end: secondsToTicks(8.4), params: { camera: leoCam } } },
    { name: 'clip.add', params: { scene, track: shotTrack, start: secondsToTicks(8.4), end: secondsToTicks(12), params: { camera: wide } } },
  ]);
  return { session, scene, maya, leo };
}
