/**
 * Music beds (Catalog N1), musical cues (N2) and ambience loops (N3) synthesised deterministically: small additive,
 * FM and Karplus-Strong voices playing chord progressions, and filtered-noise beds — no recordings or third-party
 * samples. Beds and ambience loop seamlessly (tails wrap to the start). Loudness targets follow CAT-08: music
 * −16 LUFS, ambience −30 LUFS, cues peak −3 dBFS; all 48 kHz mono 16-bit WAV. Placeholders until recorded or
 * licensed audio passes listening review.
 */
import { measureLoudness } from '../../packages/io/src/audio.js';

export const SR = 48000;

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const TAU = Math.PI * 2;

type Voice = 'pad' | 'pluck' | 'keys' | 'bass' | 'chip' | 'bell' | 'strings' | 'piano';

/** Adds a note into buffer `out` at sample `at`. */
function note(out: Float32Array, voice: Voice, midi: number, at: number, durS: number, vel: number, rnd: () => number) {
  const f = mtof(midi);
  const n = Math.round(durS * SR);
  const tail = voice === 'pad' || voice === 'strings' ? Math.round(0.8 * SR) : voice === 'bell' ? Math.round(1.6 * SR) : Math.round(0.4 * SR);
  const total = n + tail;
  if (voice === 'pluck') {
    // Karplus-Strong string.
    const period = Math.max(2, Math.round(SR / f));
    const buf = new Float32Array(period);
    for (let i = 0; i < period; i++) buf[i] = rnd() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < total; i++) {
      const j = (idx + 1) % period;
      const v = buf[idx]!;
      buf[idx] = 0.996 * 0.5 * (v + buf[j]!);
      idx = j;
      const p = at + i;
      if (p >= 0 && p < out.length) out[p] = out[p]! + v * vel * 0.6;
    }
    return;
  }
  let ph = rnd() * TAU;
  let ph2 = rnd() * TAU;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    const rel = i < n ? 1 : Math.exp(-(i - n) / (tail * 0.3));
    let v = 0;
    switch (voice) {
      case 'pad':
      case 'strings': {
        const att = Math.min(1, t / (voice === 'pad' ? 0.6 : 0.25));
        ph += (TAU * f) / SR;
        ph2 += (TAU * f * 1.006) / SR;
        // Soft detuned triangle-ish pair.
        v = (Math.asin(Math.sin(ph)) + Math.asin(Math.sin(ph2))) * 0.35 * att * rel;
        if (voice === 'strings') v *= 1 + 0.05 * Math.sin(TAU * 5.5 * t);
        break;
      }
      case 'keys':
      case 'piano': {
        // Two-operator FM electric piano / a brighter decaying piano.
        const env = Math.exp(-t * (voice === 'piano' ? 2.2 : 3)) * rel;
        const mod = Math.sin(TAU * f * (voice === 'piano' ? 2 : 1) * t) * (voice === 'piano' ? 1.2 : 2.2) * Math.exp(-t * 6);
        v = Math.sin(TAU * f * t + mod) * env * 0.6;
        break;
      }
      case 'bell': {
        const env = Math.exp(-t * 1.3) * rel;
        v = (Math.sin(TAU * f * t + Math.sin(TAU * f * 3.5 * t) * 1.5 * Math.exp(-t * 2)) * env) * 0.45;
        break;
      }
      case 'bass': {
        const env = Math.min(1, t / 0.01) * Math.exp(-t * 1.8) * rel;
        v = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t)) * env * 0.7;
        break;
      }
      case 'chip': {
        const env = Math.exp(-t * 4) * rel;
        v = (Math.sin(TAU * f * t) >= 0 ? 1 : -1) * env * 0.2;
        break;
      }
    }
    const p = at + i;
    if (p >= 0 && p < out.length) out[p] = out[p]! + v * vel;
  }
}

