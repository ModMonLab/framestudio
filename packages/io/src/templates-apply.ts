/**
 * Applying templates with the library (FR-TPL-01..03): the template's scene is created on a scratch session so its
 * cameras can be framed on the cast as placed (and seated), then everything returns as one batch of commands.
 */
import { planTemplate, ProjectSession, randomId, resolveTrackRefs, seatCommands, templateFromScene, templateFromScenes, TICKS_PER_SECOND, type ProjectState, type TemplateData } from '@frame/core';
import type { Command } from '@frame/schema';
import { FrameError } from '@frame/schema';
import { frameWithLibrary, type LibraryFrameOptions } from './recipes-apply.js';

const S = TICKS_PER_SECOND;

type KitParts = Record<string, { plane?: string; at?: [number, number]; order?: number; name?: string }>;

export function templateData(ref: string, o: LibraryFrameOptions): TemplateData {
  const data = (o.lib.manifest(ref)?.data as { template?: TemplateData } | undefined)?.template;
  if (!data) throw new FrameError('NOT_FOUND', `${ref} is not a template`);
  return data;
}

export interface TemplateApplyResult {
  commands: Command[];
  /** The first scene added. */
  sceneId: string;
  /** Every scene added, in order (project templates have several). */
  sceneIds: string[];
  /** Instance key → id in the first scene. */
  ids: Record<string, string>;
}

/**
 * Commands that add a template's scenes to an episode, with its cast (`cast`: role → character ref) placed and framed.
 * A project template adds all its scenes; `onlyFirst` adds just the first (a scene from a project template).
 */
export function templateCommandsForLibrary(state: ProjectState, episodeId: string, ref: string, opts: { cast?: Record<string, string>; looks?: Record<string, string>; name?: string; onlyFirst?: boolean }, o: LibraryFrameOptions): TemplateApplyResult {
  const data = templateData(ref, o);
  for (const [role, chr] of Object.entries(opts.cast ?? {})) {
    if (!data.roles.some((r) => r.key === role)) throw new FrameError('USAGE', `${ref} has no role ${role}`, { roles: data.roles.map((r) => r.key) });
    if (!o.lib.has(chr)) throw new FrameError('NOT_FOUND', `Character ${chr} not found`);
  }
  const scratch = new ProjectSession(state, 0, { newId: randomId });
  const out: Command[] = [];
  const run = (cmds: Command[]) => {
    if (!cmds.length) return;
    const r = scratch.apply({ commands: cmds });
    out.push(...r.commands);
  };
  const scenes = opts.onlyFirst ? [data.scene] : [data.scene, ...(data.scenes ?? [])];
  const sceneIds: string[] = [];
  let firstIds: Record<string, string> = {};
  for (const [n, spec] of scenes.entries()) {
    let plan;
    try {
      plan = planTemplate(scratch.state, episodeId, data, {
        ...opts, scene: spec, ...(opts.name && n === 0 ? { sceneName: opts.name } : {}),
        assetName: (r) => o.lib.manifest(r)?.name,
        kitParts: (k) => (o.lib.manifest(k)?.data as { kit?: { parts: KitParts } } | undefined)?.kit?.parts,
      });
    } catch (e) {
      throw new FrameError('USAGE', (e as Error).message);
    }
    const sid = plan.sceneId;
    run(plan.commands.filter((c) => c.name !== 'clip.add'));
    for (const seat of plan.seats) run(seatCommands(scratch.state, sid, seat.instance, seat.prop, { assets: { manifest: (r) => o.lib.manifest(r) }, styles: o.styles }));
    run(resolveTrackRefs(scratch.state, sid, plan.commands.filter((c) => c.name === 'clip.add')));
    // Cameras framed on the cast where they stand at their first shot; shots on the scene's shot track.
    const camIds: Record<string, string> = {};
    const camCmds: Command[] = [];
    for (const cam of plan.cameras) {
      const id = randomId('cam');
      const first = plan.shots.find((s) => s.camera === cam.key)?.at ?? 0;
      const subjects = (cam.subjects ?? []).map((k) => plan.ids[k]).filter((x): x is string => !!x);
      const f = cam.framing && subjects.length ? frameWithLibrary(scratch.state, sid, cam.framing, subjects, Math.round(first * S), o) : undefined;
      if (f) camCmds.push({ name: 'camera.add', params: { scene: sid, id, name: cam.name, center: f.center, width: f.width, rotation: f.rotation, preset: cam.framing, subjects, ...(cam.lens ? { lens: cam.lens } : {}) } });
      else camCmds.push({ name: 'camera.add', params: { scene: sid, id, name: cam.name, ...(cam.center ? { center: cam.center } : {}), ...(cam.width ? { width: cam.width } : {}), ...(cam.lens ? { lens: cam.lens } : {}) } });
      camIds[cam.key] = id;
    }
    run(camCmds);
    const shotTrack = scratch.state.scenes[sid]!.tracks.find((t) => t.owner === 'scene' && t.kind === 'shot')!;
    run(plan.shots.filter((s) => camIds[s.camera]).map((s) => ({ name: 'clip.add', params: { scene: sid, track: shotTrack.id, start: Math.round(s.at * S), end: Math.round((s.at + s.dur) * S), params: { camera: camIds[s.camera], ...(s.transition ? { transition: s.transition } : {}) }, recipe: 'template' } })));
    sceneIds.push(sid);
    if (n === 0) firstIds = plan.ids;
  }
  return { commands: out, sceneId: sceneIds[0]!, sceneIds, ids: firstIds };
}

