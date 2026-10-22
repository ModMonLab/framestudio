/** `frame recipe apply|save|list`, `frame scene coverage`, `frame camera frame` (FR-RCP, FR-CAM-01/04/05, FR-CLI-05). */
import { FrameError } from '@frame/schema';
import { recipeFromClips, secondsToTicks } from '@frame/core';
import { autoCoverageForLibrary, frameCameraCommand, recipeCommandsForLibrary } from '@frame/io';
import { libraryFor, loadStyles } from '@frame/assets/node';
import { randomUUID } from 'node:crypto';
import { command } from './framework.js';
import { mutate, readProject } from './project-commands.js';
import { contentDir, libraryDefaults, userLibraryDir } from './env.js';
import type { CommandContext } from './framework.js';

const human = (r: { dryRun: boolean; revision: number; label: string; warnings?: string[] }) =>
  `${r.dryRun ? `Dry run: "${r.label}" — nothing was written.` : `${r.label} (revision ${r.revision})`}${r.warnings?.length ? `\n${r.warnings.map((w) => `  warning: ${w}`).join('\n')}` : ''}`;
const out = <T extends { state?: unknown }>(r: T) => {
  const { state: _s, ...rest } = r;
  return rest;
};

async function setup(ctx: CommandContext) {
  const { state } = await readProject(ctx);
  const sceneId = String(ctx.args.scene);
  if (!state.scenes[sceneId]) throw new FrameError('NOT_FOUND', `Scene ${sceneId} not found`);
  const lib = libraryFor({ contentDir: contentDir(), userDir: userLibraryDir(ctx.io.env), projectAssets: state.assets });
  return { state, sceneId, o: { lib, styles: loadStyles(contentDir()) } };
}

const pairs = (v: unknown) => Object.fromEntries(String(v ?? '').split(',').filter(Boolean).map((kv) => kv.split('=') as [string, string]));

command({
  path: ['recipe', 'list'], summary: 'List performance and shot recipes with their roles.', args: [],
  run: async (ctx) => {
    const lib = libraryFor({ contentDir: contentDir(), userDir: userLibraryDir(ctx.io.env) });
    const items = [...lib.byKind('rcp'), ...lib.byKind('cam')].filter((e) => (e.manifest.data as { recipe?: unknown }).recipe).map((e) => {
      const r = (e.manifest.data as { recipe: { roles: { key: string }[]; anchor?: { role: string } } }).recipe;
      return { ref: `${e.manifest.id}@${e.manifest.version}`, name: e.manifest.name, roles: r.roles.map((x) => x.key), anchoredTo: r.anchor?.role ?? null };
    });
    return { recipes: items };
  },
  human: (r) => r.recipes.map((x: any) => `${x.ref}  ${x.name}  roles: ${x.roles.join(', ') || '—'}${x.anchoredTo ? `  (on a line by ${x.anchoredTo})` : ''}`).join('\n'),
});

command({
  path: ['recipe', 'apply'], summary: 'Apply a recipe: expands into grouped, editable clips (FR-RCP-01/02).', mutating: true,
  args: [
    { name: 'scene', description: 'Scene id', positional: true, required: true },
    { name: 'ref', description: 'Recipe ref (see `frame recipe list`)', positional: true, required: true },
    { name: 'roles', description: 'Role assignments: speaker=ins_…,listener=ins_…', required: true },
    { name: 'at', description: 'Start time in seconds (time-anchored recipes)', type: 'number' },
    { name: 'line', description: 'Line clip id (recipes anchored to a line)' },
  ],
  run: async (ctx) => {
    const { state, sceneId, o } = await setup(ctx);
    const ex = recipeCommandsForLibrary(state, sceneId, String(ctx.args.ref), { roles: pairs(ctx.args.roles), ...(ctx.args.at !== undefined ? { at: secondsToTicks(Number(ctx.args.at)) } : {}), ...(ctx.args.line ? { line: String(ctx.args.line) } : {}) }, o);
    if (!ex.commands.length) throw new FrameError('USAGE', `Nothing to add: ${ex.warnings.join('; ')}`);
    return { ...out(await mutate(ctx, ex.commands, `Apply ${o.lib.manifest(String(ctx.args.ref))?.name ?? 'recipe'}`)), group: ex.group, warnings: ex.warnings };
  },
  human,
});

