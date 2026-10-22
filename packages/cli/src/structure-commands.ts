import { FrameError } from '@frame/schema';
import { formatTimecode, ticksToSeconds } from '@frame/core';
import { command } from './framework.js';
import { mutate, readProject } from './project-commands.js';

const human = (r: { dryRun: boolean; revision: number; label: string; commands: { params: Record<string, unknown> }[] }) =>
  r.dryRun ? `Dry run: "${r.label}" — nothing was written.` : `${r.label} (revision ${r.revision})${r.commands[0]?.params.id ? `  ${String(r.commands[0].params.id)}` : ''}`;

function out<T extends { state?: unknown }>(r: T) {
  const { state: _s, ...rest } = r;
  return rest;
}

/* ------------------------------------------------------------------ episodes */

command({
  path: ['episode', 'add'], summary: 'Add an episode.', mutating: true,
  args: [{ name: 'name', description: 'Episode name', positional: true, required: true }, { name: 'index', description: 'Position (0-based)', type: 'number' }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'episode.add', params: { name: ctx.args.name, ...(ctx.args.index !== undefined ? { index: ctx.args.index } : {}) } }])),
  human,
});

command({
  path: ['episode', 'list'], summary: 'List episodes.', args: [],
  run: async (ctx) => {
    const s = (await readProject(ctx)).state;
    return { episodes: s.project.episodes.map((id) => ({ id, name: s.episodes[id]?.name, scenes: s.episodes[id]?.scenes.length ?? 0 })) };
  },
  human: (r) => r.episodes.map((e: any) => `${e.id}  ${e.name}  (${e.scenes} scenes)`).join('\n'),
});

command({
  path: ['episode', 'rename'], summary: 'Rename an episode.', mutating: true,
  args: [{ name: 'id', description: 'Episode id', positional: true, required: true }, { name: 'name', description: 'New name', positional: true, required: true }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'episode.rename', params: { id: ctx.args.id, name: ctx.args.name } }])),
  human,
});

command({
  path: ['episode', 'move'], summary: 'Move an episode to a position.', mutating: true,
  args: [{ name: 'id', description: 'Episode id', positional: true, required: true }, { name: 'index', description: 'New position (0-based)', positional: true, required: true, type: 'number' }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'episode.move', params: { id: ctx.args.id, index: ctx.args.index } }])),
  human,
});

command({
  path: ['episode', 'duplicate'], summary: 'Duplicate an episode (new IDs, same character versions).', mutating: true,
  args: [{ name: 'id', description: 'Episode id', positional: true, required: true }, { name: 'name', description: 'Name of the copy' }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'episode.duplicate', params: { id: ctx.args.id, ...(ctx.args.name ? { name: ctx.args.name } : {}) } }])),
  human,
});

command({
  path: ['episode', 'delete'], summary: 'Delete an episode and its scenes.', mutating: true,
  args: [{ name: 'id', description: 'Episode id', positional: true, required: true }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'episode.delete', params: { id: ctx.args.id } }])),
  human,
});

/* ------------------------------------------------------------------ scenes */

command({
  path: ['scene', 'add'], summary: 'Add a scene to an episode.', mutating: true,
  args: [
    { name: 'name', description: 'Scene name', positional: true, required: true },
    { name: 'episode', description: 'Episode id (default: first episode)' },
    { name: 'duration', description: 'Duration in seconds', type: 'number' },
    { name: 'index', description: 'Position within the episode', type: 'number' },
  ],
  examples: ['frame scene add "Cold open" --duration 20'],
  run: async (ctx) => {
    const episode = (ctx.args.episode as string | undefined) ?? (await readProject(ctx)).state.project.episodes[0];
    return out(await mutate(ctx, [{ name: 'scene.add', params: { episode, name: ctx.args.name, ...(ctx.args.duration ? { durationS: ctx.args.duration } : {}), ...(ctx.args.index !== undefined ? { index: ctx.args.index } : {}) } }]));
  },
  human,
});