/**
 * Replace cast (FR-TPL-03): swaps a character instance's asset for another character, keeping every clip, gaze target
 * and shot (they belong to the instance), and reframes the cameras whose preset includes it.
 */
export function replaceCastCommands(state: ProjectState, sceneId: string, instanceId: string, characterRef: string, o: LibraryFrameOptions & { look?: string }): Command[] {
  const scene = state.scenes[sceneId];
  const inst = scene?.instances.find((i) => i.id === instanceId);
  if (!scene || !inst?.character) throw new FrameError('NOT_FOUND', `Character instance ${instanceId} not found`);
  const m = o.lib.manifest(characterRef);
  if (!m || m.kind !== 'chr') throw new FrameError('NOT_FOUND', `Character ${characterRef} not found`);
  const looks = ((m.data as { looks?: { id: string }[] } | undefined)?.looks ?? []).map((l) => l.id);
  const look = o.look ?? (looks.includes(inst.character.look) ? inst.character.look : looks[0] ?? 'default');
  const swap: Command = { name: 'instance.update', params: { scene: sceneId, id: instanceId, set: { asset: characterRef, ...(inst.name === nameOf(o, inst.asset) ? { name: m.name } : {}), character: { look } } } };
  const scratch = new ProjectSession(state, 0, { newId: randomId });
  const out = scratch.apply({ commands: [swap] }).commands;
  const shotTrack = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'shot');
  const reframe: Command[] = [];
  for (const cam of scene.cameras) {
    if (!cam.preset || !cam.subjects.includes(instanceId)) continue;
    const first = scene.clips.filter((c) => c.track === shotTrack?.id && c.params.camera === cam.id).sort((a, b) => a.start - b.start)[0]?.start ?? 0;
    const f = frameWithLibrary(scratch.state, sceneId, cam.preset, cam.subjects, first, o);
    if (f) reframe.push({ name: 'camera.update', params: { scene: sceneId, id: cam.id, set: { center: f.center, width: f.width, rotation: f.rotation } } });
  }
  return [...out, ...reframe];
}

const nameOf = (o: LibraryFrameOptions, ref: string | undefined) => (ref ? o.lib.manifest(ref)?.name : undefined);

/** Scenes as template data (FR-TPL-02), for saving into the user library. */
export { templateFromScene, templateFromScenes };

/**
 * Starting a project from a template (FR-PRJ-01): the template's scenes replace the new project's empty first scene,
 * and its caption style becomes the project's.
 */
export function projectFromTemplateCommands(state: ProjectState, ref: string, opts: { cast?: Record<string, string> }, o: LibraryFrameOptions): TemplateApplyResult {
  const episode = state.project.episodes[0];
  if (!episode) throw new FrameError('VALIDATION_FAILED', 'The project has no episode');
  const empty = state.episodes[episode]!.scenes.filter((id) => !state.scenes[id]!.instances.length && !state.scenes[id]!.clips.length);
  const r = templateCommandsForLibrary(state, episode, ref, opts, o);
  const data = templateData(ref, o);
  const caption = data.captionStyle && o.lib.has(data.captionStyle) ? data.captionStyle : undefined;
  return {
    ...r,
    commands: [
      ...r.commands,
      ...empty.map((id) => ({ name: 'scene.delete', params: { id } })),
      ...(caption ? [{ name: 'project.setSettings', params: { captions: { ...state.project.captions, style: caption } } }] : []),
    ],
  };
}
