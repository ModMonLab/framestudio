/**
 * The remaining FR-CLI-05 groups: `open`, `undo`/`redo`, `diff`, staging (`place`, `move`, `group`, `camera add|set`,
 * `kit apply`, `set apply`), directing (`line add|set`, `act add`, `face add`, `look-at`, `shot add|auto`, `fx add`,
 * `sound add`), characters (`char set`, `char look add|set`, `char sheet`), voice (`voice list|design|create`,
 * `voice range build`, `takes generate|choose`, `align`), jobs and the voice worker. Each works on the folder or, with
 * --server, through a running Frame Server; every edit is engine commands, so --dry-run applies everywhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FrameError, type AssetManifest, type Command, type ConsentRecord, type StyleFamily } from '@frame/schema';
import { characterVersionCommands, clipCommand, findInstance, kitLookCommands, lookAtCommand, placeCommands, previewFrame, randomId, setCommands, sheetSetup, shotCommand, type ProjectState } from '@frame/core';
import { decodeAudioFile, writeFileAtomic } from '@frame/io';
import { loadStyles } from '@frame/assets/node';
import { createNodeRenderer } from '@frame/render/node';
import { VoiceClient, alignTake, clonedVoiceManifest, designCandidates, designedVoiceManifest, generateTakes, rangeCandidates, voiceWithReferences, type DesignCandidate, type ProjectAccess, type RangeCandidate } from '@frame/voice-client';
import { command, type CommandContext } from './framework.js';
import { findProjectDir, libraryOf, localOnly, mutate, openProject, projectLibrary, readProject } from './project-commands.js';
import { remote, remoteProject, remoteState, waitJob, type Remote } from './remote.js';
import { contentDir, libraryDefaults } from './env.js';

const S = 48000;
const human = (r: { dryRun: boolean; revision: number; label: string; warnings?: string[] }) =>
  r.dryRun ? `Dry run: "${r.label}" — nothing was written.` : `${r.label} (revision ${r.revision})`;
const out = <T extends { state?: unknown }>(r: T) => {
  const { state: _s, ...rest } = r;
  return rest;
};
const num = (v: unknown, what: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new FrameError('USAGE', `${what} must be a number`);
  return n;
};
const point = (v: unknown, what: string) => {
  const [x, y] = String(v).split(',').map((s) => Number(s.trim()));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new FrameError('USAGE', `${what} must be x,y in pixels`);
  return { x: x!, y: y! };
};
/** key=value pairs (values parsed as JSON when they are JSON: numbers, booleans, quoted strings, objects). */
const keyValues = (items: unknown) => {
  const outp: Record<string, unknown> = {};
  for (const kv of (Array.isArray(items) ? items : items === undefined ? [] : [items]).map(String)) {
    const i = kv.indexOf('=');
    if (i <= 0) throw new FrameError('USAGE', `Expected key=value, got "${kv}"`);
    const raw = kv.slice(i + 1);
    let v: unknown = raw;
    try {
      v = JSON.parse(raw);
    } catch {
      /* plain string */
    }
    outp[kv.slice(0, i)] = v;
  }
  return outp;
};
/** Sets a dotted path (`colors.hair`) in an object. */
const setPath = (o: Record<string, unknown>, key: string, v: unknown) => {
  const parts = key.split('.');
  let cur = o;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts.at(-1)!] = v;
};

async function sceneOf(ctx: CommandContext) {
  const { state } = await readProject(ctx);
  const ids = Object.keys(state.scenes);
  const want = ctx.args.scene ? String(ctx.args.scene) : state.episodes[state.project.episodes[0]!]?.scenes[0];
  const sceneId = ids.includes(String(want)) ? String(want) : ids.find((id) => state.scenes[id]!.name === want);
  if (!sceneId) throw new FrameError('NOT_FOUND', `Scene ${want} not found`, { scenes: ids.map((id) => `${id} ${state.scenes[id]!.name}`) });
  return { state, sceneId, lib: libraryOf(ctx, state) };
}

function manifestOf(lib: { manifest(ref: string): AssetManifest | undefined; versions(id: string): AssetManifest[] }, ref: string): { ref: string; m: AssetManifest } {
  const full = ref.includes('@') ? ref : (() => {
    const v = lib.versions(ref).map((x) => x.version);
    return v.length ? `${ref}@${Math.max(...v)}` : ref;
  })();
  const m = lib.manifest(full);
  if (!m) throw new FrameError('NOT_FOUND', `${ref} is not in the library`, undefined, 'Use `frame assets search` to find assets.');
  return { ref: full, m };
}

/* ------------------------------------------------------------------ project */

command({
  path: ['open'], summary: 'Open a project: on a running server (--server) it is loaded there for the Studio and agents; locally it is checked and summarised.',
  args: [{ name: 'path', description: 'Project folder (default: --project or the current folder)', positional: true }],
  run: async (ctx) => {
    const dir = ctx.args.path ? path.resolve(ctx.io.cwd, String(ctx.args.path)) : findProjectDir(ctx);
    const r = remote(ctx);
    if (r) {
      const id = await remoteProject(r, dir);
      const s = await remoteState(r, id);
      return { id, path: dir, name: s.state.project.name, revision: s.revision, url: `${r.url}/#/p/${encodeURIComponent(id)}` };
    }
    const p = openProject({ ...ctx, opts: { ...ctx.opts, project: dir } });
    const res = { path: p.store.root, name: p.state.project.name, revision: p.session.revision, scenes: Object.keys(p.state.scenes).length, migrated: p.load?.migrated ?? [] };
    p.close();
    return res;
  },
  human: (r) => `${r.name}  revision ${r.revision}${r.url ? `\nOpen in the Studio: ${r.url}` : `  ${r.scenes} scenes  ${r.path}`}`,
});

for (const op of ['undo', 'redo'] as const) {
  command({
    path: [op], summary: op === 'undo' ? 'Undo the latest change (agents may undo only their own).' : 'Redo the latest undone change.', mutating: true, args: [],
    run: async (ctx) => {
      const r = remote(ctx);
      if (r) {
        const pid = await remoteProject(r, findProjectDir(ctx));
        return r.req<{ revision: number; label?: string }>('POST', `/api/projects/${pid}/${op}`, {});
      }
      const p = openProject(ctx);
      const label = op === 'undo' ? p.session.undoLabel() : p.session.redoLabel();
      if (!label) throw new FrameError('USAGE', `Nothing to ${op}`, undefined, op === 'undo' ? 'Undo history is kept while no other program changes the project.' : undefined);
      if (op === 'undo' && ctx.io.env.FRAME_AGENT_SESSION && p.session.undoSource() !== `agent:${ctx.io.env.FRAME_AGENT_SESSION}`) throw new FrameError('CONFLICT', `The latest change ("${label}") was not made by this agent session`, undefined, 'Apply a corrective change instead.');
      if (ctx.opts.dryRun) return { dryRun: true, label, revision: p.session.revision };
      const res = op === 'undo' ? p.session.undo() : p.session.redo();
      p.close();
      return { revision: res!.revision, label: res!.label };
    },
    human: (r) => (r.dryRun ? `Dry run: would ${op} "${r.label}"` : `${op === 'undo' ? 'Undid' : 'Redid'} "${r.label}" (revision ${r.revision})`),
  });
}

