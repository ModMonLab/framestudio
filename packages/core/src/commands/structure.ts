import { Type, AssetRef, FrameRate, StyleFamily, OutputSettings, AgentPermissions, CaptionSettings, type Scene, type Clip } from '@frame/schema';
import { defineCommand, fail } from '../command.js';
import { makeEpisode, makeScene } from '../defaults.js';
import { episodeOf, moveInArray, sceneOf } from '../lookup.js';
import { secondsToTicks, snapToFrame, ticksPerFrame } from '../time.js';
import type { IdSource } from '../ids.js';
import type { ProjectState } from '../state.js';

const Id = Type.String({ minLength: 1 });
const OptId = Type.Optional(Type.String({ minLength: 1 }));

/* ------------------------------------------------------------------ project settings (FR-PRJ-05) */

defineCommand({
  name: 'project.setSettings',
  summary: 'Change project settings: name, description, style family, output, captions, worker endpoint, render folder.',
  params: Type.Object({
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    description: Type.Optional(Type.String()),
    styleFamily: Type.Optional(StyleFamily),
    output: Type.Optional(OutputSettings),
    captions: Type.Optional(CaptionSettings),
    voiceWorkerUrl: Type.Optional(Type.String()),
    renderDir: Type.Optional(Type.String()),
  }, { additionalProperties: false }),
  examples: [{ name: 'My show', styleFamily: 'illustrated' }],
  label: (p) => (p.name ? `Rename project to ${p.name}` : 'Change project settings'),
  apply: (d, p) => {
    for (const [k, v] of Object.entries(p)) if (v !== undefined) (d.project as Record<string, unknown>)[k] = v;
  },
});

defineCommand({
  name: 'project.setPermissions',
  summary: 'Grant or revoke agent permissions (human only; FR-AGT-04).',
  params: Type.Object({ agent: AgentPermissions }, { additionalProperties: false }),
  label: () => 'Change agent permissions',
  apply: (d, p, ctx) => {
    if (ctx.source.startsWith('agent:')) fail('PERMISSION_REQUIRED', 'Agents cannot change their own permissions', undefined, 'A person must grant permissions in project settings.');
    d.project.permissions.agent = p.agent;
  },
});

/** Re-snaps every clip boundary to the new frame rate and reports clips that moved (FR-DAT-04). */
defineCommand({
  name: 'project.setFrameRate',
  summary: 'Change the project frame rate; clip boundaries are re-snapped and moved clips are reported.',
  params: Type.Object({ frameRate: FrameRate }, { additionalProperties: false }),
  label: (p) => `Change frame rate to ${p.frameRate} fps`,
  apply: (d, p, ctx) => {
    const moved: { scene: string; clip: string; start: number; end: number }[] = [];
    for (const scene of Object.values(d.scenes)) {
      for (const c of scene.clips) {
        const s = snapToFrame(c.start, p.frameRate);
        let e = snapToFrame(c.end, p.frameRate);
        if (e <= s) e = s + ticksPerFrame(p.frameRate);
        if (s !== c.start || e !== c.end) {
          moved.push({ scene: scene.id, clip: c.id, start: s, end: e });
          c.start = s;
          c.end = e;
        }
      }
      scene.duration = snapToFrame(scene.duration, p.frameRate);
    }
    d.project.frameRate = p.frameRate;
    ctx.report({ kind: 'frameRate.resnapped', moved });
  },
});

/* ------------------------------------------------------------------ cast */

defineCommand({
  name: 'cast.add',
  summary: 'Add a character version to the project cast.',
  params: Type.Object({ id: OptId, character: AssetRef, name: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('cst') }),
  label: (p) => `Add ${p.name} to cast`,
  apply: (d, p) => {
    if (d.project.cast.some((c) => c.id === p.id)) fail('CONFLICT', `Cast member ${p.id} exists`);
    d.project.cast.push({ id: p.id as never, character: p.character, name: p.name });
  },
});

defineCommand({
  name: 'cast.remove',
  summary: 'Remove a cast member (instances in scenes keep their own references).',
  params: Type.Object({ id: Id }, { additionalProperties: false }),
  label: () => 'Remove cast member',
  apply: (d, p) => {
    const i = d.project.cast.findIndex((c) => c.id === p.id);
    if (i < 0) fail('NOT_FOUND', `Cast member ${p.id} not found`);
    d.project.cast.splice(i, 1);
  },
});

/* ------------------------------------------------------------------ episodes (FR-PRJ-02) */

