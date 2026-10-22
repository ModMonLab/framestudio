/**
 * Export (FR-RND-01..10, SRS §6): validate → snapshot → evaluate and rasterise every frame with the one renderer →
 * offline audio mix → encode with ffmpeg → subtitles, stems and a render report. Used by the CLI and the server;
 * never depends on a browser window.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  evaluateFrame, scheduleSceneAudio, subtitleCues, toSrt, toVtt, validateProject, TICKS_PER_SECOND,
  type AssetResolver, type AudioPlan, type AudioSource, type ProjectState,
} from '@frame/core';
import type { FamilyStyle } from '@frame/rig';
import type { NodeRenderer } from '@frame/render/node';
import { FrameError, type Problem, type StyleFamily } from '@frame/schema';
import { encodeWav, master, mixPlan, MIX_RATE, type PcmAudio } from './audio.js';
import { ffmpegPath, ffmpegVersion } from './ffmpeg.js';
import { writeFileAtomic } from './fsutil.js';

export type VideoCodec = 'h264' | 'h265' | 'vp9' | 'prores4444' | 'gif' | 'png';
export type AudioCodec = 'aac' | 'opus' | 'pcm' | 'mp3';

/** Output preset data (Catalog R1 `out.*` manifests carry this as data.output). */
export interface OutputPreset {
  width?: number;
  height?: number;
  aspect?: string;
  container: 'mp4' | 'webm' | 'mov' | 'png' | 'wav' | 'mp3' | 'gif' | 'none';
  video?: VideoCodec;
  audio?: AudioCodec;
  alpha?: boolean;
  /** Integrated loudness target in LUFS (FR-SND-05). */
  loudness?: number;
  subtitles?: ('srt' | 'vtt')[];
  stems?: boolean;
  maxSeconds?: number;
}

export type RenderPhase = 'Validating' | 'Preparing' | 'Rendering' | 'Encoding' | 'Finalizing' | 'Completed' | 'Failed' | 'Cancelled';

export interface RenderProgress {
  phase: RenderPhase;
  frame?: number;
  frames?: number;
  fps?: number;
}

export interface RenderOptions {
  state: ProjectState;
  revision: number;
  /** Scenes laid end to end (one scene, or an episode's scenes). */
  scenes: string[];
  /** Range within a single scene, ticks [from, to). */
  range?: { from: number; to: number };
  preset: OutputPreset;
  presetId?: string;
  width: number;
  height: number;
  /** Aspect key for per-ratio camera framing. */
  aspect?: string;
  burnInCaptions: boolean;
  speakerLabels?: boolean;
  quality?: { crf?: number; videoBitrate?: string; audioBitrate?: string };
  family?: StyleFamily;
  out: string;
  assets: AssetResolver;
  assetExists: (ref: string) => boolean;
  mediaExists?: (hash: string) => boolean;
  styles: Record<StyleFamily, FamilyStyle>;
  renderer: NodeRenderer;
  resolveAudio: (src: AudioSource) => string | undefined;
  /** Allow export with blocking problems (never used by the Studio; CLI --force for diagnostics). */
  force?: boolean;
  onProgress?: (p: RenderProgress) => void;
  signal?: AbortSignal;
}

export interface RenderReport {
  status: 'completed' | 'failed' | 'cancelled';
  output: string | null;
  files: string[];
  project: { id: string; name: string; revision: number };
  scenes: string[];
  settings: { preset: string | null; width: number; height: number; fps: number; container: string; video: string | null; audio: string | null; captions: 'burned-in' | 'off'; family: StyleFamily };
  durationS: number;
  frames: number;
  encoder: string;
  loudness: { integrated: number | null; target: number | null; samplePeakDb: number | null; limiterReductionDb: number } | null;
  fixtureAudio: boolean;
  warnings: string[];
  problems: Problem[];
  timings: { validateS: number; renderS: number; encodeS: number; totalS: number; renderFps: number };
  createdAt: string;
  error?: { code: string; message: string };
}

const now = () => performance.now() / 1000;

interface Segment {
  scene: string;
  from: number;
  to: number;
}

function segments(o: RenderOptions): Segment[] {
  return o.scenes.map((id) => {
    const sc = o.state.scenes[id];
    if (!sc) throw new FrameError('NOT_FOUND', `Scene ${id} not found`);
    const from = o.scenes.length === 1 && o.range ? Math.max(0, o.range.from) : 0;
    const to = o.scenes.length === 1 && o.range ? Math.min(sc.duration, o.range.to) : sc.duration;
    if (to <= from) throw new FrameError('VALIDATION_FAILED', 'The render range is empty');
    return { scene: id, from, to };
  });
}

