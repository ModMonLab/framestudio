/** `frame render …` (FR-CLI-02, FR-RND-01..10): the same evaluation and renderer as the Studio, without a browser. */
import fs from 'node:fs';
import path from 'node:path';
import { evaluateFrame, parseTime, type ProjectState } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import { createNodeRenderer } from '@frame/render/node';
import { FrameError, type AssetManifest } from '@frame/schema';
import { renderExport, writeFileAtomic, type OutputPreset, type RenderProgress } from '@frame/io';
import { command, type CommandContext } from './framework.js';
import { contentDir } from './env.js';
import { openProject } from './project-commands.js';

function library() {
  const content = contentDir();
  const lib = bundledLibrary(content);
  return { content, lib, styles: loadStyles(content), assets: { manifest: (ref: string) => lib.manifest(ref) as AssetManifest | undefined } };
}

function sceneArg(state: ProjectState, v: unknown): string {
  const s = String(v);
  if (state.scenes[s]) return s;
  const byName = Object.values(state.scenes).filter((x) => x.name.toLowerCase() === s.toLowerCase());
  if (byName.length === 1) return byName[0]!.id;
  throw new FrameError('NOT_FOUND', `Scene ${s} not found`, { scenes: Object.values(state.scenes).map((x) => ({ id: x.id, name: x.name })) }, 'Use `frame scene list` to see scene IDs.');
}

function firstScene(state: ProjectState): string {
  const ep = state.episodes[state.project.episodes[0] ?? ''];
  const id = ep?.scenes[0];
  if (!id) throw new FrameError('NOT_FOUND', 'The project has no scenes');
  return id;
}

function presetFor(ref: string): { id: string; preset: OutputPreset } {
  const { lib } = library();
  const id = ref.includes('@') ? ref : `${ref}@1`;
  const m = lib.manifest(id);
  const preset = (m?.data as { output?: OutputPreset } | undefined)?.output;
  if (!preset) {
    const all = lib.all().filter((e) => e.manifest.kind === 'out').map((e) => e.manifest.id);
    throw new FrameError('NOT_FOUND', `Output preset ${ref} not found`, { presets: all }, 'Run `frame render presets` to list them.');
  }
  return { id, preset };
}

const progressLine = (ctx: CommandContext) => {
  let last = 0;
  return (p: RenderProgress) => {
    const t = Date.now();
    if (p.phase === 'Rendering' && p.frame !== p.frames && t - last < 500) return;
    last = t;
    ctx.log(p.phase === 'Rendering' ? `Rendering frame ${p.frame}/${p.frames} (${(p.fps ?? 0).toFixed(1)} fps)` : `${p.phase}…`);
  };
};

command({
  path: ['render', 'presets'],
  summary: 'List output presets (Catalog R1).',
  args: [],
  run: () => {
    const { lib } = library();
    return { presets: lib.all().filter((e) => e.manifest.kind === 'out').map((e) => ({ id: e.manifest.id, name: e.manifest.name, ...((e.manifest.data as { output: OutputPreset }).output) })) };
  },
  human: (r) => r.presets.map((p: any) => `${p.id.padEnd(32)} ${p.name.padEnd(22)} ${[p.width && `${p.width}×${p.height}`, p.container, p.video, p.audio].filter(Boolean).join(' · ')}`).join('\n'),
});