command({
  path: ['diff'], summary: 'Changes between two revisions: each committed step with its source and commands.',
  args: [{ name: 'from', description: 'Revision A', positional: true, required: true, type: 'number' }, { name: 'to', description: 'Revision B (default: current)', positional: true, type: 'number' }],
  run: async (ctx) => {
    const r = remote(ctx);
    let entries: { revision: number; at: string; label: string; source: string; commands: { name: string }[] }[];
    let current: number;
    if (r) {
      const pid = await remoteProject(r, findProjectDir(ctx));
      entries = (await r.req<{ history: typeof entries }>('GET', `/api/projects/${pid}/history`)).history;
      current = (await remoteState(r, pid)).revision;
    } else {
      const p = openProject(ctx);
      entries = p.store.readHistory() as typeof entries;
      current = p.session.revision;
    }
    const a = num(ctx.args.from, 'from');
    const b = ctx.args.to !== undefined ? num(ctx.args.to, 'to') : current;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const steps = entries.filter((e) => e.revision > lo && e.revision <= hi);
    const counts: Record<string, number> = {};
    for (const e of steps) for (const c of e.commands ?? []) counts[c.name] = (counts[c.name] ?? 0) + 1;
    return { from: lo, to: hi, steps: steps.map((e) => ({ revision: e.revision, at: e.at, source: e.source, label: e.label, commands: (e.commands ?? []).map((c) => c.name) })), commands: counts };
  },
  human: (r) => r.steps.length ? r.steps.map((s: any) => `${String(s.revision).padStart(5)}  ${s.source.padEnd(14)} ${s.label}  [${s.commands.join(', ')}]`).join('\n') : `No changes between revisions ${r.from} and ${r.to}.`,
});

/* ------------------------------------------------------------------ staging */

command({
  path: ['place'], summary: 'Put a character, prop, image or kit on the stage.', mutating: true,
  args: [
    { name: 'asset', description: 'Asset id or ref', positional: true, required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'at', description: 'Position x,y in stage pixels (default: centre, on the floor)' },
    { name: 'depth', description: 'Depth plane id (e.g. back, mid, front)' },
    { name: 'name', description: 'Name in the scene' },
    { name: 'scale', description: 'Scale (1 = natural size)', type: 'number' },
    { name: 'flip', description: 'Mirror horizontally', type: 'boolean' },
  ],
  examples: ['frame place <prop id> --scene "Cold open" --at 1200,860 --depth mid'],
  run: async (ctx) => {
    const { state, sceneId, lib } = await sceneOf(ctx);
    const { ref, m } = manifestOf(lib, String(ctx.args.asset));
    const cmds = placeCommands(state, sceneId, ref, m, { ...(ctx.args.at ? point(ctx.args.at, '--at') : {}), ...(ctx.args.depth ? { depthPlane: String(ctx.args.depth) } : {}), ...(ctx.args.name ? { name: String(ctx.args.name) } : {}), ...(ctx.args.scale !== undefined ? { scale: num(ctx.args.scale, '--scale') } : {}), ...(ctx.args.flip ? { flipX: true } : {}) });
    const r = await mutate(ctx, cmds, `Add ${ctx.args.name ?? m.name}`);
    return { ...out(r), instances: r.commands.map((c) => c.params.id) };
  },
  human: (r) => `${human(r)}  ${r.instances.join(', ')}`,
});

command({
  path: ['move'], summary: 'Move an object on the stage: to a position, by an offset, or to another depth plane.', mutating: true,
  args: [
    { name: 'instance', description: 'Instance id or name', positional: true, required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'to', description: 'New position x,y' },
    { name: 'by', description: 'Offset dx,dy' },
    { name: 'depth', description: 'Depth plane id' },
  ],
  run: async (ctx) => {
    const { state, sceneId } = await sceneOf(ctx);
    const inst = findInstance(state, sceneId, String(ctx.args.instance));
    const set: Record<string, unknown> = {};
    if (ctx.args.to) set.transform = point(ctx.args.to, '--to');
    else if (ctx.args.by) {
      const d = point(ctx.args.by, '--by');
      set.transform = { x: inst.transform.x + d.x, y: inst.transform.y + d.y };
    }
    if (ctx.args.depth) set.depthPlane = String(ctx.args.depth);
    if (!Object.keys(set).length) throw new FrameError('USAGE', 'Give --to, --by or --depth');
    return out(await mutate(ctx, [{ name: 'instance.update', params: { scene: sceneId, id: inst.id, set } }]));
  },
  human,
});

command({
  path: ['group'], summary: 'Group objects so they move together (or --ungroup a group).', mutating: true,
  args: [
    { name: 'instances', description: 'Instance ids or names', positional: true, required: true, variadic: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'name', description: 'Group name' },
    { name: 'ungroup', description: 'Ungroup the named group instead', type: 'boolean' },
  ],
  run: async (ctx) => {
    const { state, sceneId } = await sceneOf(ctx);
    const items = (Array.isArray(ctx.args.instances) ? ctx.args.instances : [ctx.args.instances]).map((x) => findInstance(state, sceneId, String(x)).id);
    if (ctx.args.ungroup) return out(await mutate(ctx, items.map((id) => ({ name: 'instance.ungroup', params: { scene: sceneId, id } }))));
    if (items.length < 2) throw new FrameError('USAGE', 'Group at least two objects');
    return out(await mutate(ctx, [{ name: 'instance.group', params: { scene: sceneId, ids: items, ...(ctx.args.name ? { name: String(ctx.args.name) } : {}) } }]));
  },
  human,
});

command({
  path: ['camera', 'add'], summary: 'Add a camera: centre and width in stage pixels (or use `camera frame` with a framing preset).', mutating: true,
  args: [
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'name', description: 'Camera name' },
    { name: 'center', description: 'Centre x,y (default: stage centre)' },
    { name: 'width', description: 'Visible width in stage pixels (default: the stage width)', type: 'number' },
    { name: 'default', description: 'Make it the scene\'s default camera', type: 'boolean' },
  ],
  run: async (ctx) => {
    const { state, sceneId } = await sceneOf(ctx);
    const { width, height } = state.project.output;
    const id = randomId('cam');
    const cmds: Command[] = [{ name: 'camera.add', params: { scene: sceneId, id, name: String(ctx.args.name ?? `Camera ${state.scenes[sceneId]!.cameras.length + 1}`), center: ctx.args.center ? point(ctx.args.center, '--center') : { x: width / 2, y: height / 2 }, width: ctx.args.width !== undefined ? num(ctx.args.width, '--width') : width } }];
    if (ctx.args.default) cmds.push({ name: 'camera.setDefault', params: { scene: sceneId, id } });
    return { ...out(await mutate(ctx, cmds)), camera: id };
  },
  human: (r) => `${human(r)}  ${r.camera}`,
});

command({
  path: ['camera', 'set'], summary: 'Change a camera: key=value pairs (center.x, center.y, width, rotation, lens, name).', mutating: true,
  args: [
    { name: 'camera', description: 'Camera id or name', positional: true, required: true },
    { name: 'values', description: 'key=value pairs', positional: true, required: true, variadic: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
  ],
  examples: ['frame camera set Wide width=1400 center.x=900'],
  run: async (ctx) => {
    const { state, sceneId } = await sceneOf(ctx);
    const cam = state.scenes[sceneId]!.cameras.find((c) => c.id === ctx.args.camera || c.name === ctx.args.camera);
    if (!cam) throw new FrameError('NOT_FOUND', `Camera ${ctx.args.camera} not found`);
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(keyValues(ctx.args.values))) setPath(set, k, v);
    if (set.center) set.center = { ...cam.center, ...(set.center as object) };
    return out(await mutate(ctx, [{ name: 'camera.update', params: { scene: sceneId, id: cam.id, set } }]));
  },
  human,
});