/** Concatenates per-scene audio plans into one timeline. */
function audioPlans(o: RenderOptions, segs: Segment[]): AudioPlan[] {
  return segs.map((s) => scheduleSceneAudio(o.state, o.state.scenes[s.scene]!, { from: s.from, to: s.to }));
}

function videoArgs(p: OutputPreset, q: RenderOptions['quality'] = {}): string[] {
  switch (p.video) {
    case 'h264':
      return ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', String(q.crf ?? 18), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', ...(p.container === 'mp4' ? ['-movflags', '+faststart'] : [])];
    case 'h265':
      return ['-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', String(q.crf ?? 22), '-tag:v', 'hvc1', '-movflags', '+faststart'];
    case 'vp9':
      return ['-c:v', 'libvpx-vp9', '-pix_fmt', p.alpha ? 'yuva420p' : 'yuv420p', '-b:v', q.videoBitrate ?? '0', '-crf', String(q.crf ?? 32), '-row-mt', '1'];
    case 'prores4444':
      return ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0'];
    case 'gif':
      return ['-filter_complex', '[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0'];
    default:
      return [];
  }
}

function audioArgs(p: OutputPreset, q: RenderOptions['quality'] = {}): string[] {
  switch (p.audio) {
    case 'aac':
      return ['-c:a', 'aac', '-b:a', q.audioBitrate ?? '192k'];
    case 'opus':
      return ['-c:a', 'libopus', '-b:a', q.audioBitrate ?? '160k'];
    case 'mp3':
      return ['-c:a', 'libmp3lame', '-b:a', q.audioBitrate ?? '192k'];
    case 'pcm':
      return ['-c:a', 'pcm_s16le'];
    default:
      return [];
  }
}

