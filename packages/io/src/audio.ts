/**
 * Offline audio (SRS §6.6, FR-SND-02/05, FR-RND-06): decode, mix an AudioPlan with the same automation the Studio
 * uses, measure loudness (ITU-R BS.1770-4 / EBU R128 integrated LUFS), normalise and limit, write WAV.
 */
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { eventGainAt, panGains, type AudioEvent, type AudioPlan, type AudioSource } from '@frame/core';
import { FrameError } from '@frame/schema';
import { ffmpegPath } from './ffmpeg.js';

export const MIX_RATE = 48_000;

export interface PcmAudio {
  sampleRate: number;
  channels: number;
  /** Planar channel data, −1…1. */
  data: Float32Array[];
}

/* ------------------------------------------------------------------ WAV */

/** Parses PCM 16/24/32-bit integer and 32-bit float WAV files. Returns undefined for other formats. */
export function parseWav(buf: Uint8Array): PcmAudio | undefined {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (o: number) => String.fromCharCode(buf[o]!, buf[o + 1]!, buf[o + 2]!, buf[o + 3]!);
  if (buf.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;
  let fmt: { format: number; channels: number; rate: number; bits: number } | undefined;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = tag(off);
    const size = dv.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      let format = dv.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = dv.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE sub-format
      fmt = { format, channels: dv.getUint16(body + 2, true), rate: dv.getUint32(body + 4, true), bits: dv.getUint16(body + 14, true) };
    } else if (id === 'data' && fmt) {
      const { format, channels, bits } = fmt;
      const bytes = bits / 8;
      const end = Math.min(buf.length, body + size);
      const frames = Math.floor((end - body) / (bytes * channels));
      const data = Array.from({ length: channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
          const p = body + (i * channels + c) * bytes;
          let v: number;
          if (format === 3 && bits === 32) v = dv.getFloat32(p, true);
          else if (format === 1 && bits === 16) v = dv.getInt16(p, true) / 32768;
          else if (format === 1 && bits === 24) v = ((buf[p]! | (buf[p + 1]! << 8) | (buf[p + 2]! << 16)) << 8 >> 8) / 8388608;
          else if (format === 1 && bits === 32) v = dv.getInt32(p, true) / 2147483648;
          else return undefined;
          data[c]![i] = v;
        }
      }
      return { sampleRate: fmt.rate, channels, data };
    }
    off = body + size + (size % 2);
  }
  return undefined;
}

/** Encodes 16-bit PCM or 32-bit float WAV. */
export function encodeWav(a: PcmAudio, format: 'pcm16' | 'float32' = 'pcm16'): Uint8Array {
  const frames = a.data[0]?.length ?? 0;
  const bytes = format === 'pcm16' ? 2 : 4;
  const size = frames * a.channels * bytes;
  const buf = new Uint8Array(44 + size);
  const dv = new DataView(buf.buffer);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => (buf[o + i] = ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + size, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, format === 'pcm16' ? 1 : 3, true);
  dv.setUint16(22, a.channels, true);
  dv.setUint32(24, a.sampleRate, true);
  dv.setUint32(28, a.sampleRate * a.channels * bytes, true);
  dv.setUint16(32, a.channels * bytes, true);
  dv.setUint16(34, bytes * 8, true);
  str(36, 'data');
  dv.setUint32(40, size, true);
  let p = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < a.channels; c++) {
      const v = a.data[c]![i]!;
      if (format === 'pcm16') {
        // TPDF-free rounding is deterministic; the limiter keeps peaks below full scale.
        dv.setInt16(p, Math.max(-32768, Math.min(32767, Math.round(v * 32767))), true);
        p += 2;
      } else {
        dv.setFloat32(p, v, true);
        p += 4;
      }
    }
  }
  return buf;
}

/** Decodes any audio file: WAV natively, everything else through ffmpeg (FR-IMP audio import uses this too). */
export function decodeAudioFile(file: string): PcmAudio {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const wav = parseWav(bytes);
  if (wav) return wav;
  const ff = ffmpegPath();
  const r = spawnSync(ff, ['-v', 'error', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(MIX_RATE), '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new FrameError('VALIDATION_FAILED', `Could not decode ${file}`, { stderr: String(r.stderr).slice(0, 500) });
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  const n = f.length / 2;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = f[i * 2]!;
    R[i] = f[i * 2 + 1]!;
  }
  return { sampleRate: MIX_RATE, channels: 2, data: [L, R] };
}

/** Linear-interpolation resampler (adequate for speech/music previews; deterministic). */
export function resample(a: PcmAudio, rate: number): PcmAudio {
  if (a.sampleRate === rate) return a;
  const ratio = a.sampleRate / rate;
  const n = Math.floor((a.data[0]!.length * rate) / a.sampleRate);
  return {
    sampleRate: rate,
    channels: a.channels,
    data: a.data.map((ch) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = i * ratio;
        const k = Math.floor(x);
        const f = x - k;
        out[i] = (ch[k] ?? 0) * (1 - f) + (ch[k + 1] ?? ch[k] ?? 0) * f;
      }
      return out;
    }),
  };
}