function drum(out: Float32Array, kind: 'kick' | 'snare' | 'hat' | 'shaker' | 'clap', at: number, vel: number, rnd: () => number) {
  const n = Math.round((kind === 'kick' ? 0.35 : kind === 'snare' || kind === 'clap' ? 0.22 : 0.06) * SR);
  let ph = 0;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v: number;
    if (kind === 'kick') {
      ph += (TAU * (45 + 110 * Math.exp(-t * 30))) / SR;
      v = Math.sin(ph) * Math.exp(-t * 9);
    } else if (kind === 'snare' || kind === 'clap') {
      const nz = rnd() * 2 - 1;
      v = nz * Math.exp(-t * (kind === 'clap' ? 22 : 16)) * 0.6 + (kind === 'snare' ? Math.sin(TAU * 190 * t) * Math.exp(-t * 25) * 0.4 : 0);
    } else {
      const nz = rnd() * 2 - 1;
      lp += 0.6 * (nz - lp);
      v = (nz - lp) * Math.exp(-t * (kind === 'hat' ? 60 : 35)) * (kind === 'shaker' ? 0.5 : 0.6);
    }
    const p = at + i;
    if (p >= 0 && p < out.length) out[p] = out[p]! + v * vel;
  }
}

/** Chord symbols as semitone offsets from the key root. */
const CHORD: Record<string, number[]> = { I: [0, 4, 7], ii: [2, 5, 9], iii: [4, 7, 11], IV: [5, 9, 12], V: [7, 11, 14], vi: [9, 12, 16], i: [0, 3, 7], iv: [5, 8, 12], v: [7, 10, 14], VI: [8, 12, 15], VII: [10, 14, 17], III: [3, 7, 10], Imaj7: [0, 4, 7, 11], vi7: [9, 12, 16, 19], ii7: [2, 5, 9, 12], V7: [7, 11, 14, 17] };

export interface MusicSpec {
  bpm: number;
  key: number; // MIDI root of the key
  chords: string[]; // one per bar
  comp: Voice; // chord voice
  compRhythm: number[]; // beat positions within a bar where the chord is struck (in beats)
  arp?: { voice: Voice; steps: number; octave: number };
  bass?: number[]; // beats where the bass plays the root
  drums?: { kick?: number[]; snare?: number[]; hat?: number[]; shaker?: number[]; clap?: number[] };
  melody?: { voice: Voice; notes: [number, number, number][] }; // [beat, scale-degree semitones, beats]
  swing?: number;
}

/** Renders `bars` bars of a spec as a seamless loop. */
export function renderMusic(spec: MusicSpec, seed: number): Float32Array {
  const rnd = prng(seed);
  const beat = 60 / spec.bpm;
  const bars = spec.chords.length;
  const len = Math.round(bars * 4 * beat * SR);
  const out = new Float32Array(len + 3 * SR);
  const at = (b: number) => Math.round(b * beat * SR);
  spec.chords.forEach((c, bar) => {
    const tones = CHORD[c] ?? CHORD.I!;
    const b0 = bar * 4;
    for (const r of spec.compRhythm) for (const t of tones) note(out, spec.comp, spec.key + t, at(b0 + r), spec.comp === 'pad' || spec.comp === 'strings' ? 4 * beat : beat * 0.9, 0.22, rnd);
    if (spec.arp) {
      const step = 4 / spec.arp.steps;
      for (let i = 0; i < spec.arp.steps; i++) {
        const sw = i % 2 && spec.swing ? spec.swing * step : 0;
        note(out, spec.arp.voice, spec.key + 12 * spec.arp.octave + tones[i % tones.length]!, at(b0 + i * step + sw), step * beat * 0.9, 0.18, rnd);
      }
    }
    for (const r of spec.bass ?? []) note(out, 'bass', spec.key - 12 + tones[0]!, at(b0 + r), beat * 0.9, 0.5, rnd);
    for (const [kind, beats] of Object.entries(spec.drums ?? {}) as [Parameters<typeof drum>[1], number[]][]) for (const r of beats) drum(out, kind, at(b0 + r + (spec.swing && r % 1 ? spec.swing * 0.5 : 0)), kind === 'kick' ? 0.8 : 0.45, rnd);
  });
  for (const [b, deg, d] of spec.melody?.notes ?? []) note(out, spec.melody!.voice, spec.key + 12 + deg, at(b), d * beat, 0.3, rnd);
  // Wrap the tail past the loop end onto the start so the loop is seamless.
  const loop = out.slice(0, len);
  for (let i = len; i < out.length; i++) loop[i - len] = loop[i - len]! + out[i]!;
  return loop;
}