/** Renders a project range to files. Never mutates the project; the state passed in is the snapshot (FR-RND-05). */
export async function renderExport(o: RenderOptions): Promise<RenderReport> {
  const t0 = now();
  const fps = o.state.project.frameRate;
  const p = o.preset;
  const family = o.family ?? o.state.project.styleFamily;
  const report: RenderReport = {
    status: 'failed',
    output: null,
    files: [],
    project: { id: o.state.project.id, name: o.state.project.name, revision: o.revision },
    scenes: o.scenes,
    settings: { preset: o.presetId ?? null, width: o.width, height: o.height, fps, container: p.container, video: p.video ?? null, audio: p.audio ?? null, captions: o.burnInCaptions ? 'burned-in' : 'off', family },
    durationS: 0,
    frames: 0,
    encoder: '',
    loudness: null,
    fixtureAudio: false,
    warnings: [],
    problems: [],
    timings: { validateS: 0, renderS: 0, encodeS: 0, totalS: 0, renderFps: 0 },
    createdAt: new Date().toISOString(),
  };
  const progress = (x: RenderProgress) => o.onProgress?.(x);
  const checkCancel = () => {
    if (o.signal?.aborted) throw new FrameError('CANCELLED', 'The export was cancelled');
  };
  const tmpFiles: string[] = [];
  try {
    /* ---- Validating (FR-RND-08) */
    progress({ phase: 'Validating' });
    if (o.width % 2 || o.height % 2) {
      if (p.video === 'h264' || p.video === 'h265') throw new FrameError('VALIDATION_FAILED', `H.264/H.265 need even dimensions; ${o.width}×${o.height} is not supported`);
    }
    const problems = validateProject(o.state, { assetExists: o.assetExists, manifest: (r: string) => o.assets.manifest(r), ...(o.mediaExists ? { mediaExists: o.mediaExists } : {}) }).filter((pr) => !pr.scene || o.scenes.includes(pr.scene));
    report.problems = problems;
    const segs = segments(o);
    const plans = audioPlans(o, segs);
    for (const pl of plans) for (const ev of pl.events) if (ev.source.kind === 'media' && !o.resolveAudio(ev.source)) problems.push({ severity: 'error', code: 'MEDIA_MISSING', message: `Audio media ${ev.source.hash.slice(0, 15)}… is missing or its hash does not match.`, blocksExport: true });
    const blocking = problems.filter((pr) => pr.blocksExport && pr.severity === 'error');
    if (blocking.length && !o.force) throw new FrameError('VALIDATION_FAILED', `Export blocked: ${blocking.map((b) => b.message).join(' ')}`, { problems: blocking });
    report.timings.validateS = now() - t0;
    checkCancel();

    /* ---- Preparing: frame list and audio */
    progress({ phase: 'Preparing' });
    const frameTimes: { scene: string; t: number }[] = [];
    for (const s of segs) {
      const n = Math.round(((s.to - s.from) / TICKS_PER_SECOND) * fps);
      for (let i = 0; i < n; i++) frameTimes.push({ scene: s.scene, t: s.from + Math.round((i * TICKS_PER_SECOND) / fps) });
    }
    if (p.maxSeconds && frameTimes.length / fps > p.maxSeconds) throw new FrameError('VALIDATION_FAILED', `This preset is limited to ${p.maxSeconds} s; the range is ${(frameTimes.length / fps).toFixed(1)} s`);
    report.frames = p.container === 'wav' || p.container === 'mp3' || p.container === 'none' ? 0 : frameTimes.length;
    report.durationS = frameTimes.length / fps;
    fs.mkdirSync(path.dirname(path.resolve(o.out)), { recursive: true });
    const base = o.out.replace(/\.[a-z0-9]+$/i, '');

    let wavFile: string | undefined;
    if (p.audio || p.stems || p.container === 'wav') {
      const parts: PcmAudio[] = [];
      const stemParts: Record<string, PcmAudio[]> = {};
      for (const [i, pl] of plans.entries()) {
        // Each scene's plan is mixed to exactly its frame count so audio and picture stay locked.
        const frames = Math.round(((segs[i]!.to - segs[i]!.from) / TICKS_PER_SECOND) * fps);
        const r = mixPlan({ ...pl, duration: frames / fps }, { resolve: o.resolveAudio, stems: p.stems });
        report.warnings.push(...r.warnings);
        if (r.fixture) report.fixtureAudio = true;
        parts.push(r.mix);
        for (const [bus, a] of Object.entries(r.stems ?? {})) (stemParts[bus] ??= []).push(a);
      }
      const mix = concat(parts);
      const m = master(mix, { ...(p.loudness !== undefined ? { targetLufs: p.loudness } : {}), ceilingDb: -1 });
      if (m.clipped) report.warnings.push('The mix clipped before limiting; lower music or SFX gain.');
      report.loudness = { integrated: fin(m.loudness.after), target: p.loudness ?? null, samplePeakDb: fin(m.loudness.samplePeakDb), limiterReductionDb: Math.round(m.limiterReductionDb * 100) / 100 };
      wavFile = p.container === 'wav' ? path.resolve(o.out) : `${base}.mix.tmp.wav`;
      if (p.container !== 'wav') tmpFiles.push(wavFile);
      writeFileAtomic(wavFile, encodeWav(mix));
      if (p.container === 'wav') report.files.push(wavFile);
      if (p.stems) {
        for (const [bus, list] of Object.entries(stemParts)) {
          const f = `${base}.stem-${bus}.wav`;
          // Stems include every scene; scenes without that bus contribute silence.
          const full = concat(plans.map((_pl, i) => list[i] ?? silence(Math.round(((segs[i]!.to - segs[i]!.from) / TICKS_PER_SECOND) * fps) / fps)));
          writeFileAtomic(f, encodeWav(full));
          report.files.push(f);
        }
      }
    }
    if (report.fixtureAudio) report.warnings.push('Contains fixture audio from the test worker — not real speech.');
    checkCancel();

    /* ---- Rendering + Encoding (frames are piped to ffmpeg as they are rendered) */
    const tr = now();
    const caps = { burn: o.burnInCaptions };
    const frameAt = (i: number) => {
      const ft = frameTimes[i]!;
      const ev = evaluateFrame(o.state, ft.scene, ft.t, { assets: o.assets, styles: o.styles, width: o.width, height: o.height, ...(o.aspect ? { aspect: o.aspect } : {}), captions: caps.burn, family, ...(p.alpha ? { background: '#00000000' } : {}) });
      for (const iss of ev.issues) if (!report.warnings.includes(iss)) report.warnings.push(iss);
      return ev.frame;
    };
    if (p.container === 'png') {
      const dir = path.resolve(o.out);
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < frameTimes.length; i++) {
        checkCancel();
        const f = path.join(dir, `frame-${String(i + 1).padStart(6, '0')}.png`);
        fs.writeFileSync(f, o.renderer.png(frameAt(i)));
        progress({ phase: 'Rendering', frame: i + 1, frames: frameTimes.length, fps: (i + 1) / Math.max(1e-6, now() - tr) });
      }
      report.files.push(dir);
      if (wavFile) {
        const w = path.join(dir, 'audio.wav');
        fs.renameSync(wavFile, w);
        report.files.push(w);
      }
      report.output = dir;
      report.encoder = 'png (CanvasKit)';
    } else if (p.video) {
      const ff = ffmpegPath();
      report.encoder = `${ffmpegVersion()} · ${p.video}${p.audio ? ` + ${p.audio}` : ''}`;
      const out = path.resolve(o.out);
      const tmpOut = `${out}.partial${path.extname(out)}`;
      tmpFiles.push(tmpOut);
      const args = ['-hide_banner', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-framerate', String(fps), '-i', 'pipe:0'];
      if (wavFile && p.audio) args.push('-i', wavFile);
      args.push(...videoArgs(p, o.quality));
      if (wavFile && p.audio) args.push(...audioArgs(p, o.quality), '-map', '0:v', '-map', '1:a');
      args.push('-r', String(fps), '-frames:v', String(frameTimes.length), '-metadata', `comment=Frame render of ${o.state.project.name} r${o.revision}`, tmpOut);
      const child = spawn(ff, args, { stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString()).length > 8000 && (stderr = stderr.slice(-8000)));
      const done = new Promise<number>((res) => child.on('close', (code) => res(code ?? -1)));
      // One shared "ffmpeg exited" promise: back-pressure waits race it instead of adding a listener per frame.
      const exited = done.then(() => {
        throw new FrameError('RENDER_FAILED', `ffmpeg stopped: ${stderr.trim().slice(-500)}`);
      });
      exited.catch(() => undefined);
      const onAbort = () => child.kill('SIGKILL');
      o.signal?.addEventListener('abort', onAbort);
      try {
        for (let i = 0; i < frameTimes.length; i++) {
          if (o.signal?.aborted) break;
          const rgba = o.renderer.rgba(frameAt(i));
          if (!child.stdin.write(rgba)) await Promise.race([new Promise<void>((res) => child.stdin.once('drain', res)), exited]);
          progress({ phase: 'Rendering', frame: i + 1, frames: frameTimes.length, fps: (i + 1) / Math.max(1e-6, now() - tr) });
        }
        child.stdin.end();
        report.timings.renderS = now() - tr;
        progress({ phase: 'Encoding' });
        const te = now();
        const code = await done;
        checkCancel();
        if (code !== 0) throw new FrameError('RENDER_FAILED', `ffmpeg failed (${code}): ${stderr.trim().slice(-500)}`);
        report.timings.encodeS = now() - te;
      } finally {
        o.signal?.removeEventListener('abort', onAbort);
      }
      fs.renameSync(tmpOut, out);
      report.output = out;
      report.files.unshift(out);
    } else if (p.container === 'mp3' && wavFile) {
      const out = path.resolve(o.out);
      await run(ffmpegPath(), ['-hide_banner', '-v', 'error', '-y', '-i', wavFile, ...audioArgs({ ...p, audio: 'mp3' }, o.quality), out]);
      report.output = out;
      report.files.unshift(out);
      report.encoder = `${ffmpegVersion()} · mp3`;
    } else if (p.container === 'wav') {
      report.output = wavFile ?? null;
      report.encoder = 'wav pcm_s16le';
    }
    if (!report.timings.renderS) report.timings.renderS = now() - tr;

    /* ---- Finalizing: subtitles and report */
    progress({ phase: 'Finalizing' });
    const subs = p.subtitles ?? [];
    if (subs.length) {
      const cues = subtitleCues(o.state, o.scenes, { speakerLabels: o.speakerLabels ?? o.state.project.captions.speakerLabels, ...(o.scenes.length === 1 && o.range ? { range: o.range } : {}) });
      for (const fmt of subs) {
        const f = `${base}.${fmt}`;
        writeFileAtomic(f, fmt === 'srt' ? toSrt(cues) : toVtt(cues));
        report.files.push(f);
      }
      if (!report.output && p.container === 'none') report.output = `${base}.${subs[0]}`;
    }
    report.status = 'completed';
    progress({ phase: 'Completed' });
  } catch (e) {
    const err = e instanceof FrameError ? e : new FrameError('RENDER_FAILED', (e as Error).message);
    report.status = err.code === 'CANCELLED' ? 'cancelled' : 'failed';
    report.error = { code: err.code, message: err.message };
    progress({ phase: report.status === 'cancelled' ? 'Cancelled' : 'Failed' });
  } finally {
    for (const f of tmpFiles) fs.rmSync(f, { force: true });
  }
  report.timings.totalS = now() - t0;
  report.timings.renderFps = report.frames && report.timings.renderS ? report.frames / report.timings.renderS : 0;
  for (const k of ['validateS', 'renderS', 'encodeS', 'totalS', 'renderFps'] as const) report.timings[k] = Math.round(report.timings[k] * 100) / 100;
  writeReport(o.out, report);
  return report;
}