/* ------------------------------------------------------------------ mix */

export interface MixOptions {
  /** Resolves a source to a decodable file path; undefined means missing. */
  resolve: (src: AudioSource) => string | undefined;
  sampleRate?: number;
  /** Separate stems per bus (FR-RND-06). */
  stems?: boolean;
}

export interface MixResult {
  mix: PcmAudio;
  stems?: Partial<Record<AudioEvent['bus'], PcmAudio>>;
  warnings: string[];
  fixture: boolean;
}

export function mixPlan(plan: AudioPlan, o: MixOptions): MixResult {
  const rate = o.sampleRate ?? MIX_RATE;
  const frames = Math.ceil(plan.duration * rate);
  const mk = (): PcmAudio => ({ sampleRate: rate, channels: 2, data: [new Float32Array(frames), new Float32Array(frames)] });
  const mix = mk();
  const stems: Partial<Record<AudioEvent['bus'], PcmAudio>> = {};
  const warnings = [...plan.warnings];
  const cache = new Map<string, PcmAudio | null>();
  let fixture = false;
  for (const e of plan.events) {
    const key = e.source.kind === 'media' ? e.source.hash : e.source.ref;
    if (!cache.has(key)) {
      const file = o.resolve(e.source);
      let audio: PcmAudio | null = null;
      if (file) {
        try {
          audio = resample(decodeAudioFile(file), rate);
        } catch (err) {
          warnings.push(`Could not decode audio for clip ${e.id}: ${(err as Error).message}`);
        }
      } else warnings.push(`Audio for clip ${e.id} is missing (${key}).`);
      cache.set(key, audio);
    }
    const src = cache.get(key);
    if (!src) continue;
    if (e.fixture) fixture = true;
    const [gl, gr] = panGains(e.pan);
    const L = src.data[0]!;
    const R = src.data[1] ?? L;
    const len = L.length;
    const s0 = Math.round(e.start * rate);
    const n = Math.min(frames - s0, Math.round(e.duration * rate));
    const off = Math.round(e.offset * rate);
    const targets = [mix, ...(o.stems ? [(stems[e.bus] ??= mk())] : [])];
    // Gain automation evaluated every 32 samples (≤ 0.7 ms) and interpolated.
    const BLOCK = 32;
    for (let b = 0; b < n; b += BLOCK) {
      const g0 = eventGainAt(plan, e, (s0 + b) / rate);
      const g1 = eventGainAt(plan, e, (s0 + Math.min(n, b + BLOCK)) / rate);
      const m = Math.min(BLOCK, n - b);
      for (let k = 0; k < m; k++) {
        const i = b + k;
        let si = off + i;
        if (si >= len) {
          if (!e.loop || len === 0) break;
          si %= len;
        }
        const g = g0 + ((g1 - g0) * k) / m;
        for (const t of targets) {
          t.data[0]![s0 + i]! += L[si]! * g * gl;
          t.data[1]![s0 + i]! += R[si]! * g * gr;
        }
      }
    }
  }
  return { mix, ...(o.stems ? { stems } : {}), warnings, fixture };
}

/* ------------------------------------------------------------------ loudness (BS.1770-4) */

function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i]!;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** K-weighting filter coefficients for any sample rate (BS.1770 pre-filter + RLB high-pass, bilinear design). */
function kWeight(ch: Float32Array, rate: number): Float32Array {
  // Stage 1: high shelf (+4 dB above ~1.5 kHz).
  const G = 3.999843853973347;
  let f0 = 1681.974450955533, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / rate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const s1 = biquad(ch, (Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
  // Stage 2: high-pass (~38 Hz).
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / rate);
  a0 = 1 + K / Q + K * K;
  return biquad(s1, 1, -2, 1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0);
}

/** Integrated loudness in LUFS (−Infinity for silence) and sample peak in dBFS. */
export function measureLoudness(a: PcmAudio): { integrated: number; samplePeakDb: number } {
  const rate = a.sampleRate;
  const weighted = a.data.map((ch) => kWeight(ch, rate));
  const block = Math.round(0.4 * rate);
  const hop = Math.round(0.1 * rate);
  const n = a.data[0]?.length ?? 0;
  const powers: number[] = [];
  for (let s = 0; s + block <= n; s += hop) {
    let z = 0;
    for (const ch of weighted) {
      let sum = 0;
      for (let i = s; i < s + block; i++) sum += ch[i]! * ch[i]!;
      z += sum / block;
    }
    powers.push(z);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const abs = powers.filter((p) => p > 0 && lufs(p) > -70);
  let peak = 0;
  for (const ch of a.data) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]!));
  const samplePeakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  if (!abs.length) return { integrated: -Infinity, samplePeakDb };
  const relGate = lufs(abs.reduce((x, y) => x + y, 0) / abs.length) - 10;
  const gated = abs.filter((p) => lufs(p) > relGate);
  return { integrated: lufs(gated.reduce((x, y) => x + y, 0) / gated.length), samplePeakDb };
}

