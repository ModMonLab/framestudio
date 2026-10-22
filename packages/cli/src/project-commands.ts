import fs from 'node:fs';
import path from 'node:path';
import { FrameError, jsonSchema, schemas, type Command, type CommandBatch, type Problem } from '@frame/schema';
import { compareStates, describeCommands, formatTimecode, lineTakeState, parseScript, scriptImportCommands, scriptText, validateProject, ticksToSeconds, randomId, type ProjectState } from '@frame/core';
import { remote, remoteProject } from './remote.js';
import { remoteState } from './remote.js';
import { OpenProject, isProjectFolder, computeLocks, manifestHash, projectFromTemplateCommands } from '@frame/io';
import { libraryFor, loadStyles } from '@frame/assets/node';
import type { Library } from '@frame/assets';
import { command, commands, type CommandContext } from './framework.js';
import { APP_VERSION, contentDir, libraryDefaults, userLibraryDir } from './env.js';

/* ------------------------------------------------------------------ helpers */

export function findProjectDir(ctx: CommandContext): string {
  if (ctx.opts.project) {
    const p = path.resolve(ctx.io.cwd, ctx.opts.project);
    if (!isProjectFolder(p)) throw new FrameError('NOT_FOUND', `No Frame project at ${p}`, undefined, 'Pass --project <folder> pointing at a folder with project.json.');
    return p;
  }
  let d = path.resolve(ctx.io.cwd);
  for (;;) {
    if (isProjectFolder(d)) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new FrameError('NOT_FOUND', 'No Frame project in this folder or its parents', undefined, 'Use --project <folder> or run `frame init <folder>`.');
}

/** Bundled + user library, plus the project's local assets when a project is given (FR-AST-01). */
export function projectLibrary(ctx: CommandContext, p?: OpenProject): Library {
  return libraryFor({ contentDir: contentDir(), userDir: userLibraryDir(ctx.io.env), ...(p ? { projectAssets: p.state.assets } : {}) });
}

/** Validation context with library lookups: missing assets and lock drift (FR-PER-06, FR-DAT-06). */
export function validationContext(ctx: CommandContext, p: OpenProject) {
  const lib = projectLibrary(ctx, p);
  return {
    assetExists: (r: string) => lib.has(r),
    manifest: (r: string) => lib.manifest(r),
    mediaExists: (h: string) => p.store.verifyMedia(h),
    assetHash: (r: string) => {
      const e = lib.get(r);
      return e && e.source !== 'project' ? manifestHash(e.manifest) : undefined;
    },
  };
}

export function openProject(ctx: CommandContext): OpenProject {
  const p = OpenProject.open(findProjectDir(ctx), { writeMigrations: ctx.opts.yes });
  p.locksFor = (state) => {
    const lib = projectLibrary(ctx);
    return computeLocks(state, (ref) => {
      const e = lib.get(ref);
      return e ? { manifest: e.manifest, source: e.source } : undefined;
    });
  };
  if (p.load?.migrated.length && !ctx.opts.yes && !ctx.opts.dryRun) {
    throw new FrameError('MIGRATION_REQUIRED', `${p.load.migrated.length} file(s) use an older format`, { files: p.load.migrated }, 'Re-run with --yes to migrate them (originals are rewritten in the new format).');
  }
  return p;
}

/** Applies engine commands through the same session API as the Studio, locally or on the server (FR-ARC-01, FR-CLI-01/06). */
export async function mutate(ctx: CommandContext, cmds: Command[], label?: string) {
  const r = remote(ctx);
  if (r) {
    const pid = await remoteProject(r, findProjectDir(ctx));
    const res = await r.req<{ dryRun: boolean; revision: number; label: string; commands: Command[]; reports: unknown[] }>('POST', `/api/projects/${pid}/commands`, { commands: cmds, ...(label ? { label } : {}), ...(ctx.opts.baseRevision !== undefined ? { baseRevision: ctx.opts.baseRevision } : {}), ...(ctx.opts.dryRun ? { dryRun: true } : {}) });
    const { problems } = await r.req<{ problems: Problem[] }>('GET', `/api/projects/${pid}/validate`);
    return { dryRun: res.dryRun, revision: res.revision, label: res.label, commands: res.commands, reports: res.reports, problems: problems.filter((x) => x.severity !== 'info'), state: (await remoteState(r, pid)).state };
  }
  const p = openProject(ctx);
  const batch: CommandBatch = { commands: cmds, source: (ctx.io.env.FRAME_AGENT_SESSION ? `agent:${ctx.io.env.FRAME_AGENT_SESSION}` : 'cli'), ...(label ? { label } : {}) };
  if (ctx.opts.baseRevision !== undefined) batch.baseRevision = ctx.opts.baseRevision;
  const res = p.session.apply(batch, { dryRun: ctx.opts.dryRun });
  const problems = validateProject(res.state, validationContext(ctx, p));
  if (!ctx.opts.dryRun) p.close();
  return {
    dryRun: res.dryRun,
    revision: res.revision,
    label: res.label,
    commands: res.commands,
    reports: res.reports,
    problems: problems.filter((x) => x.severity !== 'info'),
    state: res.state,
  };
}

/** Project state for read-only commands, from the folder or the server. */
export async function readProject(ctx: CommandContext): Promise<{ state: ProjectState; revision: number; root: string }> {
  const r = remote(ctx);
  const root = findProjectDir(ctx);
  if (r) {
    const s = await remoteState(r, await remoteProject(r, root));
    return { state: s.state, revision: s.revision, root };
  }
  const p = openProject(ctx);
  return { state: p.state, revision: p.session.revision, root: p.store.root };
}

/** Commands that work on files the server owns run only in local mode. */
export function localOnly(ctx: CommandContext, what: string) {
  if (ctx.opts.server) throw new FrameError('USAGE', `${what} runs in local mode only`, undefined, 'Omit --server (stop the server first if it has the project open).');
}

function stripState<T extends { state?: unknown }>(r: T): Omit<T, 'state'> {
  const { state: _s, ...rest } = r;
  return rest;
}

const mutHuman = (r: { dryRun: boolean; revision: number; label: string; commands: Command[] }) =>
  r.dryRun ? `Dry run: "${r.label}" would apply ${r.commands.length} command(s). Nothing was written.` : `${r.label} (revision ${r.revision})`;

/* ------------------------------------------------------------------ project */

command({
  path: ['init'],
  summary: 'Create a new project folder.',
  mutating: true,
  args: [
    { name: 'path', description: 'Folder to create (e.g. MyShow.frame)', positional: true, required: true },
    { name: 'name', description: 'Project name (default: folder name)' },
    { name: 'family', description: 'Style family: flat or illustrated' },
    { name: 'fps', description: 'Frame rate: 24, 25 or 30', type: 'number' },
    { name: 'template', description: 'Start from a production template (see `frame template list`)' },
    { name: 'cast', description: 'With --template: role=chr.…@1,role=chr.…@1' },
  ],
  examples: ['frame init MyShow.frame --name "My show" --family illustrated --fps 24', 'frame init Pod.frame --template <template ref> --cast <role>=<character ref>'],
  run: (ctx) => {
    const dir = path.resolve(ctx.io.cwd, String(ctx.args.path));
    const defaults = libraryDefaults();
    const family = (ctx.args.family as string | undefined) ?? defaults.styleFamily;
    if (family !== 'flat' && family !== 'illustrated') throw new FrameError('USAGE', '--family must be flat or illustrated');
    const fps = (ctx.args.fps as number | undefined) ?? defaults.frameRate;
    if (![24, 25, 30].includes(fps)) throw new FrameError('USAGE', '--fps must be 24, 25 or 30');
    const name = (ctx.args.name as string | undefined) ?? path.basename(dir).replace(/\.frame$/, '');
    if (ctx.opts.dryRun) return { dryRun: true, path: dir, name, styleFamily: family, frameRate: fps };
    if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new FrameError('CONFLICT', `${dir} is not empty`);
    const p = OpenProject.create(dir, { name, styleFamily: family, frameRate: fps as 24, output: defaults.output, appVersion: APP_VERSION, newId: randomId, ...(defaults.captionStyle ? { captionStyle: defaults.captionStyle } : {}) });
    // From a production template (FR-PRJ-01): its scenes replace the empty first scene.
    if (ctx.args.template) {
      const lib = libraryFor({ contentDir: contentDir(), userDir: userLibraryDir(ctx.io.env), projectAssets: p.state.assets });
      const cast = Object.fromEntries(String(ctx.args.cast ?? '').split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]));
      try {
        const ex = projectFromTemplateCommands(p.state, String(ctx.args.template), { cast }, { lib, styles: loadStyles(contentDir()) });
        p.session.apply({ commands: ex.commands, source: 'cli', label: `Start from ${lib.manifest(String(ctx.args.template))?.name ?? 'template'}` });
      } catch (e) {
        p.close();
        fs.rmSync(dir, { recursive: true, force: true });
        throw e;
      }
    }
    p.close();
    return { path: dir, id: p.state.project.id, name, styleFamily: family, frameRate: fps, revision: p.session.revision };
  },
  human: (r) => (r.dryRun ? `Dry run: would create ${r.path}` : `Created ${r.name} at ${r.path}`),
});