command({
  path: ['kit', 'apply'], summary: 'Add a location kit\'s pieces to a scene, or recolour the kit already there (--palette, --time-of-day).', mutating: true,
  args: [
    { name: 'kit', description: 'Kit id or ref', positional: true, required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'palette', description: 'Kit palette id' },
    { name: 'time-of-day', description: 'Time of day preset id' },
  ],
  run: async (ctx) => {
    const { state, sceneId, lib } = await sceneOf(ctx);
    const { ref, m } = manifestOf(lib, String(ctx.args.kit));
    if (m.kind !== 'kit') throw new FrameError('USAGE', `${ref} is not a kit`);
    const kit = (m.data as { kit: Parameters<typeof kitLookCommands>[3] }).kit;
    const scene = state.scenes[sceneId]!;
    const present = scene.instances.some((i) => i.kind === 'set-piece' && i.asset?.split('@')[0] === m.id);
    // Explicit ids, so a recolour planned against the added pieces refers to the same instances.
    const cmds: Command[] = present ? [] : placeCommands(state, sceneId, ref, m).map((c) => ({ ...c, params: { ...c.params, id: randomId('ins') } }));
    if (ctx.args.palette || ctx.args['time-of-day']) {
      const presets = (libraryDefaults() as { timeOfDay?: Parameters<typeof kitLookCommands>[4]['presets'] }).timeOfDay ?? [];
      const tod = ctx.args['time-of-day'] ? presets.find((t) => t.id === ctx.args['time-of-day']) : undefined;
      if (ctx.args['time-of-day'] && !tod) throw new FrameError('USAGE', `Unknown time of day ${ctx.args['time-of-day']}`, { known: presets.map((t) => t.id) });
      // Recolour after the pieces exist: plan against the state with them added.
      const planned = cmds.length ? (await mutate({ ...ctx, opts: { ...ctx.opts, dryRun: true } }, cmds)).state : state;
      try {
        cmds.push(...kitLookCommands(planned, sceneId, ref, kit, { ...(ctx.args.palette ? { palette: String(ctx.args.palette) } : {}), ...(tod ? { timeOfDay: tod } : {}), presets }));
      } catch (e) {
        throw new FrameError('USAGE', (e as Error).message);
      }
    }
    if (!cmds.length) throw new FrameError('USAGE', `${m.name} is already in the scene`, undefined, 'Pass --palette or --time-of-day to recolour it.');
    return out(await mutate(ctx, cmds, `${present ? 'Recolour' : 'Add'} ${m.name}`));
  },
  human,
});

command({
  path: ['set', 'apply'], summary: 'Add a ready-made set (kit, props, cameras and marks) to a scene (FR-ENV-01).', mutating: true,
  args: [{ name: 'set', description: 'Set id or ref', positional: true, required: true }, { name: 'scene', description: 'Scene id or name (default: first scene)' }],
  run: async (ctx) => {
    const { state, sceneId, lib } = await sceneOf(ctx);
    const { ref, m } = manifestOf(lib, String(ctx.args.set));
    const set = (m.data as { set?: Parameters<typeof setCommands>[2] }).set;
    if (m.kind !== 'set' || !set) throw new FrameError('USAGE', `${ref} is not a set`);
    const kit = (lib.manifest(set.kit)?.data as { kit?: Parameters<typeof setCommands>[3] } | undefined)?.kit;
    if (!kit) throw new FrameError('NOT_FOUND', `The set's kit ${set.kit} is not in the library`);
    const plan = setCommands(state, sceneId, set, kit, { newId: randomId, propName: (r) => lib.manifest(r)?.name });
    return out(await mutate(ctx, plan.commands, `Add ${m.name}`));
  },
  human,
});

/* ------------------------------------------------------------------ directing */

command({
  path: ['line', 'add'], summary: 'Add a line of dialogue for a character.', mutating: true,
  args: [
    { name: 'speaker', description: 'Character instance id or name', required: true },
    { name: 'text', description: 'What they say ([pause 0.5s] markers allowed)', required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'at', description: 'Start in seconds (default: after the last line)', type: 'number' },
    { name: 'delivery', description: 'Delivery preset id or ref' },
  ],
  examples: ['frame line add --speaker Maya --text "Welcome back to the show." --at 1.5'],
  run: async (ctx) => {
    const { state, sceneId, lib } = await sceneOf(ctx);
    const inst = findInstance(state, sceneId, String(ctx.args.speaker));
    const last = Math.max(0, ...state.scenes[sceneId]!.clips.filter((c) => c.line).map((c) => c.end));
    const start = ctx.args.at !== undefined ? Math.round(num(ctx.args.at, '--at') * S) : last + Math.round(0.25 * S);
    const preset = ctx.args.delivery ? manifestOf(lib, String(ctx.args.delivery)).ref : undefined;
    const r = await mutate(ctx, [{ name: 'line.add', params: { scene: sceneId, speaker: inst.id, text: String(ctx.args.text), start, ...(preset ? { delivery: { preset } } : {}) } }]);
    return { ...out(r), line: r.commands[0]?.params.id };
  },
  human: (r) => `${human(r)}  ${r.line}`,
});

command({
  path: ['line', 'set'], summary: 'Change a line: text, speaker, delivery (preset, emotion, pace, instruction), caption or mute.', mutating: true,
  args: [
    { name: 'line', description: 'Line clip id', positional: true, required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'text', description: 'New text' },
    { name: 'speaker', description: 'New speaker (instance id or name)' },
    { name: 'delivery', description: 'Delivery preset id or ref ("none" clears it)' },
    { name: 'emotion', description: 'Emotion' },
    { name: 'pace', description: 'Pace (1 = normal)', type: 'number' },
    { name: 'instruction', description: 'Free-text delivery instruction' },
    { name: 'caption', description: 'Caption text when it differs from the spoken text' },
    { name: 'muted', description: 'Mute (true) or unmute (false)' },
  ],
  run: async (ctx) => {
    const { state, sceneId, lib } = await sceneOf(ctx);
    const clip = state.scenes[sceneId]!.clips.find((c) => c.id === ctx.args.line);
    if (!clip?.line) throw new FrameError('NOT_FOUND', `Line ${ctx.args.line} not found in the scene`);
    const id = clip.id;
    const cmds: Command[] = [];
    if (ctx.args.text !== undefined) cmds.push({ name: 'line.setText', params: { scene: sceneId, id, text: String(ctx.args.text) } });
    if (ctx.args.speaker !== undefined) cmds.push({ name: 'line.setSpeaker', params: { scene: sceneId, id, speaker: findInstance(state, sceneId, String(ctx.args.speaker)).id } });
    const d: Record<string, unknown> = {};
    if (ctx.args.delivery !== undefined) d.preset = ctx.args.delivery === 'none' ? undefined : manifestOf(lib, String(ctx.args.delivery)).ref;
    if (ctx.args.emotion !== undefined) d.emotion = String(ctx.args.emotion);
    if (ctx.args.pace !== undefined) d.pace = num(ctx.args.pace, '--pace');
    if (ctx.args.instruction !== undefined) d.instruction = String(ctx.args.instruction);
    if (Object.keys(d).length) cmds.push({ name: 'line.setDelivery', params: { scene: sceneId, id, delivery: JSON.parse(JSON.stringify({ ...clip.line.delivery, ...d })) } });
    if (ctx.args.caption !== undefined) cmds.push({ name: 'line.setCaption', params: { scene: sceneId, id, text: String(ctx.args.caption) } });
    if (ctx.args.muted !== undefined) cmds.push({ name: 'line.setMuted', params: { scene: sceneId, id, muted: String(ctx.args.muted) !== 'false' } });
    if (!cmds.length) throw new FrameError('USAGE', 'Nothing to change: give --text, --speaker, --delivery, --emotion, --pace, --instruction, --caption or --muted');
    return out(await mutate(ctx, cmds));
  },
  human,
});