defineCommand({
  name: 'episode.add',
  summary: 'Add an episode (with one empty scene unless empty=true).',
  params: Type.Object({ id: OptId, sceneId: OptId, name: Type.String({ minLength: 1 }), index: Type.Optional(Type.Integer({ minimum: 0 })), empty: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('ep'), sceneId: p.empty ? undefined : (p.sceneId ?? ctx.newId('scn')) }),
  label: (p) => `Add episode ${p.name}`,
  apply: (d, p, ctx) => {
    if (d.episodes[p.id!]) fail('CONFLICT', `Episode ${p.id} exists`);
    const ep = makeEpisode(ctx.newId, p.name, p.id);
    if (p.sceneId) {
      const scene = makeScene(ctx.newId, { id: p.sceneId, name: 'Scene 1', seed: seedFor(d as ProjectState, p.sceneId) });
      d.scenes[scene.id] = scene;
      d.sceneEpisode[scene.id] = ep.id;
      ep.scenes.push(scene.id);
    }
    d.episodes[ep.id] = ep;
    d.project.episodes.splice(p.index ?? d.project.episodes.length, 0, ep.id);
  },
});

defineCommand({
  name: 'episode.rename',
  summary: 'Rename an episode.',
  params: Type.Object({ id: Id, name: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
  label: (p) => `Rename episode to ${p.name}`,
  touches: (p) => [`episodes/${p.id}`],
  apply: (d, p) => {
    episodeOf(d, p.id).name = p.name;
  },
});

defineCommand({
  name: 'episode.setNotes',
  summary: 'Set episode notes (rich text).',
  params: Type.Object({ id: Id, notes: Type.String() }, { additionalProperties: false }),
  label: () => 'Edit episode notes',
  touches: (p) => [`episodes/${p.id}`],
  apply: (d, p) => {
    episodeOf(d, p.id).notes = p.notes;
  },
});

defineCommand({
  name: 'episode.move',
  summary: 'Reorder an episode.',
  params: Type.Object({ id: Id, index: Type.Integer({ minimum: 0 }) }, { additionalProperties: false }),
  label: () => 'Reorder episodes',
  apply: (d, p) => {
    const from = d.project.episodes.indexOf(p.id as never);
    if (from < 0) fail('NOT_FOUND', `Episode ${p.id} not found`);
    moveInArray(d.project.episodes, from, p.index);
  },
});

defineCommand({
  name: 'episode.delete',
  summary: 'Delete an episode and its scenes (undoable).',
  params: Type.Object({ id: Id }, { additionalProperties: false }),
  label: (p, s) => `Delete episode ${s.episodes[p.id]?.name ?? p.id}`,
  apply: (d, p) => {
    const ep = episodeOf(d, p.id);
    if (d.project.episodes.length <= 1) fail('VALIDATION_FAILED', 'A project needs at least one episode');
    for (const s of ep.scenes) deleteSceneData(d as ProjectState, s);
    delete d.episodes[p.id];
    d.project.episodes.splice(d.project.episodes.indexOf(p.id as never), 1);
  },
});

/** Duplicating copies scenes with new IDs and keeps references to the same asset versions (FR-PRJ-02). */
defineCommand({
  name: 'episode.duplicate',
  summary: 'Duplicate an episode with all its scenes (new IDs, same character versions).',
  params: Type.Object({ id: Id, newId: OptId, name: Type.Optional(Type.String()), idMap: Type.Optional(Type.Record(Type.String(), Type.String())) }, { additionalProperties: false }),
  prepare: (p, s, ctx) => {
    const ep = episodeOf(s, p.id);
    const idMap: Record<string, string> = {};
    for (const sid of ep.scenes) Object.assign(idMap, sceneIdMap(s.scenes[sid]!, ctx.newId, s));
    return { ...p, newId: p.newId ?? ctx.newId('ep'), idMap: p.idMap ?? idMap };
  },
  label: (p, s) => `Duplicate episode ${s.episodes[p.id]?.name ?? p.id}`,
  apply: (d, p) => {
    const ep = episodeOf(d, p.id);
    const copy = { ...structuredClone(JSON.parse(JSON.stringify(ep))), id: p.newId!, name: p.name ?? `${ep.name} copy`, scenes: [] as string[] };
    copy.sceneTransitions = {};
    for (const sid of ep.scenes) {
      const dup = remapScene(JSON.parse(JSON.stringify(d.scenes[sid])) as Scene, p.idMap!);
      copyTakes(d as ProjectState, p.idMap!);
      d.scenes[dup.id] = dup;
      d.sceneEpisode[dup.id] = p.newId!;
      copy.scenes.push(dup.id);
      const tr = ep.sceneTransitions[sid];
      if (tr) copy.sceneTransitions[dup.id] = JSON.parse(JSON.stringify(tr));
    }
    d.episodes[copy.id] = copy;
    d.project.episodes.splice(d.project.episodes.indexOf(p.id as never) + 1, 0, copy.id);
  },
});

/* ------------------------------------------------------------------ scenes (FR-PRJ-03) */

defineCommand({
  name: 'scene.add',
  summary: 'Add a scene to an episode.',
  params: Type.Object({
    episode: Id, id: OptId, name: Type.String({ minLength: 1 }), index: Type.Optional(Type.Integer({ minimum: 0 })),
    durationS: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 7200 })), kit: Type.Optional(AssetRef),
  }, { additionalProperties: false }),
  examples: [{ episode: 'ep_00000001', name: 'Cold open', durationS: 20 }],
  prepare: (p, _s, ctx) => ({ ...p, id: p.id ?? ctx.newId('scn') }),
  label: (p) => `Add scene ${p.name}`,
  apply: (d, p, ctx) => {
    const ep = episodeOf(d, p.episode);
    if (d.scenes[p.id!]) fail('CONFLICT', `Scene ${p.id} exists`);
    const scene = makeScene(ctx.newId, { id: p.id, name: p.name, durationS: p.durationS, seed: seedFor(d as ProjectState, p.id!) });
    scene.duration = snapToFrame(scene.duration, d.project.frameRate);
    if (p.kit) scene.kit = p.kit;
    d.scenes[scene.id] = scene;
    d.sceneEpisode[scene.id] = ep.id;
    ep.scenes.splice(p.index ?? ep.scenes.length, 0, scene.id);
  },
});