function fin(x: number): number | null {
  return Number.isFinite(x) ? Math.round(x * 100) / 100 : null;
}

function silence(seconds: number): PcmAudio {
  const n = Math.round(seconds * MIX_RATE);
  return { sampleRate: MIX_RATE, channels: 2, data: [new Float32Array(n), new Float32Array(n)] };
}

function concat(parts: PcmAudio[]): PcmAudio {
  const n = parts.reduce((s, p) => s + (p.data[0]?.length ?? 0), 0);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let o = 0;
  for (const p of parts) {
    L.set(p.data[0]!, o);
    R.set(p.data[1] ?? p.data[0]!, o);
    o += p.data[0]!.length;
  }
  return { sampleRate: parts[0]?.sampleRate ?? MIX_RATE, channels: 2, data: [L, R] };
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const c = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    c.stderr.on('data', (d: Buffer) => (err += d.toString()));
    c.on('close', (code) => (code === 0 ? res() : rej(new FrameError('RENDER_FAILED', `ffmpeg failed: ${err.slice(-400)}`))));
  });
}

/** Writes `<out>.report.json` and a human summary `<out>.report.txt` (FR-RND-06). */
export function writeReport(out: string, r: RenderReport): void {
  const base = out.replace(/\.[a-z0-9]+$/i, '');
  writeFileAtomic(`${base}.report.json`, JSON.stringify(r, null, 2) + '\n');
  writeFileAtomic(`${base}.report.txt`, humanReport(r));
}