command({
  path: ['recipe', 'save'], summary: 'Save clips as a project recipe with role placeholders (FR-RCP-04).', mutating: true,
  args: [
    { name: 'scene', description: 'Scene id', positional: true, required: true },
    { name: 'name', description: 'Recipe name', required: true },
    { name: 'clips', description: 'Clip ids', positional: true, variadic: true, required: true },
  ],
  run: async (ctx) => {
    const { state, sceneId } = await setup(ctx);
    let data;
    try {
      data = recipeFromClips(state, sceneId, ctx.args.clips as string[]);
    } catch (e) {
      throw new FrameError('USAGE', (e as Error).message);
    }
    const id = `user.${randomUUID()}`;
    const manifest = {
      schemaVersion: 1, id, version: 1, kind: 'rcp', name: String(ctx.args.name), category: 'Performance recipes', group: 'My recipes', tags: ['recipe', 'mine'], synonyms: [], families: ['flat', 'illustrated'], views: [], viewExemptions: {}, anchors: {}, capabilities: [], parameters: [], dependencies: [], layering: {}, previews: {},
      license: { id: 'LicenseRef-User-Owned', redistributable: true, commercialUse: true }, provenance: { method: 'authored', author: 'cli', date: new Date().toISOString().slice(0, 10), notes: 'Saved from a selection of clips (FR-RCP-04).' }, data: { recipe: data },
    };
    return { ...out(await mutate(ctx, [{ name: 'asset.addLocal', params: { manifest } }], `Save recipe ${String(ctx.args.name)}`)), ref: `${id}@1`, roles: data.roles.map((r) => r.key) };
  },
  human: (r) => `${human(r)}\n  ${r.ref}  roles: ${r.roles.join(', ')}`,
});

command({
  path: ['scene', 'coverage'], summary: 'Generate editable shots from the dialogue: establishing wide, speaker close-ups, reactions (FR-CAM-05).', mutating: true,
  args: [{ name: 'scene', description: 'Scene id', positional: true, required: true }],
  run: async (ctx) => {
    const { state, sceneId, o } = await setup(ctx);
    const framings = libraryDefaults().coverage;
    if (!framings) throw new FrameError('NOT_FOUND', 'The content library defines no coverage framings');
    const cmds = autoCoverageForLibrary(state, sceneId, { ...o, framings });
    if (!cmds.length) throw new FrameError('USAGE', 'Nothing to cover: the scene has no lines yet');
    return out(await mutate(ctx, cmds, 'Automatic coverage'));
  },
  human,
});

command({
  path: ['camera', 'frame'], summary: 'Add (or reframe) a camera with a framing preset on subjects (FR-CAM-01).', mutating: true,
  args: [
    { name: 'scene', description: 'Scene id', positional: true, required: true },
    { name: 'preset', description: 'Framing preset ref (a camera framing from the library)', positional: true, required: true },
    { name: 'subjects', description: 'Instance ids, comma separated' },
    { name: 'camera', description: 'Reframe this camera instead of adding one' },
    { name: 'at', description: 'Time in seconds to frame at (default 0)', type: 'number' },
  ],
  run: async (ctx) => {
    const { state, sceneId, o } = await setup(ctx);
    const cmd = frameCameraCommand(state, sceneId, String(ctx.args.preset), String(ctx.args.subjects ?? '').split(',').filter(Boolean), secondsToTicks(Number(ctx.args.at ?? 0)), { ...o, ...(ctx.args.camera ? { camera: String(ctx.args.camera) } : {}) });
    return out(await mutate(ctx, [cmd], ctx.args.camera ? 'Reframe camera' : `Add ${String(cmd.params.name)}`));
  },
  human,
});