defineCommand({
  name: 'scene.rename',
  summary: 'Rename a scene.',
  params: Type.Object({ id: Id, name: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
  label: (p) => `Rename scene to ${p.name}`,
  touches: (p) => [`scenes/${p.id}/name`],
  apply: (d, p) => {
    sceneOf(d, p.id).name = p.name;
  },
});

defineCommand({
  name: 'scene.setNotes',
  summary: 'Set scene notes (rich text).',
  params: Type.Object({ id: Id, notes: Type.String() }, { additionalProperties: false }),
  label: () => 'Edit scene notes',
  touches: (p) => [`scenes/${p.id}/notes`],
  apply: (d, p) => {
    sceneOf(d, p.id).notes = p.notes;
  },
});

defineCommand({
  name: 'scene.move',
  summary: 'Reorder a scene within or across episodes.',
  params: Type.Object({ id: Id, episode: Id, index: Type.Integer({ minimum: 0 }) }, { additionalProperties: false }),
  label: () => 'Reorder scenes',
  apply: (d, p) => {
    sceneOf(d, p.id);
    const fromEp = episodeOf(d, d.sceneEpisode[p.id]!);
    const toEp = episodeOf(d, p.episode);
    const from = fromEp.scenes.indexOf(p.id as never);
    if (fromEp === toEp) moveInArray(fromEp.scenes, from, p.index);
    else {
      if (fromEp.scenes.length <= 1) fail('VALIDATION_FAILED', 'An episode needs at least one scene');
      fromEp.scenes.splice(from, 1);
      toEp.scenes.splice(p.index, 0, p.id as never);
      d.sceneEpisode[p.id] = toEp.id;
    }
  },
});

defineCommand({
  name: 'scene.duplicate',
  summary: 'Duplicate a scene (new IDs for all scene objects).',
  params: Type.Object({ id: Id, name: Type.Optional(Type.String()), idMap: Type.Optional(Type.Record(Type.String(), Type.String())) }, { additionalProperties: false }),
  prepare: (p, s, ctx) => ({ ...p, idMap: p.idMap ?? sceneIdMap(sceneOf(s, p.id), ctx.newId, s) }),
  label: (p, s) => `Duplicate scene ${s.scenes[p.id]?.name ?? p.id}`,
  apply: (d, p) => {
    const src = sceneOf(d, p.id);
    const dup = remapScene(JSON.parse(JSON.stringify(src)) as Scene, p.idMap!);
    copyTakes(d as ProjectState, p.idMap!);
    dup.name = p.name ?? `${src.name} copy`;
    const epId = d.sceneEpisode[p.id]!;
    const ep = episodeOf(d, epId);
    d.scenes[dup.id] = dup;
    d.sceneEpisode[dup.id] = epId;
    ep.scenes.splice(ep.scenes.indexOf(p.id as never) + 1, 0, dup.id);
  },
});

defineCommand({
  name: 'scene.delete',
  summary: 'Delete a scene (undoable).',
  params: Type.Object({ id: Id }, { additionalProperties: false }),
  label: (p, s) => `Delete scene ${s.scenes[p.id]?.name ?? p.id}`,
  apply: (d, p) => {
    sceneOf(d, p.id);
    const ep = episodeOf(d, d.sceneEpisode[p.id]!);
    if (ep.scenes.length <= 1) fail('VALIDATION_FAILED', 'An episode needs at least one scene', undefined, 'Add another scene first or delete the episode.');
    deleteSceneData(d as ProjectState, p.id);
  },
});

/** Shortening never truncates silently: affected clips are listed and the change requires allowTruncate (FR-PRJ-03). */
defineCommand({
  name: 'scene.setDuration',
  summary: 'Set scene duration in seconds. Shortening past existing clips requires allowTruncate and reports affected clips.',
  params: Type.Object({ id: Id, durationS: Type.Number({ exclusiveMinimum: 0, maximum: 7200 }), allowTruncate: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
  label: (p) => `Set scene duration to ${p.durationS} s`,
  touches: (p) => [`scenes/${p.id}/duration`],
  apply: (d, p, ctx) => {
    const scene = sceneOf(d, p.id);
    const dur = snapToFrame(secondsToTicks(p.durationS), d.project.frameRate);
    const affected = scene.clips.filter((c) => c.end > dur).map((c) => ({ id: c.id, start: c.start, end: c.end }));
    if (affected.length && !p.allowTruncate) {
      fail('VALIDATION_FAILED', `${affected.length} clip(s) extend past the new end`, { affected }, 'Review the affected clips, then repeat with allowTruncate=true; clips are kept and flagged, not cut.');
    }
    scene.duration = dur;
    ctx.report({ kind: 'scene.duration', affected });
  },
});

defineCommand({
  name: 'scene.setLoop',
  summary: 'Set or clear the loop region (FR-TML-04).',
  params: Type.Object({ id: Id, start: Type.Optional(Type.Integer({ minimum: 0 })), end: Type.Optional(Type.Integer({ minimum: 0 })) }, { additionalProperties: false }),
  label: () => 'Set loop region',
  touches: (p) => [`scenes/${p.id}/loop`],
  apply: (d, p) => {
    const scene = sceneOf(d, p.id);
    if (p.start === undefined || p.end === undefined) delete scene.loop;
    else {
      if (p.end <= p.start) fail('VALIDATION_FAILED', 'Loop end must be after start');
      scene.loop = { start: p.start, end: p.end };
    }
  },
});

/* ------------------------------------------------------------------ helpers */

function seedFor(state: ProjectState, id: string): number {
  let h = state.project.seed >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

function deleteSceneData(d: ProjectState, sceneId: string): void {
  const epId = d.sceneEpisode[sceneId];
  if (epId) {
    const ep = d.episodes[epId]!;
    const i = ep.scenes.indexOf(sceneId as never);
    if (i >= 0) ep.scenes.splice(i, 1);
    delete ep.sceneTransitions[sceneId];
  }
  delete d.sceneEpisode[sceneId];
  delete d.scenes[sceneId];
}

/** Map every scene-local ID to a fresh one. */
export function sceneIdMap(scene: Scene, newId: IdSource, state?: ProjectState): Record<string, string> {
  const map: Record<string, string> = { [scene.id]: newId('scn') };
  for (const i of scene.instances) map[i.id] = newId('ins');
  for (const c of scene.cameras) map[c.id] = newId('cam');
  for (const t of scene.tracks) map[t.id] = newId('trk');
  for (const c of scene.clips) {
    map[c.id] = newId('clp');
    if (c.group && !map[c.group]) map[c.group] = newId('grp');
  }
  for (const m of scene.markers) map[m.id] = newId('mkr');
  for (const g of scene.stage.groundLines) map[g.id] = newId('gl');
  for (const m of scene.stage.marks) map[m.id] = newId('mk');
  if (state) for (const t of Object.values(state.takes)) if (map[t.line]) map[t.id] = newId('tak');
  return map;
}

/** Rewrites every ID string found in the scene through the map (takes stay shared by reference). */
export function remapScene(scene: Scene, map: Record<string, string>): Scene {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return map[v] ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  const out = walk(scene) as Scene;
  // A line whose take was not copied starts without a chosen take (FR-DLG-02).
  const copied = new Set(Object.values(map));
  out.clips = out.clips.map((c: Clip) => (c.line?.take && !copied.has(c.line.take) ? { ...c, line: { ...c.line, take: undefined } } : c));
  return JSON.parse(JSON.stringify(out)) as Scene;
}

/** Copies take records of duplicated lines: same media (content-addressed), new take and line IDs. */
function copyTakes(d: ProjectState, map: Record<string, string>): void {
  for (const t of Object.values(d.takes)) {
    const nid = map[t.id];
    const nline = map[t.line];
    if (nid && nline && !d.takes[nid]) d.takes[nid] = { ...JSON.parse(JSON.stringify(t)), id: nid, line: nline };
  }
}