/** Applies gain in place. */
export function applyGain(a: PcmAudio, db: number): void {
  const g = Math.pow(10, db / 20);
  for (const ch of a.data) for (let i = 0; i < ch.length; i++) ch[i]! *= g;
}

/**
 * Master limiter (FR-SND-02): look-ahead peak limiter with instant attack over the look-ahead window and exponential
 * release. Keeps sample peaks at or below the ceiling. Returns the maximum gain reduction in dB.
 */
export function limit(a: PcmAudio, ceilingDb = -1, lookaheadMs = 5, releaseMs = 80): number {
  const ceil = Math.pow(10, ceilingDb / 20);
  const n = a.data[0]?.length ?? 0;
  const la = Math.max(1, Math.round((lookaheadMs / 1000) * a.sampleRate));
  const rel = Math.exp(-1 / ((releaseMs / 1000) * a.sampleRate));
  // Required gain per sample, then a running minimum over the look-ahead window, then release smoothing.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const ch of a.data) p = Math.max(p, Math.abs(ch[i]!));
    need[i] = p > ceil ? ceil / p : 1;
  }
  const gain = new Float32Array(n);
  // Sliding-window minimum (monotonic deque) over [i, i + la].
  const dq: number[] = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > head && need[dq[dq.length - 1]!]! >= need[i]!) dq.pop();
    dq.push(i);
    while (dq[head]! > i + la) head++;
    gain[i] = need[dq[head]!]!;
  }
  let g = 1;
  let maxRed = 1;
  for (let i = 0; i < n; i++) {
    const target = gain[i]!;
    g = target < g ? target : target + (g - target) * rel;
    if (g > target) g = target;
    maxRed = Math.min(maxRed, g);
    for (const ch of a.data) ch[i]! *= g;
  }
  return maxRed < 1 ? 20 * Math.log10(maxRed) : 0;
}

export interface MasterResult {
  loudness: { before: number; after: number; target?: number; samplePeakDb: number };
  limiterReductionDb: number;
  clipped: boolean;
}

/** Optional loudness normalisation then limiting (FR-SND-05: −14 LUFS social, −16 podcast). */
export function master(a: PcmAudio, opts: { targetLufs?: number; ceilingDb?: number } = {}): MasterResult {
  const before = measureLoudness(a);
  const clipped = before.samplePeakDb > 0;
  if (opts.targetLufs !== undefined && Number.isFinite(before.integrated)) applyGain(a, opts.targetLufs - before.integrated);
  const red = limit(a, opts.ceilingDb ?? -1);
  const after = measureLoudness(a);
  return { loudness: { before: before.integrated, after: after.integrated, ...(opts.targetLufs !== undefined ? { target: opts.targetLufs } : {}), samplePeakDb: after.samplePeakDb }, limiterReductionDb: red, clipped };
}

/** RMS envelope (mono mix) in windows of `windowS` seconds, for the amplitude lip-sync fallback (FR-LIP-02). */
export function rmsEnvelope(a: PcmAudio, windowS = 0.02): number[] {
  const n = a.data[0]?.length ?? 0;
  const w = Math.max(1, Math.round(windowS * a.sampleRate));
  const out: number[] = [];
  for (let s = 0; s < n; s += w) {
    let sum = 0;
    const e = Math.min(n, s + w);
    for (let i = s; i < e; i++) {
      let v = 0;
      for (const ch of a.data) v += ch[i]!;
      v /= a.channels;
      sum += v * v;
    }
    out.push(Math.round(Math.sqrt(sum / (e - s)) * 1e5) / 1e5);
  }
  return out;
}

/** Peak-normalises audio to `targetDb` dBFS (FR-VOI-06 optional upload normalisation). Silence is returned unchanged. */
export function normalisePeak(a: PcmAudio, targetDb = -1): { audio: PcmAudio; gainDb: number } {
  let peak = 0;
  for (const ch of a.data) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]!));
  if (peak < 1e-6) return { audio: a, gainDb: 0 };
  const g = Math.pow(10, targetDb / 20) / peak;
  return { audio: { ...a, data: a.data.map((ch) => ch.map((v) => v * g)) }, gainDb: Math.round(20 * Math.log10(g) * 100) / 100 };
}