command({
  path: ['info'],
  summary: 'Show project summary: settings, episodes, scenes, cast and revision.',
  args: [],
  run: async (ctx) => {
    const p = await readProject(ctx);
    const s = p.state;
    return {
      path: p.root,
      id: s.project.id,
      name: s.project.name,
      styleFamily: s.project.styleFamily,
      frameRate: s.project.frameRate,
      output: s.project.output,
      revision: p.revision,
      cast: s.project.cast,
      episodes: s.project.episodes.map((e) => ({
        id: e,
        name: s.episodes[e]?.name,
        scenes: (s.episodes[e]?.scenes ?? []).map((id) => ({ id, name: s.scenes[id]?.name, durationS: ticksToSeconds(s.scenes[id]?.duration ?? 0) })),
      })),
    };
  },
  human: (r) =>
    [`${r.name}  (${r.styleFamily}, ${r.frameRate} fps, ${r.output.width}×${r.output.height}, revision ${r.revision})`, r.path, '']
      .concat(r.episodes.flatMap((e: any) => [`${e.name}  ${e.id}`, ...e.scenes.map((sc: any) => `  ${sc.name}  ${sc.id}  ${sc.durationS.toFixed(1)} s`)]))
      .join('\n'),
});

command({
  path: ['validate'],
  summary: 'Validate schemas, references, media hashes, timing and conflicts. Exit code 2 if anything blocks export.',
  args: [],
  run: async (ctx) => {
    const r = remote(ctx);
    let problems: Problem[];
    let revision: number;
    if (r) {
      const v = await r.req<{ revision: number; problems: Problem[] }>('GET', `/api/projects/${await remoteProject(r, findProjectDir(ctx))}/validate`);
      problems = v.problems;
      revision = v.revision;
    } else {
      const p = openProject(ctx);
      problems = [...(p.load?.problems ?? []), ...validateProject(p.state, validationContext(ctx, p))];
      revision = p.session.revision;
    }
    const blocking = problems.filter((x) => x.blocksExport);
    const result = { valid: blocking.length === 0, revision, problems };
    if (blocking.length) throw new FrameError('VALIDATION_FAILED', `${blocking.length} problem(s) block export`, result);
    return result;
  },
  human: (r) => (r.problems.length ? r.problems.map((x: any) => `${x.severity}: ${x.message}`).join('\n') + '\nNo blocking problems.' : 'Project is valid.'),
});

