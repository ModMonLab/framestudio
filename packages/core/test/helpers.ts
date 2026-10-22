import { createProjectState, ProjectSession, sequentialIds, type ProjectState } from '../src/index.js';

export const OUTPUT = { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] };

export function newSession(): { session: ProjectSession; scene: string; episode: string } {
  const ids = sequentialIds();
  const state: ProjectState = createProjectState(ids, { name: 'Test', styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', now: '2026-10-22T00:00:00Z', seed: 7 });
  const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
  const episode = state.project.episodes[0]!;
  const scene = state.episodes[episode]!.scenes[0]!;
  return { session, scene, episode };
}

export const CHAR = { look: 'default', view: 'three' as const, posture: 'standing' as const, auto: { idle: true, listening: true, blinks: true, talkingGestures: false } };

export function addCharacter(session: ProjectSession, scene: string, name: string, x = 600) {
  const r = session.apply({ commands: [{ name: 'instance.add', params: { scene, kind: 'character', asset: 'user.00000000-0000-4000-8000-000000000001@1', name, transform: { x }, character: CHAR } }] });
  return r.commands[0]!.params.id as string;
}
