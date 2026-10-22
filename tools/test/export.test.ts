import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ProjectStore, encodeWav, measureLoudness, decodeAudioFile, probe } from '@frame/io';
import { runCli } from '../../packages/cli/src/index.js';
import { createNodeRenderer, type NodeRenderer } from '../../packages/render/src/node.js';
import { buildSampleScene, fixtureSpeechPcm } from './sample-scene.js';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

/** Writes the M1 sample to disk with fixture take media (labelled fixture; not real speech). */
function sampleProject(): { dir: string; scene: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-export-'));
  const { session, scene } = buildSampleScene('flat');
  const store = ProjectStore.create(dir, session.state);
  for (const take of Object.values(session.state.takes)) {
    const pcm = fixtureSpeechPcm(take.durationS!, take.alignment!);
    const media = store.putMedia(encodeWav({ sampleRate: 24000, channels: 1, data: [pcm] }), { ext: 'wav', mime: 'audio/wav', durationS: take.durationS, sampleRate: 24000, channels: 1 });
    session.apply({ commands: [{ name: 'take.update', params: { id: take.id, set: { media } } }] });
  }
  store.save(session.state, session.revision, ['*']);
  return { dir, scene };
}

async function cli(args: string[], cwd: string) {
  let out = '';
  let err = '';
  const code = await runCli([...args, '--json'], { stdout: (s) => (out += s), stderr: (s) => (err += s), cwd, env: {} });
  return { code, json: JSON.parse(out || '{}'), err };
}

let r: NodeRenderer;
beforeAll(async () => {
  r = await createNodeRenderer({ fontsDir: path.join(repo, 'content/fonts') });
});

describe('export pipeline (FR-RND-01/05/06/08, FR-SND-02/05, FR-TXT-06, M1 slice)', () => {
  it('renders an MP4 with picture, mixed fixture dialogue, subtitles and a render report', async () => {
    const { dir, scene } = sampleProject();
    const out = path.join(dir, 'renders', 'slice.mp4');
    const res = await cli(['render', 'video', '--project', dir, '--scene', scene, '--preset', 'out.landscape-720p', '--width', '640', '--height', '360', '--from', '0', '--to', '9', '--subtitles', 'srt,vtt', '--stems', '--out', out], dir);
    expect(res.code, res.err + JSON.stringify(res.json)).toBe(0);
    const rep = res.json.result;
    expect(rep.status).toBe('completed');
    expect(rep.frames).toBe(9 * 24);
    expect(rep.fixtureAudio).toBe(true);
    expect(rep.warnings).toContain('Contains fixture audio from the test worker — not real speech.');
    const pr = probe(out);
    const v = pr.streams.find((s) => s.type === 'video')!;
    const a = pr.streams.find((s) => s.type === 'audio')!;
    expect(v).toMatchObject({ codec: 'h264', width: 640, height: 360, frames: 216 });
    expect(v.fps).toBeCloseTo(24);
    expect(a).toMatchObject({ codec: 'aac', sampleRate: 48000, channels: 2 });
    expect(Math.abs(pr.durationS - 9)).toBeLessThan(0.1);
    // Loudness normalised to the preset target (−14 LUFS) and limited below −1 dBFS.
    expect(rep.loudness.integrated).toBeGreaterThan(-15);
    expect(rep.loudness.integrated).toBeLessThan(-13);
    expect(rep.loudness.samplePeakDb).toBeLessThanOrEqual(-0.99);
    const srt = fs.readFileSync(out.replace(/\.mp4$/, '.srt'), 'utf8');
    expect(srt).toContain('Welcome back.');
    expect(srt).toMatch(/00:00:00,400 --> /);
    expect(fs.readFileSync(out.replace(/\.mp4$/, '.vtt'), 'utf8').startsWith('WEBVTT')).toBe(true);
    expect(fs.existsSync(out.replace(/\.mp4$/, '.stem-dialogue.wav'))).toBe(true);
    const human = fs.readFileSync(out.replace(/\.mp4$/, '.report.txt'), 'utf8');
    expect(human).toContain('CONTAINS FIXTURE AUDIO — NOT REAL SPEECH');
    // Dialogue is audible where lines play and silent between them.
    const stem = decodeAudioFile(out.replace(/\.mp4$/, '.stem-dialogue.wav'));
    const rms = (from: number, to: number) => {
      const ch = stem.data[0]!;
      let s = 0;
      for (let i = Math.round(from * 48000); i < Math.round(to * 48000); i++) s += ch[i]! ** 2;
      return Math.sqrt(s / ((to - from) * 48000));
    };
    expect(rms(1, 3)).toBeGreaterThan(0.02);
    expect(rms(4.7, 4.95)).toBeLessThan(1e-4);
  }, 120_000);

  it('a video frame matches the CLI still of the same time (one renderer, FR-RND-01)', async () => {
    const { dir, scene } = sampleProject();
    const out = path.join(dir, 'clip.mp4');
    const res = await cli(['render', 'video', '--project', dir, '--scene', scene, '--preset', 'out.landscape-720p', '--width', '480', '--height', '270', '--from', '2', '--to', '3', '--crf', '1', '--out', out], dir);
    expect(res.code, res.err).toBe(0);
    const png = path.join(dir, 'still.png');
    const still = await cli(['render', 'frame', '--project', dir, '--scene', scene, '--at', '2.5', '--width', '480', '--height', '270', '--captions', '--out', png], dir);
    expect(still.code, still.err).toBe(0);
    // Frame 12 of the clip is t = 2.5 s. Decode it with ffmpeg and compare to the PNG (lossy codec → PSNR bound).
    const raw = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-vf', 'select=eq(n\\,12)', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 }).stdout;
    const ref = r.decodePng(new Uint8Array(fs.readFileSync(png))).rgba;
    expect(raw.length).toBe(ref.length);
    let se = 0;
    for (let i = 0; i < ref.length; i += 4) for (let c = 0; c < 3; c++) se += (raw[i + c]! - ref[i + c]!) ** 2;
    const psnr = 10 * Math.log10((255 * 255) / (se / ((ref.length / 4) * 3)));
    expect(psnr).toBeGreaterThan(30);
  }, 120_000);

  it('blocks export when a chosen take has no media (FR-RND-08) and keeps the project intact', async () => {
    const { dir, scene } = sampleProject();
    const media = path.join(dir, 'assets/media');
    for (const f of fs.readdirSync(media)) fs.rmSync(path.join(media, f));
    const before = fs.readFileSync(path.join(dir, 'project.json'), 'utf8');
    const res = await cli(['render', 'video', '--project', dir, '--scene', scene, '--preset', 'out.landscape-720p', '--width', '320', '--height', '180', '--to', '1', '--out', path.join(dir, 'x.mp4')], dir);
    expect(res.code).toBe(2);
    expect(res.json.error.code).toBe('VALIDATION_FAILED');
    expect(fs.existsSync(path.join(dir, 'x.mp4'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')).toBe(before);
  }, 60_000);

  it('loudness meter matches the EBU R128 reference for a 1 kHz sine (FR-SND-05)', () => {
    // EBU Tech 3341 test 1 scaled: a stereo 1 kHz sine at −20 dBFS measures −20.0 LUFS ±0.1.
    const n = 48000 * 5;
    const amp = Math.pow(10, -20 / 20);
    const ch = new Float32Array(n).map((_x, i) => amp * Math.sin((2 * Math.PI * 1000 * i) / 48000));
    const m = measureLoudness({ sampleRate: 48000, channels: 2, data: [ch, ch.slice()] });
    expect(Math.abs(m.integrated - -20)).toBeLessThan(0.1);
  });
});
