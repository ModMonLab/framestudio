/** Locates ffmpeg (decision 0013): FRAME_FFMPEG, then the PATH. Encodes and probes media (FR-RND-06). */
import { spawnSync } from 'node:child_process';
import { FrameError } from '@frame/schema';

let cached: string | undefined;

export function ffmpegPath(): string {
  if (cached) return cached;
  const candidates = [process.env.FRAME_FFMPEG, 'ffmpeg'].filter((x): x is string => !!x);
  for (const c of candidates) {
    const r = spawnSync(c, ['-hide_banner', '-version'], { encoding: 'utf8' });
    if (r.status === 0) return (cached = c);
  }
  throw new FrameError('RENDER_FAILED', 'ffmpeg was not found', undefined, 'Install ffmpeg (https://ffmpeg.org/download.html) or set FRAME_FFMPEG to its path.');
}

export function ffprobePath(): string {
  const ff = ffmpegPath();
  return ff.replace(/ffmpeg(\.exe)?$/, (_m, ext: string | undefined) => `ffprobe${ext ?? ''}`);
}

export function ffmpegVersion(): string {
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-version'], { encoding: 'utf8' });
  return r.stdout.split('\n')[0]?.trim() ?? 'unknown';
}

export interface ProbeResult {
  durationS: number;
  streams: { type: string; codec: string; width?: number; height?: number; fps?: number; sampleRate?: number; channels?: number; frames?: number }[];
}

export function probe(file: string): ProbeResult {
  const r = spawnSync(ffprobePath(), ['-v', 'error', '-show_format', '-show_streams', '-count_frames', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new FrameError('RENDER_FAILED', `ffprobe failed for ${file}`, { stderr: r.stderr.slice(0, 500) });
  const j = JSON.parse(r.stdout) as { format: { duration?: string }; streams: Record<string, string | number>[] };
  const fps = (s: string | number | undefined) => {
    const [a, b] = String(s ?? '0/1').split('/').map(Number);
    return b ? a! / b : 0;
  };
  return {
    durationS: Number(j.format.duration ?? 0),
    streams: j.streams.map((s) => ({
      type: String(s.codec_type),
      codec: String(s.codec_name),
      ...(s.width ? { width: Number(s.width), height: Number(s.height), fps: fps(s.avg_frame_rate), frames: Number(s.nb_read_frames ?? s.nb_frames ?? 0) } : {}),
      ...(s.sample_rate ? { sampleRate: Number(s.sample_rate), channels: Number(s.channels) } : {}),
    })),
  };
}