export const MUSIC: Record<string, MusicSpec> = {
  'warm-intro': { bpm: 92, key: 60, chords: ['I', 'vi', 'IV', 'V'], comp: 'keys', compRhythm: [0, 2.5], bass: [0, 2], arp: { voice: 'pluck', steps: 8, octave: 1 }, drums: { kick: [0, 2], snare: [1, 3], hat: [0.5, 1.5, 2.5, 3.5] } },
  'morning-coffee': { bpm: 100, key: 62, chords: ['Imaj7', 'vi7', 'ii7', 'V7'], comp: 'keys', compRhythm: [0, 1.5, 3], bass: [0, 2.5], arp: { voice: 'pluck', steps: 8, octave: 1 }, drums: { shaker: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], kick: [0, 2.5] }, swing: 0.12 },
  'upbeat-explainer': { bpm: 118, key: 64, chords: ['I', 'V', 'vi', 'IV'], comp: 'pluck', compRhythm: [0, 0.5, 1.5, 2, 3], bass: [0, 1, 2, 3], drums: { kick: [0, 1, 2, 3], clap: [1, 3], hat: [0.5, 1.5, 2.5, 3.5] } },
  'curious-minds': { bpm: 108, key: 65, chords: ['I', 'ii', 'V', 'I'], comp: 'pluck', compRhythm: [0, 1, 2, 3], bass: [0, 2], melody: { voice: 'bell', notes: [[0, 7, 1], [1, 9, 1], [2, 12, 2], [4, 11, 1], [5, 9, 1], [6, 7, 2], [8, 4, 1], [9, 7, 1], [10, 9, 2], [12, 7, 3]] }, drums: { hat: [0.5, 1.5, 2.5, 3.5] } },
  'late-night-talk': { bpm: 78, key: 57, chords: ['vi7', 'ii7', 'V7', 'Imaj7'], comp: 'keys', compRhythm: [0, 2.75], bass: [0, 1.75, 2.5], drums: { kick: [0, 2.5], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] }, swing: 0.15 },
  'quirky-comedy': { bpm: 126, key: 67, chords: ['I', 'IV', 'I', 'V'], comp: 'pluck', compRhythm: [0, 1, 2, 3], bass: [0, 1, 2, 3], melody: { voice: 'chip', notes: [[0, 0, 0.5], [0.5, 4, 0.5], [1, 7, 0.5], [2, 12, 1], [4, 5, 0.5], [4.5, 9, 0.5], [5, 12, 1], [8, 7, 0.5], [8.5, 4, 0.5], [9, 0, 1], [12, 7, 0.5], [12.5, 11, 0.5], [13, 14, 1]] } },
  'sneaky-moment': { bpm: 96, key: 57, chords: ['i', 'i', 'VI', 'v'], comp: 'pluck', compRhythm: [0, 1.5, 3], bass: [0, 0.5, 2, 2.5], drums: { hat: [0, 1, 2, 3] } },
  'sad-piano': { bpm: 66, key: 57, chords: ['i', 'VI', 'III', 'VII'], comp: 'piano', compRhythm: [0, 2], melody: { voice: 'piano', notes: [[0, 12, 2], [2, 10, 2], [4, 8, 3], [7, 7, 1], [8, 10, 2], [10, 12, 2], [12, 7, 4]] } },
  'tension-pulse': { bpm: 120, key: 50, chords: ['i', 'i', 'VI', 'VII'], comp: 'strings', compRhythm: [0], bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], drums: { kick: [0, 2] } },
  'calm-ambient': { bpm: 70, key: 60, chords: ['Imaj7', 'IV', 'vi', 'IV'], comp: 'pad', compRhythm: [0], arp: { voice: 'bell', steps: 4, octave: 1 } },
  'retro-game': { bpm: 140, key: 60, chords: ['I', 'vi', 'IV', 'V'], comp: 'chip', compRhythm: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], bass: [0, 1, 2, 3], arp: { voice: 'chip', steps: 16, octave: 1 }, drums: { kick: [0, 2], snare: [1, 3] } },
  'credits-roll': { bpm: 84, key: 62, chords: ['I', 'iii', 'IV', 'V'], comp: 'strings', compRhythm: [0], bass: [0, 2], arp: { voice: 'piano', steps: 8, octave: 1 } },
  'newsroom-theme': { bpm: 112, key: 50, chords: ['i', 'VI', 'III', 'VII'], comp: 'strings', compRhythm: [0], bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], arp: { voice: 'pluck', steps: 16, octave: 1 }, drums: { kick: [0, 1.5, 2], snare: [1, 3], hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] } },
  'breaking-news-sting': { bpm: 120, key: 50, chords: ['i', 'VI', 'VII'], comp: 'strings', compRhythm: [0, 2], bass: [0, 2], melody: { voice: 'bell', notes: [[0, 12, 0.5], [0.5, 12, 0.5], [1, 15, 0.5], [1.5, 14, 0.5], [2, 12, 2], [4, 10, 1], [5, 12, 1], [6, 14, 2], [8, 12, 4]] }, drums: { kick: [0, 2], snare: [3] } },
  'hopeful-strings': { bpm: 76, key: 62, chords: ['I', 'V', 'vi', 'IV', 'I', 'iii', 'IV', 'V'], comp: 'strings', compRhythm: [0], bass: [0, 2], arp: { voice: 'piano', steps: 8, octave: 1 }, melody: { voice: 'bell', notes: [[0, 7, 2], [2, 9, 2], [4, 11, 3], [8, 12, 2], [10, 11, 2], [12, 9, 4], [16, 7, 2], [18, 4, 2], [20, 5, 3], [24, 7, 4], [28, 2, 4]] } },
  'mystery-noir': { bpm: 72, key: 55, chords: ['i', 'iv', 'VI', 'v'], comp: 'keys', compRhythm: [0, 2.75], bass: [0, 1, 2, 3], melody: { voice: 'piano', notes: [[0, 15, 1.5], [1.5, 14, 0.5], [2, 12, 2], [4, 10, 1], [5, 8, 1], [6, 7, 2], [8, 3, 1], [9, 5, 1], [10, 7, 2], [12, 6, 4]] }, drums: { hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], kick: [0, 2.5] }, swing: 0.2 },
  'action-chase': { bpm: 150, key: 52, chords: ['i', 'i', 'VI', 'VII'], comp: 'strings', compRhythm: [0, 2], bass: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], arp: { voice: 'pluck', steps: 16, octave: 1 }, drums: { kick: [0, 0.75, 1.5, 2, 2.75, 3.5], snare: [1, 3], hat: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75] } },
  'victory-fanfare': { bpm: 120, key: 60, chords: ['I', 'IV', 'V', 'I'], comp: 'strings', compRhythm: [0, 2], bass: [0, 2], melody: { voice: 'bell', notes: [[0, 7, 0.5], [0.5, 7, 0.5], [1, 7, 0.5], [1.5, 12, 2.5], [4, 9, 1], [5, 11, 1], [6, 12, 2], [8, 14, 1], [9, 12, 1], [10, 14, 2], [12, 19, 4]] }, drums: { kick: [0, 2], snare: [1, 3] } },
  'fantasy-adventure': { bpm: 96, key: 57, chords: ['i', 'VI', 'III', 'VII', 'i', 'iv', 'VI', 'v'], comp: 'strings', compRhythm: [0], bass: [0, 2, 3], arp: { voice: 'bell', steps: 8, octave: 1 }, melody: { voice: 'piano', notes: [[0, 12, 2], [2, 15, 2], [4, 19, 3], [7, 17, 1], [8, 15, 2], [10, 12, 2], [12, 14, 4], [16, 12, 2], [18, 10, 2], [20, 8, 3], [24, 7, 4], [28, 12, 4]] }, drums: { kick: [0, 2], snare: [3] } },
  'party-groove': { bpm: 124, key: 65, chords: ['vi7', 'ii7', 'V7', 'Imaj7'], comp: 'keys', compRhythm: [0.5, 1.5, 2.5, 3.5], bass: [0, 0.75, 1.5, 2, 2.75, 3.5], drums: { kick: [0, 1, 2, 3], clap: [1, 3], hat: [0.5, 1.5, 2.5, 3.5], shaker: [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75] } },
};