for (const [group, verb, what] of [['act', 'add', 'an action'], ['face', 'add', 'an expression'], ['fx', 'add', 'an effect or atmosphere'], ['sound', 'add', 'music, ambience, a sound effect or cue']] as const) {
  command({
    path: [group, verb], summary: `Add ${what} at a time${group === 'act' || group === 'face' ? ' for a character' : ''}.`, mutating: true,
    args: [
      { name: 'asset', description: 'Asset id or ref', positional: true, required: true },
      { name: 'scene', description: 'Scene id or name (default: first scene)' },
      ...(group === 'act' || group === 'face' ? [{ name: 'who', description: 'Character instance id or name', required: true }] : []),
      ...(group === 'fx' ? [{ name: 'attach', description: 'Attach the effect to this object (id or name)' }] : []),
      ...(group === 'sound' ? [{ name: 'gain', description: 'Gain in dB', type: 'number' as const }] : []),
      { name: 'at', description: 'Start in seconds (default 0)', type: 'number' },
      { name: 'dur', description: 'Duration in seconds (default: 2 s; music, ambience and atmosphere run to the scene end)', type: 'number' },
    ],
    run: async (ctx) => {
      const { state, sceneId, lib } = await sceneOf(ctx);
      const { ref, m } = manifestOf(lib, String(ctx.args.asset));
      const want = group === 'act' ? ['act'] : group === 'face' ? ['exp', 'overlay'] : group === 'fx' ? ['fx', 'atmo', 'cam'] : ['music', 'amb', 'sfx', 'cue'];
      if (!want.includes(m.kind)) throw new FrameError('USAGE', `${ref} is a ${m.kind}, not ${what}`);
      const who = ctx.args.who ? findInstance(state, sceneId, String(ctx.args.who)).id : undefined;
      const attach = ctx.args.attach ? findInstance(state, sceneId, String(ctx.args.attach)).id : undefined;
      const cmd = clipCommand(state, sceneId, ref, m, { at: ctx.args.at !== undefined ? num(ctx.args.at, '--at') : 0, ...(ctx.args.dur !== undefined ? { dur: num(ctx.args.dur, '--dur') } : {}), ...(who ? { who } : {}), ...(attach ? { attach } : {}), ...(ctx.args.gain !== undefined ? { gainDb: num(ctx.args.gain, '--gain') } : {}) });
      const r = await mutate(ctx, [cmd], `Add ${m.name}`);
      return { ...out(r), clip: r.commands[0]?.params.id };
    },
    human: (r) => `${human(r)}  ${r.clip}`,
  });
}

command({
  path: ['look-at'], summary: 'Make a character look at another object or a stage point for a while (FR-ACT-05).', mutating: true,
  args: [
    { name: 'target', description: 'Object id or name, or a stage point x,y', positional: true, required: true },
    { name: 'who', description: 'Character instance id or name', required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'at', description: 'Start in seconds (default 0)', type: 'number' },
    { name: 'dur', description: 'Duration in seconds (default 2)', type: 'number' },
  ],
  run: async (ctx) => {
    const { state, sceneId } = await sceneOf(ctx);
    const t = String(ctx.args.target);
    const target = /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(t) ? point(t, 'target') : t;
    return out(await mutate(ctx, [lookAtCommand(state, sceneId, String(ctx.args.who), target, ctx.args.at !== undefined ? num(ctx.args.at, '--at') : 0, ctx.args.dur !== undefined ? num(ctx.args.dur, '--dur') : 2)]));
  },
  human,
});

command({
  path: ['shot', 'add'], summary: 'Cut to a camera for a time range on the Shot track.', mutating: true,
  args: [
    { name: 'camera', description: 'Camera id or name', positional: true, required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'at', description: 'Start in seconds (default 0)', type: 'number' },
    { name: 'dur', description: 'Duration in seconds (default: to the scene end)', type: 'number' },
    { name: 'transition', description: 'Transition into the shot (asset ref)' },
  ],
  run: async (ctx) => {
    const { state, sceneId, lib } = await sceneOf(ctx);
    const tr = ctx.args.transition ? manifestOf(lib, String(ctx.args.transition)).ref : undefined;
    return out(await mutate(ctx, [shotCommand(state, sceneId, String(ctx.args.camera), ctx.args.at !== undefined ? num(ctx.args.at, '--at') : 0, ctx.args.dur !== undefined ? num(ctx.args.dur, '--dur') : undefined, tr)]));
  },
  human,
});

/* ------------------------------------------------------------------ characters */

/** A project character to change: id or ref, newest version when no version is given. */
function characterRef(ctx: CommandContext, state: ProjectState, v: string): string {
  const lib = libraryOf(ctx, state);
  const { ref, m } = manifestOf(lib, v);
  if (m.kind !== 'chr') throw new FrameError('USAGE', `${ref} is not a character`);
  return ref;
}

async function saveCharacter(ctx: CommandContext, from: string, spec: Record<string, unknown>) {
  localOnly(ctx, 'Changing characters');
  const p = openProject(ctx);
  const lib = projectLibrary(ctx, p);
  const v = characterVersionCommands(p.state, { from, spec: spec as never, asNew: false, ...(ctx.args.update ? { update: { scope: String(ctx.args.update) as 'project' } } : {}) }, { manifest: (r) => lib.manifest(r), versions: (id) => lib.versions(id).map((m) => m.version) }, { newId: () => `user.${randomUUID()}`, date: new Date().toISOString().slice(0, 10), author: ctx.io.env.FRAME_AGENT_SESSION ? `agent:${ctx.io.env.FRAME_AGENT_SESSION}` : 'cli' });
  p.close();
  const r = await mutate(ctx, v.commands as never, v.label);
  return { ref: `${v.manifest.id}@${v.manifest.version}`, dryRun: r.dryRun, revision: r.revision, label: r.label };
}

command({
  path: ['char', 'set'], summary: 'Change a character as a new version: key=value pairs (name, role, parts.hair, colors.hair, body.height, …). --update project switches every usage.', mutating: true,
  args: [
    { name: 'character', description: 'Character id or ref', positional: true, required: true },
    { name: 'values', description: 'key=value pairs', positional: true, required: true, variadic: true },
    { name: 'update', description: 'Switch usages to the new version: project' },
  ],
  examples: ['frame char set user.1234 colors.hair=#3a2a20 parts.hair=<hair id>@1 --update project'],
  run: async (ctx) => {
    const { state } = await readProject(ctx);
    const spec: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(keyValues(ctx.args.values))) setPath(spec, k, v);
    return saveCharacter(ctx, characterRef(ctx, state, String(ctx.args.character)), spec);
  },
  human: (r) => `${r.dryRun ? 'Dry run: ' : ''}${r.label} → ${r.ref}`,
});