command({
  path: ['render', 'frame'],
  summary: 'Render one frame of a scene to PNG with the export renderer.',
  args: [
    { name: 'scene', description: 'Scene ID or name (default: first scene)' },
    { name: 'at', description: 'Time: seconds (3.5), mm:ss, or frames (72f)', required: true },
    { name: 'out', description: 'Output PNG path', required: true },
    { name: 'width', description: 'Width in pixels (default: project output)', type: 'number' },
    { name: 'height', description: 'Height in pixels (default: project output)', type: 'number' },
    { name: 'aspect', description: 'Aspect key for per-ratio framing, e.g. 9:16' },
    { name: 'family', description: 'Preview the other style family: flat or illustrated' },
    { name: 'captions', description: 'Burn in captions', type: 'boolean' },
  ],
  examples: ['frame render frame --scene "Cold open" --at 2.5 --out shot.png --width 960 --height 540'],
  run: async (ctx) => {
    const p = openProject(ctx);
    const state = p.state;
    const scene = ctx.args.scene ? sceneArg(state, ctx.args.scene) : firstScene(state);
    const t = parseTime(String(ctx.args.at), state.project.frameRate);
    const sc = state.scenes[scene]!;
    if (t < 0 || t >= sc.duration) throw new FrameError('VALIDATION_FAILED', `--at is outside the scene (0 to ${(sc.duration / 48000).toFixed(2)} s)`);
    const width = (ctx.args.width as number | undefined) ?? state.project.output.width;
    const height = (ctx.args.height as number | undefined) ?? state.project.output.height;
    const family = ctx.args.family as 'flat' | 'illustrated' | undefined;
    if (family && family !== 'flat' && family !== 'illustrated') throw new FrameError('USAGE', '--family must be flat or illustrated');
    const out = path.resolve(ctx.io.cwd, String(ctx.args.out));
    if (ctx.opts.dryRun) return { dryRun: true, scene, at: t, out, width, height };
    const { content, styles, assets } = library();
    const r = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
    try {
      const ev = evaluateFrame(state, scene, t, { assets, styles, width, height, ...(ctx.args.aspect ? { aspect: String(ctx.args.aspect) } : {}), captions: ctx.args.captions === true, ...(family ? { family } : {}) });
      fs.mkdirSync(path.dirname(out), { recursive: true });
      writeFileAtomic(out, r.png(ev.frame));
      return { out, scene, at: t, width, height, camera: ev.camera.name, issues: ev.issues, revision: p.session.revision };
    } finally {
      r.dispose();
    }
  },
  human: (r) => (r.dryRun ? `Dry run: would write ${r.out}` : `Wrote ${r.out} (${r.width}×${r.height}, camera ${r.camera})${r.issues.length ? `\n${r.issues.map((i: string) => `warning: ${i}`).join('\n')}` : ''}`),
});

