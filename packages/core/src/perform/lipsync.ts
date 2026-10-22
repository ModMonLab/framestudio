/**
 * Lip sync (FR-LIP-01..06): phonemes → 9-shape mouth set (Catalog A17) with coarticulation smoothing,
 * amplitude fallback, and user overrides.
 */
import type { Alignment, MouthBlock, MouthShape } from '@frame/schema';

/** Published mapping table: ARPAbet phoneme (stress digits removed) → mouth shape letter (docs/rig/lipsync.md). */
export const PHONEME_TO_SHAPE: Record<string, MouthShape> = {
  M: 'A', B: 'A', P: 'A',
  K: 'B', S: 'B', T: 'B', IY: 'B', D: 'B', G: 'B', N: 'B', NG: 'B', Z: 'B', SH: 'B', ZH: 'B', CH: 'B', JH: 'B', Y: 'B', HH: 'B', R: 'B', EY: 'B', IH: 'B',
  EH: 'C', AE: 'C', AH: 'C',
  AA: 'D', AY: 'D', AW: 'D',
  AO: 'E', ER: 'E', OY: 'E',
  UW: 'F', OW: 'F', W: 'F', UH: 'F',
  F: 'G', V: 'G',
  L: 'H', TH: 'H', DH: 'H',
};

export function shapeForPhoneme(p: string): MouthShape {
  const base = p.toUpperCase().replace(/[0-9]/g, '');
  if (base === '' || base === 'SIL' || base === 'SP' || base === 'SPN') return 'X';
  return PHONEME_TO_SHAPE[base] ?? 'B';
}

export interface MouthTrack {
  blocks: MouthBlock[];
  approximate: boolean;
}

/**
 * Builds the mouth track from an alignment: map, hold each shape ≥ minHold (2 frames at 24 fps), and close
 * bilabials on time by letting M/B/P blocks take precedence (look-ahead).
 */
export function mouthTrackFromAlignment(al: Alignment, opts: { fps?: number; minHoldFrames?: number } = {}): MouthTrack {
  const fps = opts.fps ?? 24;
  const minHold = (opts.minHoldFrames ?? 2) / fps;
  const raw: MouthBlock[] = [];
  for (const ph of al.phonemes) {
    if (ph.end <= ph.start) continue;
    raw.push({ shape: shapeForPhoneme(ph.p), start: ph.start, end: ph.end });
  }
  raw.sort((a, b) => a.start - b.start);
  // Fill gaps between phonemes with rest when longer than one frame; otherwise extend the previous block.
  const filled: MouthBlock[] = [];
  for (const b of raw) {
    const prev = filled[filled.length - 1];
    if (prev && b.start > prev.end) {
      if (b.start - prev.end >= 1 / fps) filled.push({ shape: 'X', start: prev.end, end: b.start });
      else prev.end = b.start;
    }
    filled.push({ ...b });
  }
  // Coarticulation: merge identical neighbours, then enforce the minimum hold. Short non-bilabial blocks are
  // absorbed into a neighbour; bilabials (A) keep their start so lips close on time.
  const merged = mergeSame(filled);
  const out: MouthBlock[] = [];
  for (let i = 0; i < merged.length; i++) {
    const b = { ...merged[i]! };
    const dur = b.end - b.start;
    if (dur < minHold && b.shape !== 'A') {
      const prev = out[out.length - 1];
      if (prev) {
        prev.end = b.end;
        continue;
      }
      const next = merged[i + 1];
      if (next) {
        next.start = b.start;
        continue;
      }
    }
    if (b.shape === 'A' && dur < minHold) b.end = b.start + minHold;
    const prev = out[out.length - 1];
    if (prev && prev.end > b.start) prev.end = b.start;
    if (prev && prev.end - prev.start <= 0) out.pop();
    out.push(b);
  }
  return { blocks: mergeSame(out).filter((b) => b.end > b.start), approximate: al.method === 'amplitude' };
}

function mergeSame(bs: MouthBlock[]): MouthBlock[] {
  const out: MouthBlock[] = [];
  for (const b of bs) {
    const prev = out[out.length - 1];
    if (prev && prev.shape === b.shape && Math.abs(prev.end - b.start) < 1e-6) prev.end = b.end;
    else out.push({ ...b });
  }
  return out;
}

/**
 * Amplitude fallback (FR-LIP-02): an RMS envelope (one value per window) mapped to rest/B/C/D, marked approximate.
 */
export function mouthTrackFromEnvelope(env: number[], windowS: number, opts: { fps?: number } = {}): MouthTrack {
  const fps = opts.fps ?? 24;
  const peak = Math.max(1e-6, ...env);
  const blocks: MouthBlock[] = [];
  for (let i = 0; i < env.length; i++) {
    const a = env[i]! / peak;
    const shape: MouthShape = a < 0.08 ? 'X' : a < 0.3 ? 'B' : a < 0.6 ? 'C' : 'D';
    const start = i * windowS;
    const prev = blocks[blocks.length - 1];
    if (prev && prev.shape === shape) prev.end = start + windowS;
    else blocks.push({ shape, start, end: start + windowS });
  }
  // Hold at least two frames.
  const minHold = 2 / fps;
  const out: MouthBlock[] = [];
  for (const b of blocks) {
    const prev = out[out.length - 1];
    if (prev && b.end - b.start < minHold) prev.end = b.end;
    else out.push(b);
  }
  return { blocks: out, approximate: true };
}

/** Applies user override blocks on top of the derived track (FR-LIP-04). */
export function applyOverrides(track: MouthBlock[], overrides: MouthBlock[] | undefined): MouthBlock[] {
  if (!overrides?.length) return track;
  let out = track.map((b) => ({ ...b }));
  for (const o of overrides) {
    const next: MouthBlock[] = [];
    for (const b of out) {
      if (b.end <= o.start || b.start >= o.end) next.push(b);
      else {
        if (b.start < o.start) next.push({ ...b, end: o.start });
        if (b.end > o.end) next.push({ ...b, start: o.end });
      }
    }
    next.push({ ...o });
    out = next.sort((a, b) => a.start - b.start);
  }
  return mergeSame(out);
}

/** Shape at a time (seconds from take start). Silence → rest. */
export function shapeAt(blocks: MouthBlock[], t: number): MouthShape {
  let lo = 0;
  let hi = blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = blocks[mid]!;
    if (t < b.start) hi = mid - 1;
    else if (t >= b.end) lo = mid + 1;
    else return b.shape;
  }
  return 'X';
}

/** RMS envelope of mono PCM samples. */
export function rmsEnvelope(samples: Float32Array, sampleRate: number, windowS = 1 / 48): number[] {
  const n = Math.max(1, Math.round(sampleRate * windowS));
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += n) {
    let s = 0;
    const end = Math.min(samples.length, i + n);
    for (let j = i; j < end; j++) s += samples[j]! * samples[j]!;
    out.push(Math.sqrt(s / Math.max(1, end - i)));
  }
  return out;
}