const settingKeys = ['name', 'description', 'styleFamily', 'frameRate', 'output', 'captions', 'voiceWorkerUrl', 'renderDir'] as const;

command({
  path: ['settings', 'get'],
  summary: 'Print project settings (or one key).',
  args: [{ name: 'key', description: 'Setting key', positional: true }],
  run: async (ctx) => {
    const pr = (await readProject(ctx)).state.project as Record<string, unknown>;
    const all = Object.fromEntries(settingKeys.map((k) => [k, pr[k]]));
    if (ctx.args.key) {
      if (!settingKeys.includes(ctx.args.key as never)) throw new FrameError('NOT_FOUND', `Unknown setting ${ctx.args.key}`, { keys: settingKeys });
      return { [String(ctx.args.key)]: all[String(ctx.args.key)] };
    }
    return all;
  },
  human: (r) => Object.entries(r).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'),
});

command({
  path: ['settings', 'set'],
  summary: 'Change project settings: key=value pairs (values may be JSON).',
  mutating: true,
  args: [{ name: 'pairs', description: 'key=value …', positional: true, variadic: true, required: true }],
  examples: ['frame settings set name="Season two" styleFamily=illustrated', 'frame settings set frameRate=30 --dry-run'],
  run: async (ctx) => {
    const set: Record<string, unknown> = {};
    const cmds: Command[] = [];
    for (const pair of ctx.args.pairs as string[]) {
      const i = pair.indexOf('=');
      if (i < 1) throw new FrameError('USAGE', `Expected key=value, got "${pair}"`);
      const k = pair.slice(0, i);
      const raw = pair.slice(i + 1);
      let v: unknown = raw;
      try {
        v = JSON.parse(raw);
      } catch {
        /* plain string */
      }
      if (!settingKeys.includes(k as never)) throw new FrameError('NOT_FOUND', `Unknown setting ${k}`, { keys: settingKeys });
      if (k === 'frameRate') cmds.push({ name: 'project.setFrameRate', params: { frameRate: v } });
      else set[k] = v;
    }
    if (Object.keys(set).length) cmds.unshift({ name: 'project.setSettings', params: set });
    return stripState(await mutate(ctx, cmds));
  },
  human: mutHuman,
});