command({
  path: ['render', 'video'],
  summary: 'Export a scene or episode with a preset: video, audio, subtitles, stems and a render report.',
  args: [
    { name: 'scene', description: 'Scene ID or name' },
    { name: 'episode', description: 'Episode ID (all its scenes in order)' },
    { name: 'preset', description: 'Output preset (default: the project output preset)' },
    { name: 'out', description: 'Output file (default: <project>/renders/<name>-<time>.<ext>)' },
    { name: 'from', description: 'Range start within a single scene' },
    { name: 'to', description: 'Range end within a single scene' },
    { name: 'width', description: 'Override width', type: 'number' },
    { name: 'height', description: 'Override height', type: 'number' },
    { name: 'aspect', description: 'Aspect key for per-ratio framing (default: the preset aspect)' },
    { name: 'family', description: 'Render in the other style family' },
    { name: 'no-captions', description: 'Do not burn in captions', type: 'boolean' },
    { name: 'subtitles', description: 'Subtitle files to write: srt,vtt', type: 'list' },
    { name: 'stems', description: 'Also write dialogue/music/ambience/SFX stems', type: 'boolean' },
    { name: 'loudness', description: 'Normalise to this integrated loudness (LUFS), e.g. -14', type: 'number' },
    { name: 'crf', description: 'Video quality (lower is better)', type: 'number' },
    { name: 'force', description: 'Export even if validation finds blocking problems (diagnostics only)', type: 'boolean' },
  ],
  examples: ['frame render video --scene "Cold open" --out cold-open.mp4', 'frame render video --episode <episode-id> --preset <id from `frame render presets`> --stems'],
  run: async (ctx) => {
    const p = openProject(ctx);
    // Snapshot the revision at start; later edits do not affect this export (FR-RND-05).
    const state = p.state;
    const revision = p.session.revision;
    let scenes: string[];
    if (ctx.args.episode) {
      const ep = state.episodes[String(ctx.args.episode)];
      if (!ep) throw new FrameError('NOT_FOUND', `Episode ${ctx.args.episode} not found`);
      scenes = [...ep.scenes];
    } else scenes = [ctx.args.scene ? sceneArg(state, ctx.args.scene) : firstScene(state)];
    const { id: presetId, preset: base } = presetFor(String(ctx.args.preset ?? state.project.output.preset));
    const preset: OutputPreset = {
      ...base,
      ...(ctx.args.subtitles ? { subtitles: (ctx.args.subtitles as string[]).filter((s): s is 'srt' | 'vtt' => s === 'srt' || s === 'vtt') } : {}),
      ...(ctx.args.stems ? { stems: true } : {}),
      ...(ctx.args.loudness !== undefined ? { loudness: ctx.args.loudness as number } : {}),
    };
    const width = (ctx.args.width as number | undefined) ?? base.width ?? state.project.output.width;
    const height = (ctx.args.height as number | undefined) ?? base.height ?? state.project.output.height;
    const range = scenes.length === 1 && (ctx.args.from !== undefined || ctx.args.to !== undefined)
      ? { from: ctx.args.from !== undefined ? parseTime(String(ctx.args.from), state.project.frameRate) : 0, to: ctx.args.to !== undefined ? parseTime(String(ctx.args.to), state.project.frameRate) : state.scenes[scenes[0]!]!.duration }
      : undefined;
    const ext = preset.container === 'png' ? '' : preset.container === 'none' ? '.srt' : `.${preset.container}`;
    const label = scenes.length === 1 ? state.scenes[scenes[0]!]!.name : state.episodes[String(ctx.args.episode)]!.name;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const renderDir = path.resolve(p.store.root, state.project.renderDir ?? 'renders');
    const out = ctx.args.out ? path.resolve(ctx.io.cwd, String(ctx.args.out)) : path.join(renderDir, `${label.replace(/[^A-Za-z0-9_-]+/g, '-')}-${stamp}${ext}`);
    const family = ctx.args.family as 'flat' | 'illustrated' | undefined;
    if (family && family !== 'flat' && family !== 'illustrated') throw new FrameError('USAGE', '--family must be flat or illustrated');
    const plan = { scenes, preset: presetId, out, width, height, range, revision };
    if (ctx.opts.dryRun) return { dryRun: true, ...plan };
    const { content, lib, styles, assets } = library();
    const renderer = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
    const ac = new AbortController();
    const onSig = () => ac.abort();
    process.once('SIGINT', onSig);
    try {
      const report = await renderExport({
        state, revision, scenes, ...(range ? { range } : {}), preset, presetId, width, height,
        aspect: (ctx.args.aspect as string | undefined) ?? base.aspect,
        burnInCaptions: ctx.args['no-captions'] !== true && state.project.captions.enabled && state.project.captions.burnIn,
        ...(family ? { family } : {}),
        ...(ctx.args.crf !== undefined ? { quality: { crf: ctx.args.crf as number } } : {}),
        out, assets, assetExists: (ref) => lib.has(ref), mediaExists: (h) => p.store.verifyMedia(h), styles, renderer,
        resolveAudio: (src) => (src.kind === 'media' ? p.store.findMedia(src.hash) : undefined),
        force: ctx.args.force === true,
        onProgress: progressLine(ctx),
        signal: ac.signal,
      });
      if (report.status !== 'completed') throw new FrameError((report.error?.code ?? 'RENDER_FAILED') as 'RENDER_FAILED', report.error?.message ?? 'Export failed', report);
      return report;
    } finally {
      process.off('SIGINT', onSig);
      renderer.dispose();
    }
  },
  human: (r) => (r.dryRun ? `Dry run: would export ${r.scenes.length} scene(s) with ${r.preset} to ${r.out}` : [`Exported ${r.output}`, `${r.durationS.toFixed(2)} s, ${r.frames} frames, ${r.settings.width}×${r.settings.height}`, r.loudness ? `Loudness ${r.loudness.integrated ?? '—'} LUFS, peak ${r.loudness.samplePeakDb ?? '—'} dBFS` : '', r.fixtureAudio ? 'Contains fixture audio — not real speech.' : '', ...r.warnings.map((w: string) => `warning: ${w}`)].filter(Boolean).join('\n')),
});