command({
  path: ['scene', 'list'], summary: 'List scenes in order.', args: [{ name: 'episode', description: 'Only this episode' }],
  run: async (ctx) => {
    const s = (await readProject(ctx)).state;
    const eps = ctx.args.episode ? [String(ctx.args.episode)] : s.project.episodes;
    return {
      scenes: eps.flatMap((e) => (s.episodes[e]?.scenes ?? []).map((id) => {
        const sc = s.scenes[id]!;
        return { id, episode: e, name: sc.name, durationS: ticksToSeconds(sc.duration), instances: sc.instances.length, clips: sc.clips.length };
      })),
    };
  },
  human: (r) => r.scenes.map((x: any) => `${x.id}  ${x.name}  ${x.durationS.toFixed(1)} s  ${x.instances} objects  ${x.clips} clips`).join('\n'),
});

command({
  path: ['scene', 'show'], summary: 'Show a scene: stage, instances, cameras, tracks and clips.',
  args: [{ name: 'id', description: 'Scene id', positional: true, required: true }],
  run: async (ctx) => {
    const sc = (await readProject(ctx)).state.scenes[String(ctx.args.id)];
    if (!sc) throw new FrameError('NOT_FOUND', `Scene ${ctx.args.id} not found`);
    return sc;
  },
  human: (sc) => [
    `${sc.name}  ${sc.id}  ${formatTimecode(sc.duration)}`,
    'Objects:', ...sc.instances.map((i: any) => `  ${i.id}  ${i.kind.padEnd(9)} ${i.name}  ${i.asset ?? ''}`),
    'Cameras:', ...sc.cameras.map((c: any) => `  ${c.id}  ${c.name}${c.id === sc.defaultCamera ? ' (default)' : ''}`),
    'Clips:', ...[...sc.clips].sort((a: any, b: any) => a.start - b.start).map((c: any) => `  ${formatTimecode(c.start)}–${formatTimecode(c.end)}  ${c.id}  ${c.line ? `“${c.line.text}”` : (c.asset ?? c.name ?? '')}`),
  ].join('\n'),
});

command({
  path: ['scene', 'rename'], summary: 'Rename a scene.', mutating: true,
  args: [{ name: 'id', description: 'Scene id', positional: true, required: true }, { name: 'name', description: 'New name', positional: true, required: true }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'scene.rename', params: { id: ctx.args.id, name: ctx.args.name } }])),
  human,
});

command({
  path: ['scene', 'move'], summary: 'Move a scene to a position (optionally in another episode).', mutating: true,
  args: [{ name: 'id', description: 'Scene id', positional: true, required: true }, { name: 'index', description: 'New position', positional: true, required: true, type: 'number' }, { name: 'episode', description: 'Target episode' }],
  run: async (ctx) => {
    const s = (await readProject(ctx)).state;
    return out(await mutate(ctx, [{ name: 'scene.move', params: { id: ctx.args.id, index: ctx.args.index, episode: ctx.args.episode ?? s.sceneEpisode[String(ctx.args.id)] ?? '' } }]));
  },
  human,
});

command({
  path: ['scene', 'duplicate'], summary: 'Duplicate a scene.', mutating: true,
  args: [{ name: 'id', description: 'Scene id', positional: true, required: true }, { name: 'name', description: 'Name of the copy' }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'scene.duplicate', params: { id: ctx.args.id, ...(ctx.args.name ? { name: ctx.args.name } : {}) } }])),
  human,
});

command({
  path: ['scene', 'delete'], summary: 'Delete a scene.', mutating: true,
  args: [{ name: 'id', description: 'Scene id', positional: true, required: true }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'scene.delete', params: { id: ctx.args.id } }])),
  human,
});

command({
  path: ['scene', 'duration'], summary: 'Set scene duration in seconds (shortening past clips needs --truncate).', mutating: true,
  args: [{ name: 'id', description: 'Scene id', positional: true, required: true }, { name: 'seconds', description: 'Duration', positional: true, required: true, type: 'number' }, { name: 'truncate', description: 'Allow ending before existing clips (they are kept and flagged)', type: 'boolean' }],
  run: async (ctx) => out(await mutate(ctx, [{ name: 'scene.setDuration', params: { id: ctx.args.id, durationS: ctx.args.seconds, ...(ctx.args.truncate ? { allowTruncate: true } : {}) } }])),
  human,
});