/** Short musical cues (N2), one-shot. */
export function renderCue(id: string, seed: number): Float32Array | undefined {
  const rnd = prng(seed);
  const out = new Float32Array(Math.round(3 * SR));
  const a = (s: number) => Math.round(s * SR);
  switch (id) {
    case 'comedy-sting':
      [[0, 72], [0.12, 76], [0.24, 79], [0.36, 84]].forEach(([t, m]) => note(out, 'chip', m!, a(t!), 0.1, 0.6, rnd));
      drum(out, 'snare', a(0.36), 0.6, rnd);
      return out.slice(0, a(1));
    case 'rimshot':
      drum(out, 'snare', 0, 0.6, rnd);
      drum(out, 'snare', a(0.18), 0.6, rnd);
      drum(out, 'kick', a(0.4), 0.8, rnd);
      drum(out, 'hat', a(0.4), 1, rnd);
      for (let i = 0; i < a(0.6); i++) out[a(0.4) + i] = out[a(0.4) + i]! + (rnd() * 2 - 1) * 0.25 * Math.exp(-i / (SR * 0.25));
      return out.slice(0, a(1.2));
    case 'sad-trombone':
      [[0, 58, 0.4], [0.45, 57, 0.4], [0.9, 56, 0.4], [1.35, 55, 1.1]].forEach(([t, m, d]) => note(out, 'strings', m!, a(t!), d!, 0.8, rnd));
      return out.slice(0, a(2.8));
    case 'dramatic-hit':
      drum(out, 'kick', 0, 1.2, rnd);
      for (const m of [38, 45, 50, 53]) note(out, 'strings', m, 0, 1.2, 0.6, rnd);
      return out.slice(0, a(2.4));
    case 'suspense-riser': {
      let ph = 0;
      for (let i = 0; i < a(2.5); i++) {
        const t = i / SR;
        ph += (TAU * (110 + 330 * (t / 2.5) ** 2)) / SR;
        out[i] = (Math.asin(Math.sin(ph)) * 0.4 + (rnd() * 2 - 1) * 0.15 * (t / 2.5)) * (t / 2.5);
      }
      return out.slice(0, a(2.6));
    }
    case 'whoosh-transition': {
      let lp = 0;
      for (let i = 0; i < a(0.9); i++) {
        const t = i / 0.9 / SR;
        lp += (0.02 + 0.3 * Math.sin(Math.PI * t)) * ((rnd() * 2 - 1) - lp);
        out[i] = lp * Math.sin(Math.PI * t) ** 2;
      }
      return out.slice(0, a(1));
    }
    case 'ta-da':
      for (const m of [60, 64, 67]) note(out, 'pluck', m + 12, 0, 0.12, 0.5, rnd);
      for (const m of [60, 64, 67, 72]) note(out, 'strings', m + 12, a(0.18), 1, 0.4, rnd);
      return out.slice(0, a(1.8));
    case 'record-scratch': {
      let ph = 0;
      for (let i = 0; i < a(0.7); i++) {
        const t = i / SR;
        ph += (TAU * (300 + 900 * Math.sin(t * 18) * Math.exp(-t * 3))) / SR;
        out[i] = ((rnd() * 2 - 1) * 0.5 + Math.sin(ph) * 0.4) * Math.exp(-t * 3);
      }
      return out.slice(0, a(0.8));
    }
    case 'harp-gliss':
      [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].forEach((d, i) => note(out, 'pluck', 60 + d, a(i * 0.07), 0.5, 0.5, rnd));
      return out.slice(0, a(2.2));
    case 'magic-chime':
      [84, 88, 91, 96].forEach((m, i) => note(out, 'bell', m, a(i * 0.09), 0.3, 0.6, rnd));
      return out.slice(0, a(2.4));
    case 'gong':
      for (const [m, v] of [[36, 1], [43.2, 0.6], [49.7, 0.4], [55.1, 0.3]] as const) note(out, 'bell', m, 0, 0.2, v, rnd);
      return out.slice(0, a(3));
    case 'heartbeat':
      for (const t of [0, 0.22, 0.9, 1.12]) drum(out, 'kick', a(t), t % 0.9 ? 0.6 : 1, rnd);
      return out.slice(0, a(1.8));
  }
  return undefined;
}