command({
  path: ['apply'],
  summary: 'Apply a list of engine commands atomically (all or none). Reads a JSON file or stdin (-).',
  mutating: true,
  args: [{ name: 'file', description: 'commands.json (array of {name, params} or a batch object) or - for stdin', positional: true, required: true }],
  examples: ['frame apply commands.json --dry-run --json', 'echo \'[{"name":"scene.rename","params":{"id":"scn_…","name":"Intro"}}]\' | frame apply -'],
  run: async (ctx) => {
    const text = ctx.args.file === '-' ? await (ctx.io.stdin?.() ?? Promise.resolve('')) : fs.readFileSync(path.resolve(ctx.io.cwd, String(ctx.args.file)), 'utf8');
    let doc: unknown;
    try {
      doc = JSON.parse(text);
    } catch (e) {
      throw new FrameError('USAGE', `Commands are not valid JSON: ${(e as Error).message}`);
    }
    const batch = Array.isArray(doc) ? { commands: doc as Command[] } : (doc as { commands: Command[]; label?: string; baseRevision?: number });
    if (!Array.isArray(batch.commands) || batch.commands.length === 0) throw new FrameError('USAGE', 'Expected a non-empty list of commands');
    if (batch.baseRevision !== undefined && ctx.opts.baseRevision === undefined) ctx.opts.baseRevision = batch.baseRevision;
    return stripState(await mutate(ctx, batch.commands, batch.label));
  },
  human: mutHuman,
});

command({
  path: ['history'],
  summary: 'List committed changes (revision, time, source, label).',
  args: [{ name: 'limit', description: 'Show only the last N entries', type: 'number' }],
  run: async (ctx) => {
    const r = remote(ctx);
    if (r) {
      const pid = await remoteProject(r, findProjectDir(ctx));
      const h = (await r.req<{ history: { revision: number }[] }>('GET', `/api/projects/${pid}/history`)).history;
      return { revision: (await remoteState(r, pid)).revision, entries: ctx.args.limit ? h.slice(-Number(ctx.args.limit)) : h };
    }
    const p = openProject(ctx);
    const h = p.store.readHistory();
    return { revision: p.session.revision, entries: ctx.args.limit ? h.slice(-Number(ctx.args.limit)) : h };
  },
  human: (r) => r.entries.map((e: any) => `${String(e.revision).padStart(5)}  ${e.at}  ${e.source.padEnd(14)} ${e.label}`).join('\n') || 'No history yet.',
});