for (const verb of ['add', 'set'] as const) {
  command({
    path: ['char', 'look', verb], summary: verb === 'add' ? 'Add a look (outfit) to a character as a new version; it starts as a copy of the default look.' : 'Change a look\'s name, garments, accessories or colours as a new character version.', mutating: true,
    args: [
      { name: 'character', description: 'Character id or ref', positional: true, required: true },
      { name: 'look', description: 'Look id', positional: true, required: true },
      { name: 'values', description: 'key=value pairs: preset (a look.* id), name, garments (refs, comma separated), accessories, colors.<slot>=#RRGGBB', positional: true, variadic: true },
      { name: 'update', description: 'Switch usages to the new version: project' },
    ],
    examples: ['frame char look add user.1234@2 evening name=Evening colors.top=#202840'],
    run: async (ctx) => {
      const { state } = await readProject(ctx);
      const ref = characterRef(ctx, state, String(ctx.args.character));
      const data = libraryOf(ctx, state).manifest(ref)!.data as { looks: { id: string; name: string; garments: string[]; accessories: string[]; colors: Record<string, string> }[]; defaultLook: string };
      const id = String(ctx.args.look);
      const existing = data.looks.find((l) => l.id === id);
      if (verb === 'add' && existing) throw new FrameError('CONFLICT', `The character already has a look ${id}`, undefined, 'Use `char look set` to change it.');
      if (verb === 'set' && !existing) throw new FrameError('NOT_FOUND', `The character has no look ${id}`, { looks: data.looks.map((l) => l.id) });
      const base = existing ?? data.looks.find((l) => l.id === data.defaultLook) ?? data.looks[0]!;
      const look = { ...JSON.parse(JSON.stringify(base)), id, ...(existing ? {} : { name: id }) };
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : String(v).split(',').map((x) => x.trim()).filter(Boolean));
      for (const [k, v] of Object.entries(keyValues(ctx.args.values))) {
        if (k === 'preset') {
          // A preset look (Catalog B7) replaces the garments, accessories and colours.
          const pre = (libraryOf(ctx, state).manifest(String(v).includes('@') ? String(v) : `${v}@1`)?.data as { look?: { garments: string[]; accessories: string[]; colors: Record<string, string> } } | undefined)?.look;
          if (!pre) throw new FrameError('NOT_FOUND', `${v} is not a preset look`, undefined, 'See `frame assets search type:look`.');
          Object.assign(look, { garments: [...pre.garments], accessories: [...pre.accessories], colors: { ...pre.colors } });
        } else if (k === 'name') look.name = String(v);
        else if (k === 'garments' || k === 'accessories') look[k] = list(v);
        else if (k.startsWith('colors.')) look.colors = { ...look.colors, [k.slice(7)]: String(v) };
        else throw new FrameError('USAGE', `Unknown look field ${k}`, undefined, 'Use name, garments, accessories or colors.<slot>.');
      }
      const looks = existing ? data.looks.map((l) => (l.id === id ? look : l)) : [...data.looks, look];
      return saveCharacter(ctx, ref, { looks, defaultLook: data.defaultLook });
    },
    human: (r) => `${r.dryRun ? 'Dry run: ' : ''}${r.label} → ${r.ref}`,
  });
}

async function writeSheet(ctx: CommandContext) {
  const { state } = await readProject(ctx);
  const lib = libraryOf(ctx, state);
  const ref = characterRef(ctx, state, String(ctx.args.character));
  const m = lib.manifest(ref)!;
  const family = (ctx.args.family ?? state.project.styleFamily) as StyleFamily;
  const file = path.resolve(ctx.io.cwd, String(ctx.args.out ?? `${m.name.replace(/[^\w.-]+/g, '-')}-sheet.png`));
  if (ctx.opts.dryRun) return { dryRun: true, out: file, ref };
  const setup = sheetSetup(ref, m, ctx.args.look ? String(ctx.args.look) : undefined);
  const content = contentDir();
  const renderer = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
  try {
    const ev = previewFrame(setup, { assets: { manifest: (r) => setup.state.assets[r] ?? lib.manifest(r) }, styles: loadStyles(content), width: Number(ctx.args.width ?? 1920), height: Math.round(Number(ctx.args.width ?? 1920) * 9 / 16), family, captions: false, background: String(ctx.args.background ?? '#ffffff') });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeFileAtomic(file, renderer.png(ev.frame));
  } finally {
    renderer.dispose();
  }
  return { out: file, ref, family };
}

for (const p of [['char', 'sheet'], ['render', 'sheet']]) {
  command({
    path: p, summary: 'Render a character turnaround (front, three-quarter, side, back) to PNG.',
    args: [
      { name: 'character', description: 'Character id or ref', positional: true, required: true },
      { name: 'out', description: 'Output PNG (default <name>-sheet.png)' },
      { name: 'look', description: 'Look id (default: the character\'s default look)' },
      { name: 'family', description: 'flat or illustrated (default: the project\'s)' },
      { name: 'width', description: 'Width in pixels (default 1920)', type: 'number' },
      { name: 'background', description: 'Background colour (default #ffffff; #00000000 for transparent)' },
    ],
    run: writeSheet,
    human: (r) => (r.dryRun ? `Dry run: would write ${r.out}` : `Wrote ${r.out}`),
  });
}

/* ------------------------------------------------------------------ voice (FR-VOI) */

const CANDIDATES = 'history/voice-candidates.json';

function workerClient(ctx: CommandContext, state: ProjectState): VoiceClient {
  const url = state.project.voiceWorkerUrl || ctx.io.env.FRAME_WORKER_URL;
  if (!url) throw new FrameError('WORKER_UNAVAILABLE', 'No voice worker is configured', undefined, 'Set FRAME_WORKER_URL, a worker URL in project settings, or use --server.');
  return new VoiceClient({ url, ...(ctx.io.env.FRAME_WORKER_TOKEN ? { token: ctx.io.env.FRAME_WORKER_TOKEN } : {}) });
}

/** Voice work on the folder: the same workflows the server runs, applied through the CLI's session. */
function localAccess(ctx: CommandContext) {
  const p = openProject(ctx);
  const lib = projectLibrary(ctx, p);
  const source = ctx.io.env.FRAME_AGENT_SESSION ? `agent:${ctx.io.env.FRAME_AGENT_SESSION}` : 'cli';
  const access: ProjectAccess = {
    state: () => p.state as never,
    apply: (commands, label) => p.session.apply({ commands, source, ...(label ? { label } : {}) }),
    storeMedia: (bytes, meta) => p.store.putMedia(bytes, meta),
    readMedia: (hash) => {
      const f = p.store.findMedia(hash);
      if (!f) throw new FrameError('NOT_FOUND', `Media ${hash} not found`);
      return new Uint8Array(fs.readFileSync(f));
    },
    voice: (ref) => p.state.assets[ref] ?? lib.manifest(ref),
  };
  return { p, lib, access };
}

const progress = (ctx: CommandContext) => {
  let last = '';
  return { onProgress: (x: { message: string }) => x.message !== last && ctx.log((last = x.message)) };
};

async function serverJob<T>(ctx: CommandContext, method: string, url: (pid: string) => string, body: unknown): Promise<{ r: Remote; pid: string; result: T }> {
  const r = remote(ctx)!;
  const pid = await remoteProject(r, findProjectDir(ctx));
  const job = await r.req<{ id: string }>(method, url(pid), body);
  return { r, pid, result: await waitJob<T>(r, job.id, ctx.log) };
}

command({
  path: ['voice', 'list'], summary: 'Voices the project can use: this project\'s, your library\'s and Frame\'s, with method, language and users.', args: [],
  run: async (ctx) => {
    const { state } = await readProject(ctx);
    const lib = libraryOf(ctx, state);
    const users = new Map<string, string[]>();
    for (const sc of Object.values(state.scenes)) for (const i of sc.instances) if (i.character?.voice) users.set(i.character.voice, [...(users.get(i.character.voice) ?? []), `${i.name} (${sc.name})`]);
    return { voices: lib.search('', { kind: 'voice', limit: 1000 }).map((h) => ({ ref: h.ref, name: h.manifest.name, source: h.source, method: (h.manifest.data as { method?: string }).method, language: (h.manifest.data as { language?: string }).language, consent: !!(h.manifest.data as { consent?: unknown }).consent, usedBy: users.get(h.ref) ?? [] })) };
  },
  human: (r) => r.voices.map((v: any) => `${v.ref}  ${v.name}  ${v.method ?? ''} ${v.language ?? ''}  ${v.source}${v.usedBy.length ? `  used by ${v.usedBy.join(', ')}` : ''}`).join('\n') || 'No voices yet.',
});