/** Ambience beds (N3): filtered noise and sparse events, crossfaded into a seamless loop. */
export function renderAmbience(id: string, seed: number, seconds = 8): Float32Array | undefined {
  const rnd = prng(seed);
  const n = Math.round(seconds * SR);
  const xf = Math.round(1 * SR);
  const out = new Float32Array(n + xf);
  const brown = (gain: number, k = 0.02) => {
    let s = 0;
    for (let i = 0; i < out.length; i++) {
      s += k * ((rnd() * 2 - 1) - s);
      out[i] = out[i]! + s * gain;
    }
  };
  const band = (gain: number, f: number, q: number, lfo = 0) => {
    const w = (TAU * f) / SR;
    const r = Math.exp(-w / (2 * q));
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < out.length; i++) {
      const x = rnd() * 2 - 1;
      const y = (1 - r) * x + 2 * r * Math.cos(w) * y1 - r * r * y2;
      y2 = y1;
      y1 = y;
      out[i] = out[i]! + y * gain * (1 + lfo * Math.sin((TAU * i) / (SR * 3.1)));
    }
  };
  const events = (count: number, fn: (at: number) => void) => {
    for (let i = 0; i < count; i++) fn(Math.round(rnd() * (out.length - SR)));
  };
  const chirp = (at: number, f0: number, f1: number, d: number, g: number) => {
    let ph = 0;
    for (let i = 0; i < Math.round(d * SR); i++) {
      const u = i / (d * SR);
      ph += (TAU * (f0 + (f1 - f0) * u)) / SR;
      const p = at + i;
      if (p < out.length) out[p] = out[p]! + Math.sin(ph) * g * Math.sin(Math.PI * u);
    }
  };
  switch (id) {
    case 'studio-room-tone': brown(0.4, 0.01); band(0.05, 120, 2); break;
    case 'living-room-hum': brown(0.35, 0.01); for (let i = 0; i < out.length; i++) out[i] = out[i]! + Math.sin((TAU * 60 * i) / SR) * 0.02; break;
    case 'library-hush': brown(0.25, 0.008); events(3, (at) => chirp(at, 2400, 2200, 0.05, 0.02)); break;
    case 'bedroom-quiet': brown(0.2, 0.006); break;
    case 'office-murmur':
    case 'classroom-chatter':
    case 'coffee-shop':
    case 'newsroom-bustle':
    case 'auditorium-crowd':
      // Crowd murmur: speech-band noise with slow syllable-rate modulation (never intelligible speech).
      brown(0.3, 0.01);
      for (const f of [350, 600, 900, 1400]) band(0.35, f, 3, 0.6);
      if (id === 'coffee-shop') events(6, (at) => { for (const m of [2350, 2600]) chirp(at, m, m, 0.25, 0.06); });
      if (id === 'newsroom-bustle') events(10, (at) => chirp(at, 1200, 1200, 0.03, 0.08));
      break;
    case 'city-street':
      brown(0.6, 0.015);
      events(2, (at) => { for (let i = 0; i < Math.round(3 * SR); i++) { const p = at + i; if (p < out.length) out[p] = out[p]! + (rnd() * 2 - 1) * 0.25 * Math.sin((Math.PI * i) / (3 * SR)) ** 2; } });
      break;
    case 'park-birds': brown(0.2, 0.01); events(14, (at) => chirp(at, 3000 + rnd() * 2000, 4200 + rnd() * 1500, 0.08 + rnd() * 0.12, 0.12)); break;
    case 'night-crickets':
      brown(0.15, 0.006);
      for (let c = 0; c < 3; c++) { const f = 4200 + c * 400; for (let i = 0; i < out.length; i++) { const t = i / SR; const on = (t * (2 + c * 0.3)) % 1 < 0.25 ? 1 : 0; out[i] = out[i]! + Math.sin(TAU * f * t) * 0.03 * on * (Math.sin(TAU * 30 * t) > 0 ? 1 : 0.3); } }
      break;
    case 'rain-on-window': band(0.5, 3000, 0.7); brown(0.3, 0.02); events(40, (at) => chirp(at, 1800 + rnd() * 1500, 1500, 0.02, 0.15)); break;
    case 'thunderstorm': band(0.6, 2500, 0.7); brown(0.8, 0.01); events(1, (at) => { for (let i = 0; i < Math.round(3 * SR); i++) { const p = at + i; if (p < out.length) out[p] = out[p]! + (rnd() * 2 - 1) * Math.exp(-i / (SR * 0.9)) * 0.6; } }); break;
    case 'wind': { let s = 0; for (let i = 0; i < out.length; i++) { s += (0.01 + 0.02 * (1 + Math.sin((TAU * i) / (SR * 4.3)))) * ((rnd() * 2 - 1) - s); out[i] = s * 1.2; } break; }
    case 'gym-ambience': brown(0.3, 0.01); for (const f of [400, 800]) band(0.3, f, 3, 0.5); events(5, (at) => chirp(at, 180, 120, 0.12, 0.3)); break;
    case 'train-carriage': brown(0.9, 0.008); for (let i = 0; i < out.length; i++) { const t = i / SR; out[i] = out[i]! + ((t % 0.9) < 0.04 ? 0.25 : 0) * Math.sin(TAU * 80 * t); } break;
    case 'kitchen-ambience': brown(0.3, 0.01); band(0.08, 250, 4); events(4, (at) => chirp(at, 2900, 2900, 0.12, 0.05)); break;
    case 'hospital-ward': brown(0.25, 0.008); for (let k = 0; k < Math.floor(out.length / SR / 2); k++) chirp(k * 2 * SR, 880, 880, 0.12, 0.04); break;
    case 'enchanted-forest': brown(0.2, 0.008); events(10, (at) => chirp(at, 1800 + rnd() * 900, 2600 + rnd() * 900, 0.3, 0.06)); band(0.05, 5200, 6, 0.5); break;
    default: return undefined;
  }
  // Crossfade the extra second at the end into the start: a seamless loop.
  const loop = out.slice(0, n);
  for (let i = 0; i < xf; i++) {
    const g = i / xf;
    loop[i] = loop[i]! * g + out[n + i]! * (1 - g);
  }
  return loop;
}

/** Normalises to a loudness target (LUFS) with a peak ceiling, or to a peak when `peakDb` only. */
export function normalise(x: Float32Array, o: { lufs?: number; peakDb: number }): Float32Array {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (!peak) return x;
  let gain = 10 ** (o.peakDb / 20) / peak;
  if (o.lufs !== undefined) {
    const m = measureLoudness({ sampleRate: SR, channels: 1, data: [x] });
    if (Number.isFinite(m.integrated)) gain = Math.min(gain, 10 ** ((o.lufs - m.integrated) / 20));
  }
  return x.map((v) => v * gain);
}

export function wav16(x: Float32Array): Uint8Array {
  const n = x.length;
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x[i]!)) * 32767), true);
  return out;
}