/* ------------------------------------------------------------------ versions (FR-PER-03) */

command({
  path: ['versions', 'list'],
  summary: 'List saved project versions.',
  args: [],
  run: (ctx) => {
    localOnly(ctx, 'Listing versions');
    return { versions: openProject(ctx).store.listVersions() };
  },
  human: (r) => r.versions.map((v: any) => `${v.id}  ${v.createdAt}  rev ${v.revision}  ${v.name}`).join('\n') || 'No versions saved.',
});

command({
  path: ['versions', 'save'],
  summary: 'Save a named snapshot of the project.',
  mutating: true,
  args: [{ name: 'name', description: 'Version name', positional: true, required: true }],
  run: (ctx) => {
    localOnly(ctx, 'Saving a version');
    const p = openProject(ctx);
    if (ctx.opts.dryRun) return { dryRun: true, name: ctx.args.name };
    return p.store.saveVersion(p.state, p.session.revision, String(ctx.args.name), randomId('snap'));
  },
  human: (r) => (r.dryRun ? `Dry run: would save version "${r.name}"` : `Saved version "${r.name}" (${r.id})`),
});

command({
  path: ['versions', 'restore'],
  summary: 'Restore a saved version (the restore itself is a new revision and can be undone in the Studio).',
  mutating: true,
  args: [{ name: 'id', description: 'Version id', positional: true, required: true }],
  run: (ctx) => {
    localOnly(ctx, 'Restoring a version');
    const p = openProject(ctx);
    const snap = p.store.loadVersion(String(ctx.args.id));
    if (ctx.opts.dryRun) return { dryRun: true, id: ctx.args.id, scenes: Object.keys(snap.scenes).length };
    const r = p.session.restore(snap, `Restore version ${ctx.args.id}`, 'cli');
    p.close();
    return { revision: r.revision, restored: ctx.args.id };
  },
  human: (r) => (r.dryRun ? `Dry run: would restore ${r.id}` : `Restored ${r.restored} (revision ${r.revision})`),
});

command({
  path: ['versions', 'compare'],
  summary: 'Compare a saved version with the current project: scenes, clips, instances, character versions and assets that differ.',
  args: [{ name: 'id', description: 'Version id', positional: true, required: true }],
  run: (ctx) => {
    localOnly(ctx, 'Comparing versions');
    const p = openProject(ctx);
    return compareStates(p.store.loadVersion(String(ctx.args.id)), p.state);
  },
  human: (r) =>
    r.identical
      ? 'No differences.'
      : [
          ...(r.project.length ? [`project: ${r.project.join(', ')}`] : []),
          ...r.scenes.map((s: any) => `${s.change.padEnd(8)} ${s.name}${s.clips ? `  clips +${s.clips.added} −${s.clips.removed} ~${s.clips.changed}` : ''}${(s.versions ?? []).map((v: any) => `\n           ${v.instance}: ${v.from} → ${v.to}`).join('')}`),
          ...(r.assets.added.length ? [`assets added: ${r.assets.added.join(', ')}`] : []),
          ...(r.assets.removed.length ? [`assets removed: ${r.assets.removed.join(', ')}`] : []),
        ].join('\n'),
});

/* ------------------------------------------------------------------ discoverability (FR-CLI-03) */

command({
  path: ['schema'],
  summary: 'Print the JSON Schema of a file format or payload.',
  args: [{ name: 'type', description: `One of: ${Object.keys(schemas).join(', ')}`, positional: true }],
  run: (ctx) => {
    if (!ctx.args.type) return { types: Object.keys(schemas) };
    const s = jsonSchema(String(ctx.args.type));
    if (!s) throw new FrameError('NOT_FOUND', `Unknown schema ${ctx.args.type}`, { types: Object.keys(schemas) });
    return s;
  },
  human: (r) => JSON.stringify(r, null, 2),
});