command({
  path: ['voice', 'design'], summary: 'Design voice candidates from a description; audition them, then save one with `voice create --from-candidate N`.', mutating: true,
  args: [
    { name: 'description', description: 'Who the voice is: age, character, accent, pace', required: true },
    { name: 'line', description: 'Sample text to speak', required: true },
    { name: 'candidates', description: 'How many candidates (default 3)', type: 'number' },
    { name: 'language', description: 'Language code (default en)' },
    { name: 'seed', description: 'Seed for repeatable candidates', type: 'number' },
  ],
  run: async (ctx) => {
    const req = { description: String(ctx.args.description), sampleText: String(ctx.args.line), candidates: Number(ctx.args.candidates ?? 3), language: String(ctx.args.language ?? 'en'), ...(ctx.args.seed !== undefined ? { seed: num(ctx.args.seed, '--seed') } : {}) };
    if (ctx.opts.dryRun) return { dryRun: true, request: req };
    let res: { candidates: DesignCandidate[]; engine: string; fixture: boolean };
    let root: string;
    if (remote(ctx)) {
      res = (await serverJob<typeof res>(ctx, 'POST', (pid) => `/api/projects/${pid}/voices/design`, req)).result;
      root = findProjectDir(ctx);
    } else {
      const { p, access } = localAccess(ctx);
      res = await designCandidates(workerClient(ctx, p.state), access, req, progress(ctx));
      root = p.store.root;
      p.close();
    }
    writeFileAtomic(path.join(root, CANDIDATES), JSON.stringify({ ...req, ...res }, null, 2));
    return { engine: res.engine, fixture: res.fixture, candidates: res.candidates.map((c, i) => ({ n: i + 1, media: c.media.hash, durationS: c.durationS, seed: c.seed })) };
  },
  human: (r) => r.dryRun ? 'Dry run: nothing generated.' : `${r.candidates.length} candidate(s) from ${r.engine}${r.fixture ? ' (fixture audio — not real speech)' : ''}:\n${r.candidates.map((c: any) => `  ${c.n}. ${c.durationS.toFixed(1)} s  media ${c.media}`).join('\n')}\nSave one: frame voice create --name <name> --from-candidate <n>`,
});