export function humanReport(r: RenderReport): string {
  const L: string[] = [];
  L.push(`Frame render report — ${r.status.toUpperCase()}`);
  L.push(`Project: ${r.project.name} (revision ${r.project.revision})`);
  if (r.output) L.push(`Output: ${r.output}`);
  L.push(`Settings: ${r.settings.width}×${r.settings.height} @ ${r.settings.fps} fps, ${r.settings.container}${r.settings.video ? ` ${r.settings.video}` : ''}${r.settings.audio ? ` + ${r.settings.audio}` : ''}, ${r.settings.family}, captions ${r.settings.captions}${r.settings.preset ? ` (${r.settings.preset})` : ''}`);
  L.push(`Duration: ${r.durationS.toFixed(2)} s, ${r.frames} frames`);
  if (r.encoder) L.push(`Encoder: ${r.encoder}`);
  if (r.loudness) L.push(`Loudness: ${r.loudness.integrated ?? '—'} LUFS integrated${r.loudness.target !== null ? ` (target ${r.loudness.target})` : ''}, peak ${r.loudness.samplePeakDb ?? '—'} dBFS, limiter ${r.loudness.limiterReductionDb} dB`);
  if (r.fixtureAudio) L.push('Audio: CONTAINS FIXTURE AUDIO — NOT REAL SPEECH');
  L.push(`Timings: validate ${r.timings.validateS} s, render ${r.timings.renderS} s (${r.timings.renderFps} fps), encode ${r.timings.encodeS} s, total ${r.timings.totalS} s`);
  if (r.files.length > 1) L.push(`Files:\n${r.files.map((f) => `  ${f}`).join('\n')}`);
  if (r.warnings.length) L.push(`Warnings:\n${r.warnings.map((w) => `  • ${w}`).join('\n')}`);
  if (r.error) L.push(`Error: ${r.error.code} — ${r.error.message}`);
  return L.join('\n') + '\n';
}