command({
  path: ['describe'],
  summary: 'Machine-readable reference of CLI commands and engine commands (names, arguments, types, examples).',
  args: [],
  run: () => ({
    cli: commands.map((c) => ({ command: c.path.join(' '), summary: c.summary, mutating: c.mutating, args: c.args, examples: c.examples })),
    engine: describeCommands(),
    exitCodes: { 0: 'success', 1: 'usage error', 2: 'validation failed', 3: 'revision conflict', 4: 'not found', 5: 'voice worker unavailable', 6: 'render/export failed', 7: 'cancelled', 8: 'permission or consent required', 10: 'internal error' },
  }),
  human: (r) => JSON.stringify(r, null, 2),
});

/* ------------------------------------------------------------------ script view (FR-PRJ-04, read side) */

command({
  path: ['script', 'import'],
  summary: 'Add lines to a scene from a script file: "NAME: line" per line, or Fountain. Speakers match the scene\'s characters by name.',
  mutating: true,
  args: [
    { name: 'scene', description: 'Scene id or name', positional: true, required: true },
    { name: 'file', description: 'Script file (.txt or .fountain)', positional: true, required: true },
  ],
  run: async (ctx) => {
    const { state } = await readProject(ctx);
    const sc = Object.values(state.scenes).find((x) => x.id === ctx.args.scene || x.name === ctx.args.scene);
    if (!sc) throw new FrameError('NOT_FOUND', `Scene ${String(ctx.args.scene)} not found`);
    const text = fs.readFileSync(path.resolve(ctx.io.cwd, String(ctx.args.file)), 'utf8');
    const r = scriptImportCommands(state, sc.id, parseScript(text));
    if (!r.lines) throw new FrameError('VALIDATION_FAILED', r.unknown.length ? `No character in this scene is called ${r.unknown.join(', ')}` : 'No dialogue found');
    const res = await mutate(ctx, r.commands, `Import script (${r.lines} lines)`);
    const { state: _s, ...rest } = res as typeof res & { state?: unknown };
    return { ...rest, lines: r.lines, unknown: r.unknown };
  },
  human: (r) => `${r.dryRun ? 'Dry run: ' : ''}Imported ${r.lines} lines${r.unknown.length ? ` (no character for: ${r.unknown.join(', ')})` : ''}`,
});

command({
  path: ['script'],
  summary: 'Print every line in scene order with speaker, text, delivery and take status.',
  args: [{ name: 'format', description: 'text (default) or fountain' }],
  run: (ctx) => {
    localOnly(ctx, 'Running a script');
    const p = openProject(ctx);
    const s = p.state;
    const scenes = s.project.episodes.flatMap((e) => (s.episodes[e]?.scenes ?? []).map((id) => s.scenes[id]!).filter(Boolean));
    return {
      scenes: scenes.map((sc) => ({
        id: sc.id,
        name: sc.name,
        lines: sc.clips.filter((c) => c.line).sort((a, b) => a.start - b.start).map((c) => ({
          id: c.id,
          at: formatTimecode(c.start),
          speaker: sc.instances.find((i) => i.id === c.line!.speaker)?.name ?? '?',
          text: c.line!.text,
          delivery: c.line!.delivery,
          take: lineTakeState(s, c),
        })),
      })),
      format: ctx.args.format ?? 'text',
      ...(ctx.args.format === 'fountain' ? { fountain: scriptText(s, 'fountain') } : {}),
    };
  },
  human: (r) =>
    r.format === 'fountain'
      ? r.fountain
      : r.scenes.map((sc: any) => [sc.name, ...sc.lines.map((l: any) => `  ${l.at}  ${l.speaker}: ${l.text}  [${l.take}]`)].join('\n')).join('\n\n'),
});