command({
  path: ['voice', 'create'], summary: 'Save a voice from a designed candidate, or clone one from a recording with consent (FR-VOI-02/04).', mutating: true,
  args: [
    { name: 'name', description: 'Voice name', required: true },
    { name: 'from-candidate', description: 'Candidate number from the last `voice design`', type: 'number' },
    { name: 'from-audio', description: 'Recording of the speaker (≥ 3 s; 10–30 s best)' },
    { name: 'transcript', description: 'What is said in the recording (default: transcribed on the worker)' },
    { name: 'consent', description: 'own-voice or documented-consent (required to clone)' },
    { name: 'speaker', description: 'Speaker\'s name (required to clone)' },
    { name: 'assign', description: 'Use the voice for these character instances: scene/instance, comma separated' },
  ],
  run: async (ctx) => {
    const assignTo = String(ctx.args.assign ?? '').split(',').filter(Boolean).map((s) => {
      const [scene, instance] = s.split('/');
      return { scene: scene!, instance: instance! };
    });
    const name = String(ctx.args.name);
    const date = new Date().toISOString().slice(0, 10);
    if (ctx.args['from-candidate'] !== undefined) {
      const root = findProjectDir(ctx);
      const file = path.join(root, CANDIDATES);
      if (!fs.existsSync(file)) throw new FrameError('NOT_FOUND', 'No designed candidates yet', undefined, 'Run `frame voice design` first.');
      const d = JSON.parse(fs.readFileSync(file, 'utf8')) as { description: string; language: string; sampleText: string; candidates: DesignCandidate[] };
      const c = d.candidates[num(ctx.args['from-candidate'], '--from-candidate') - 1];
      if (!c) throw new FrameError('NOT_FOUND', `There are ${d.candidates.length} candidates`);
      if (remote(ctx)) {
        const r = remote(ctx)!;
        const pid = await remoteProject(r, root);
        return r.req('POST', `/api/projects/${pid}/voices`, { name, description: d.description, language: d.language, sampleText: d.sampleText, candidate: c, ...(assignTo.length ? { assignTo } : {}) });
      }
      const manifest = designedVoiceManifest({ id: `user.${randomUUID()}`, name, description: d.description, language: d.language, sampleText: d.sampleText, candidate: c, date });
      return voiceCommands(ctx, manifest, assignTo);
    }
    if (!ctx.args['from-audio']) throw new FrameError('USAGE', 'Give --from-candidate N or --from-audio <file>');
    const statement = String(ctx.args.consent ?? '');
    if ((statement !== 'own-voice' && statement !== 'documented-consent') || !ctx.args.speaker) throw new FrameError('CONSENT_REQUIRED', 'Cloning needs --consent own-voice|documented-consent and --speaker <name>');
    const audio = path.resolve(ctx.io.cwd, String(ctx.args['from-audio']));
    if (!fs.existsSync(audio)) throw new FrameError('NOT_FOUND', `${audio} does not exist`);
    const ext = path.extname(audio).slice(1).toLowerCase();
    const bytes = new Uint8Array(fs.readFileSync(audio));
    const consent = { statement: statement as ConsentRecord['statement'], speakerName: String(ctx.args.speaker) };
    if (remote(ctx)) {
      const r = remote(ctx)!;
      const pid = await remoteProject(r, findProjectDir(ctx));
      const up = await fetch(`${r.url}/api/projects/${pid}/media?ext=${ext}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', ...(ctx.opts.token ? { authorization: `Bearer ${ctx.opts.token}` } : {}), ...(ctx.io.env.FRAME_AGENT_SESSION ? { 'x-frame-agent': ctx.io.env.FRAME_AGENT_SESSION } : {}) }, body: bytes as BodyInit });
      const media = (await up.json()) as { hash: string };
      if (!up.ok) throw new FrameError('VALIDATION_FAILED', 'The recording could not be uploaded');
      const job = await r.req<{ id: string }>('POST', `/api/projects/${pid}/voices/clone`, { name, media: media.hash, consent, ...(ctx.args.transcript ? { transcript: String(ctx.args.transcript) } : {}), ...(assignTo.length ? { assignTo } : {}) });
      return waitJob(r, job.id, ctx.log);
    }
    const { p, access } = localAccess(ctx);
    if (ctx.io.env.FRAME_AGENT_SESSION && !p.state.project.permissions.agent.cloneVoices) throw new FrameError('PERMISSION_REQUIRED', 'Agents may not clone voices in this project', undefined, 'A person can allow it in Project settings ▸ Agent permissions.');
    const pcm = decodeAudioFile(audio);
    const durationS = (pcm.data[0]?.length ?? 0) / pcm.sampleRate;
    if (durationS < 3) throw new FrameError('VALIDATION_FAILED', `The recording is ${durationS.toFixed(1)} s; cloning needs at least 3 s (10–30 s is best)`);
    let transcript = ctx.args.transcript ? String(ctx.args.transcript) : '';
    if (!transcript) {
      const client = workerClient(ctx, p.state);
      const h = await client.uploadBlob(bytes, `ref.${ext}`, `audio/${ext}`);
      transcript = (await client.wait(await client.transcribe({ audioHash: h, language: 'en' }))).text.trim();
      if (!transcript) throw new FrameError('VALIDATION_FAILED', 'No speech was recognised in the recording; pass --transcript');
    }
    const media = { ...access.storeMedia(bytes, { ext, mime: ext === 'wav' ? 'audio/wav' : `audio/${ext}`, durationS, sampleRate: pcm.sampleRate, channels: pcm.channels }) };
    p.close();
    const manifest = clonedVoiceManifest({ id: `user.${randomUUID()}`, name, description: '', language: 'en', media, transcript, date, consent: { ...consent, confirmedBy: ctx.io.env.FRAME_AGENT_SESSION ? `agent:${ctx.io.env.FRAME_AGENT_SESSION}` : 'cli', date } });
    return { ...(await voiceCommands(ctx, manifest, assignTo)), ...(durationS < 10 ? { note: 'Recordings of 10–30 s give a closer likeness.' } : {}) };
  },
  human: (r) => `${r.dryRun ? 'Dry run: would save' : 'Saved'} ${r.ref ?? r.result?.ref ?? 'the voice'}${r.note ? `\n${r.note}` : ''}`,
});

async function voiceCommands(ctx: CommandContext, manifest: AssetManifest, assignTo: { scene: string; instance: string }[]) {
  const { state } = await readProject(ctx);
  const ref = `${manifest.id}@${manifest.version}`;
  const cmds: Command[] = [{ name: 'asset.addLocal', params: { manifest } }];
  for (const a of assignTo) {
    const inst = findInstance(state, a.scene, a.instance);
    if (!inst.character) throw new FrameError('USAGE', `${inst.name} is not a character`);
    cmds.push({ name: 'instance.update', params: { scene: a.scene, id: inst.id, set: { character: { ...inst.character, voice: ref } } } });
  }
  const r = await mutate(ctx, cmds, `Save voice ${manifest.name}`);
  return { ref, dryRun: r.dryRun, revision: r.revision };
}

command({
  path: ['voice', 'range', 'build'], summary: 'Render emotion references for a project voice and save the accepted ones as its next version (FR-VOI-03/10).', mutating: true,
  args: [
    { name: 'voice', description: 'Voice ref (a project voice)', positional: true, required: true },
    { name: 'emotions', description: 'Emotions, comma separated (default: the standard range)' },
    { name: 'min-similarity', description: 'Accept only references at least this similar to the neutral voice, 0–1 (default 0.7 when the engine reports it)', type: 'number' },
    { name: 'update-users', description: 'Switch characters using the voice to the new version', type: 'boolean' },
  ],
  run: async (ctx) => {
    const voiceRef = String(ctx.args.voice);
    const emotions = ctx.args.emotions ? String(ctx.args.emotions).split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const min = ctx.args['min-similarity'] !== undefined ? num(ctx.args['min-similarity'], '--min-similarity') : 0.7;
    const keep = (c: RangeCandidate) => c.similarity === null || c.similarity >= min;
    if (ctx.opts.dryRun) return { dryRun: true, voice: voiceRef, emotions };
    if (remote(ctx)) {
      const { r, pid, result } = await serverJob<{ candidates: RangeCandidate[] }>(ctx, 'POST', (id) => `/api/projects/${id}/voices/range`, { voice: voiceRef, ...(emotions ? { emotions } : {}) });
      const accept = result.candidates.filter(keep);
      if (!accept.length) throw new FrameError('VALIDATION_FAILED', 'No reference was similar enough to keep', { candidates: result.candidates.map((c) => ({ emotion: c.emotion, similarity: c.similarity })) });
      const v = await r.req<{ ref: string }>('POST', `/api/projects/${pid}/voices/version`, { voice: voiceRef, accept, updateUsers: ctx.args['update-users'] === true });
      return { ref: v.ref, accepted: accept.map((c) => c.emotion), rejected: result.candidates.filter((c) => !keep(c)).map((c) => c.emotion) };
    }
    const { p, access } = localAccess(ctx);
    const voice = p.state.assets[voiceRef];
    if (!voice) throw new FrameError('NOT_FOUND', `${voiceRef} is not a voice in this project`, undefined, 'Only voices designed in this project can be extended.');
    const res = await rangeCandidates(workerClient(ctx, p.state), access, voiceRef, { ...(emotions ? { emotions } : {}) }, progress(ctx));
    const accept = res.candidates.filter(keep);
    if (!accept.length) {
      p.close();
      throw new FrameError('VALIDATION_FAILED', 'No reference was similar enough to keep');
    }
    const versions = Object.values(p.state.assets).filter((a) => a.id === voice.id).map((a) => a.version);
    const next = voiceWithReferences(voice, accept, new Date().toISOString().slice(0, 10), Math.max(...versions) + 1);
    const ref = `${next.id}@${next.version}`;
    const cmds: Command[] = [{ name: 'asset.addLocal', params: { manifest: next } }];
    if (ctx.args['update-users']) for (const sc of Object.values(p.state.scenes)) for (const i of sc.instances) if (i.character?.voice === voiceRef) cmds.push({ name: 'instance.update', params: { scene: sc.id, id: i.id, set: { character: { ...i.character, voice: ref } } } });
    access.apply(cmds, `${voice.name} version ${next.version}`);
    p.close();
    return { ref, accepted: accept.map((c) => c.emotion), rejected: res.candidates.filter((c) => !keep(c)).map((c) => c.emotion) };
  },
  human: (r) => (r.dryRun ? 'Dry run: nothing generated.' : `Saved ${r.ref}: ${r.accepted.join(', ')}${r.rejected.length ? `\nNot similar enough: ${r.rejected.join(', ')}` : ''}`),
});

command({
  path: ['takes', 'generate'], summary: 'Generate takes for lines with each speaker\'s voice, aligned for lip sync (FR-VOI-07).', mutating: true,
  args: [
    { name: 'lines', description: 'Line clip ids (default: every line in the scene without a current take)', positional: true, variadic: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
    { name: 'takes', description: 'Takes per line (default 1)', type: 'number' },
    { name: 'seed', description: 'Seed for repeatable takes', type: 'number' },
    { name: 'delivery', description: 'Delivery preset applied to these lines first' },
  ],
  run: async (ctx) => {
    const { state, sceneId, lib } = await sceneOf(ctx);
    const sc = state.scenes[sceneId]!;
    let lines = (Array.isArray(ctx.args.lines) ? ctx.args.lines : ctx.args.lines ? [ctx.args.lines] : []).map(String);
    if (!lines.length) lines = sc.clips.filter((c) => c.line && !c.line.muted && !(c.line.take && state.takes[c.line.take]?.lineRevision === c.line.revision)).map((c) => c.id);
    if (!lines.length) throw new FrameError('USAGE', 'Every line already has a current take', undefined, 'Name lines to generate more takes for them.');
    if (ctx.args.delivery) {
      const preset = manifestOf(lib, String(ctx.args.delivery)).ref;
      await mutate(ctx, lines.map((id) => ({ name: 'line.setDelivery', params: { scene: sceneId, id, delivery: { ...(sc.clips.find((c) => c.id === id)?.line?.delivery ?? {}), preset } } })), 'Delivery preset');
    }
    if (ctx.opts.dryRun) return { dryRun: true, lines };
    const req = { scene: sceneId, lines, takes: Number(ctx.args.takes ?? 1), ...(ctx.args.seed !== undefined ? { seed: num(ctx.args.seed, '--seed') } : {}) };
    if (remote(ctx)) return (await serverJob(ctx, 'POST', (pid) => `/api/projects/${pid}/takes/generate`, req)).result;
    const { p, access } = localAccess(ctx);
    try {
      return await generateTakes(workerClient(ctx, p.state), access, req, progress(ctx));
    } finally {
      p.close();
    }
  },
  human: (r) => (r.dryRun ? `Dry run: would generate takes for ${r.lines.length} line(s)` : `${r.takes?.length ?? 0} take(s) ready${r.fixture ? ' (fixture audio — not real speech)' : ''}`),
});

command({
  path: ['takes', 'choose'], summary: 'Choose which take a line uses.', mutating: true,
  args: [
    { name: 'line', description: 'Line clip id', positional: true, required: true },
    { name: 'take', description: 'Take id or number', positional: true, required: true },
    { name: 'scene', description: 'Scene id or name (default: first scene)' },
  ],
  run: async (ctx) => {
    const { state, sceneId } = await sceneOf(ctx);
    const t = String(ctx.args.take);
    const take = state.takes[t] ? t : Object.entries(state.takes).find(([, x]) => x.line === ctx.args.line && String(x.number) === t)?.[0];
    if (!take) throw new FrameError('NOT_FOUND', `Take ${t} not found for line ${ctx.args.line}`);
    return out(await mutate(ctx, [{ name: 'line.chooseTake', params: { scene: sceneId, id: String(ctx.args.line), take } }]));
  },
  human,
});

command({
  path: ['align'], summary: 'Re-align a take against its line\'s text for lip sync (FR-LIP-01).', mutating: true,
  args: [{ name: 'take', description: 'Take id', positional: true, required: true }, { name: 'language', description: 'Language code (default en)' }],
  run: async (ctx) => {
    if (ctx.opts.dryRun) return { dryRun: true, take: ctx.args.take };
    const language = String(ctx.args.language ?? 'en');
    if (remote(ctx)) return (await serverJob(ctx, 'POST', (pid) => `/api/projects/${pid}/takes/${encodeURIComponent(String(ctx.args.take))}/align`, { language })).result;
    const { p, access } = localAccess(ctx);
    try {
      return await alignTake(workerClient(ctx, p.state), access, String(ctx.args.take), language, progress(ctx));
    } finally {
      p.close();
    }
  },
  human: (r) => (r.dryRun ? `Dry run: would align ${r.take}` : `Aligned ${r.take}: ${r.words} words (${r.method})`),
});

/* ------------------------------------------------------------------ jobs and services */

function serverOnly(ctx: CommandContext, what: string): Remote {
  const r = remote(ctx);
  if (!r) throw new FrameError('USAGE', `${what} lives on a Frame Server`, undefined, 'Pass --server <url> (jobs run on the server; local commands run in the foreground).');
  return r;
}

command({
  path: ['jobs', 'list'], summary: 'Jobs on the server (exports, voice generation, imports, thumbnails).', args: [{ name: 'all', description: 'Every project, not just this one', type: 'boolean' }],
  run: async (ctx) => {
    const r = serverOnly(ctx, 'The job queue');
    const q = ctx.args.all ? '' : `?project=${encodeURIComponent(await remoteProject(r, findProjectDir(ctx)))}`;
    return r.req<{ jobs: unknown[] }>('GET', `/api/jobs${q}`);
  },
  human: (r) => r.jobs.map((j: any) => `${j.id}  ${j.state.padEnd(9)} ${Math.round((j.progress ?? 0) * 100)}%  ${j.label}${j.message ? ` · ${j.message}` : ''}`).join('\n') || 'No jobs.',
});

command({
  path: ['jobs', 'watch'], summary: 'Follow a job until it ends; prints progress and the result.', args: [{ name: 'id', description: 'Job id', positional: true, required: true }],
  run: async (ctx) => ({ id: ctx.args.id, result: await waitJob(serverOnly(ctx, 'Watching jobs'), String(ctx.args.id), ctx.log) }),
  human: (r) => `Job ${r.id} finished.\n${JSON.stringify(r.result, null, 2)}`,
});

command({
  path: ['jobs', 'cancel'], summary: 'Cancel a queued or running job.', args: [{ name: 'id', description: 'Job id', positional: true, required: true }],
  run: async (ctx) => serverOnly(ctx, 'Cancelling jobs').req<{ cancelled: boolean }>('DELETE', `/api/jobs/${encodeURIComponent(String(ctx.args.id))}`),
  human: (r) => (r.cancelled ? 'Cancelled.' : 'The job had already finished.'),
});

async function workerReport(ctx: CommandContext, doctor: boolean) {
  const r = remote(ctx);
  if (r) {
    let pid: string | undefined;
    try {
      pid = await remoteProject(r, findProjectDir(ctx));
    } catch {
      /* no project here: the server's own worker */
    }
    return r.req<Record<string, unknown>>('GET', `/api/worker/status${pid ? `?project=${encodeURIComponent(pid)}` : ''}`);
  }
  let state: ProjectState | undefined;
  try {
    state = (await readProject(ctx)).state;
  } catch {
    /* outside a project */
  }
  const url = state?.project.voiceWorkerUrl || ctx.io.env.FRAME_WORKER_URL;
  if (!url) return { state: 'misconfigured', message: 'No voice worker is configured', hint: 'Set FRAME_WORKER_URL or a worker URL in project settings.' };
  const client = new VoiceClient({ url, ...(ctx.io.env.FRAME_WORKER_TOKEN ? { token: ctx.io.env.FRAME_WORKER_TOKEN } : {}) });
  try {
    const h = await client.health();
    const caps = await client.capabilities();
    const checks = doctor ? [
      { check: 'reachable', ok: h.ok },
      { check: 'engines', ok: caps.engines.length > 0, detail: caps.engines.map((e) => e.id).join(', ') },
      { check: 'real speech', ok: !caps.fixture, detail: caps.fixture ? 'fixture engine: test signals, not real speech' : 'real engine' },
    ] : undefined;
    return { state: 'connected', url, version: h.version, fixture: caps.fixture, engines: caps.engines.map((e) => e.id), ...(checks ? { checks } : {}) };
  } catch (e) {
    return { state: 'offline', url, message: (e as Error).message, hint: 'Start the Voice Worker (see services/voice-worker/README.md) and check the URL.' };
  }
}

command({
  path: ['worker', 'status'], summary: 'Is the Voice Worker reachable, and is it a real engine or the fixture engine?', args: [],
  run: (ctx) => workerReport(ctx, false),
  human: (r) => `${r.state}${r.url ? `  ${r.url}` : ''}${r.engines ? `  engines: ${r.engines.join(', ')}` : ''}${r.fixture ? '  (fixture audio — not real speech)' : ''}${r.message ? `\n${r.message}` : ''}${r.hint ? `\n${r.hint}` : ''}`,
});

command({
  path: ['worker', 'doctor'], summary: 'Check the Voice Worker: reachable, engines, real speech. For GPU and model checks run `frame-voice-worker doctor` on the worker machine.', args: [],
  run: (ctx) => workerReport(ctx, true),
  human: (r) => [`${r.state}${r.url ? `  ${r.url}` : ''}`, ...((r.checks ?? []) as { check: string; ok: boolean; detail?: string }[]).map((c) => `  ${c.ok ? 'ok  ' : 'FAIL'}  ${c.check}${c.detail ? ` — ${c.detail}` : ''}`), ...(r.hint ? [r.hint] : [])].join('\n'),
});
