/**
 * Sound effects (Catalog N4, CAT-08) synthesised deterministically from noise, resonators and envelopes — no
 * recordings and no third-party samples. Each effect is 48 kHz mono 16-bit WAV, peak-normalised to −3 dBFS.
 * These are simple foley placeholders until recorded/licensed sounds pass listening review.
 */

export const SR = 48000;

type Gen = (n: number, rnd: () => number) => Float32Array;

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

const len = (s: number) => Math.round(s * SR);
const env = (i: number, attack: number, decay: number) => {
  const t = i / SR;
  return t < attack ? t / attack : Math.exp(-(t - attack) / decay);
};

/** Two-pole resonator (band-pass) over an input signal. */
function resonate(x: Float32Array, freq: number, q: number): Float32Array {
  const w = (2 * Math.PI * freq) / SR;
  const r = Math.exp(-w / (2 * q));
  const a1 = 2 * r * Math.cos(w);
  const a2 = -r * r;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = (1 - r) * x[i]! + a1 * (y[i - 1] ?? 0) + a2 * (y[i - 2] ?? 0);
  return y;
}
function lowpass(x: Float32Array, freq: number): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * freq) / SR);
  const y = new Float32Array(x.length);
  let s = 0;
  for (let i = 0; i < x.length; i++) y[i] = s += k * (x[i]! - s);
  return y;
}
function noise(n: number, rnd: () => number): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rnd() * 2 - 1;
  return x;
}
function mix(n: number, ...parts: [Float32Array, number, number?][]): Float32Array {
  const y = new Float32Array(n);
  for (const [p, g, at = 0] of parts) for (let i = 0; i < p.length && i + at < n; i++) y[i + at] = y[i + at]! + p[i]! * g;
  return y;
}
const shape = (x: Float32Array, f: (i: number) => number) => x.map((v, i) => v * f(i));
const tone = (n: number, f: (i: number) => number, e: (i: number) => number) => {
  const y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (2 * Math.PI * f(i)) / SR;
    y[i] = Math.sin(ph) * e(i);
  }
  return y;
};

/** A low body thump (doors, bodies, objects on wood). */
const thump = (n: number, rnd: () => number, freq: number, decay: number) =>
  mix(n, [tone(n, (i) => freq * (1 + 0.6 * Math.exp(-i / (SR * 0.02))), (i) => env(i, 0.002, decay)), 1], [shape(lowpass(noise(n, rnd), 900), (i) => env(i, 0.001, decay * 0.4)), 0.6]);

/** Hard small impact (ceramic, glass): a few inharmonic partials. */
const clink = (n: number, base: number, decay: number) =>
  mix(n, ...([1, 2.76, 5.4, 8.93] as const).map((m, k) => [tone(n, () => base * m, (i) => env(i, 0.0005, decay / (1 + k * 0.8))), 1 / (1 + k)] as [Float32Array, number]));

const knockOnce = (n: number, rnd: () => number) => mix(n, [thump(n, rnd, 180, 0.05), 1], [shape(resonate(noise(n, rnd), 1400, 6), (i) => env(i, 0.0005, 0.02)), 0.5]);

export const SOUNDS: Record<string, { seconds: number; gen: Gen }> = {
  'door-open': {
    seconds: 1.1,
    gen: (n, rnd) => {
      // Latch click, then a creak (resonant noise gliding in pitch), then a soft stop.
      const latch = shape(resonate(noise(n, rnd), 2600, 10), (i) => env(i, 0.0005, 0.015));
      const creakSrc = noise(n, rnd);
      const creak = new Float32Array(n);
      for (let seg = 0; seg < 6; seg++) {
        const f = 420 + seg * 55;
        const r = resonate(creakSrc, f, 30);
        for (let i = 0; i < n; i++) {
          const t = i / SR - 0.12 - seg * 0.11;
          creak[i] = creak[i]! + (t > 0 && t < 0.14 ? r[i]! * Math.sin((Math.PI * t) / 0.14) : 0);
        }
      }
      return mix(n, [latch, 1], [creak, 3], [thump(n, rnd, 120, 0.08), 0.4, len(0.9)]);
    },
  },
  'door-close': { seconds: 0.7, gen: (n, rnd) => mix(n, [thump(n, rnd, 95, 0.12), 1], [shape(resonate(noise(n, rnd), 2400, 8), (i) => env(i, 0.0005, 0.02)), 0.6, len(0.03)]) },
  'door-slam': { seconds: 1.2, gen: (n, rnd) => mix(n, [thump(n, rnd, 75, 0.25), 1.4], [shape(lowpass(noise(n, rnd), 3000), (i) => env(i, 0.0005, 0.08)), 0.8], [shape(resonate(noise(n, rnd), 2200, 10), (i) => env(i, 0.0005, 0.03)), 0.5, len(0.05)]) },
  knock: { seconds: 1, gen: (n, rnd) => mix(n, [knockOnce(n, rnd), 1], [knockOnce(n, rnd), 0.9, len(0.22)], [knockOnce(n, rnd), 0.95, len(0.42)]) },
  'mug-on-table': { seconds: 0.5, gen: (n, rnd) => mix(n, [thump(n, rnd, 220, 0.04), 0.8], [clink(n, 1150, 0.12), 0.35]) },
  'cup-clink': { seconds: 0.8, gen: (n) => mix(n, [clink(n, 2350, 0.35), 1], [clink(n, 2600, 0.25), 0.5, len(0.09)]) },
  'phone-ring': {
    seconds: 2,
    gen: (n) => tone(n, (i) => (Math.floor(i / (SR * 0.025)) % 2 ? 1300 : 1600), (i) => {
      const t = i / SR;
      return (t % 1 < 0.8 ? 1 : 0) * Math.min(1, t * 200) * 0.8;
    }),
  },
  'phone-vibrate': { seconds: 1.2, gen: (n, rnd) => shape(lowpass(noise(n, rnd), 220), (i) => ((i / SR) % 0.6 < 0.4 ? 1 : 0) * (0.6 + 0.4 * Math.sin((2 * Math.PI * 160 * i) / SR))) },
  'phone-notification': { seconds: 0.6, gen: (n) => mix(n, [tone(n, () => 1318.5, (i) => env(i, 0.003, 0.12)), 1], [tone(n, () => 1975.5, (i) => env(i, 0.003, 0.18)), 0.9, len(0.11)]) },
  'notification-chime': { seconds: 1, gen: (n) => mix(n, [tone(n, () => 880, (i) => env(i, 0.004, 0.3)), 1], [tone(n, () => 1108.7, (i) => env(i, 0.004, 0.3)), 0.8, len(0.12)], [tone(n, () => 1318.5, (i) => env(i, 0.004, 0.4)), 0.7, len(0.24)]) },
  'record-beep': { seconds: 0.4, gen: (n) => tone(n, () => 1000, (i) => (i / SR < 0.25 ? Math.min(1, (i / SR) * 400, (0.25 - i / SR) * 400) : 0)) },
  'error-beep': { seconds: 0.5, gen: (n) => mix(n, [tone(n, () => 330, (i) => (i / SR < 0.18 ? 1 : 0) * Math.min(1, (i / SR) * 300)), 1], [tone(n, () => 262, (i) => (i / SR > 0.22 && i / SR < 0.42 ? 1 : 0)), 1]) },
  'footsteps-wood': { seconds: 2, gen: (n, rnd) => mix(n, ...[0, 0.5, 1, 1.5].map((at, k) => [thump(n, rnd, 150 + k * 8, 0.05), 0.9 - k * 0.05, len(at)] as [Float32Array, number, number])) },
  'chair-creak': { seconds: 0.8, gen: (n, rnd) => shape(resonate(noise(n, rnd), 520, 25), (i) => Math.sin((Math.PI * i) / n) ** 2) },
  thud: { seconds: 0.6, gen: (n, rnd) => thump(n, rnd, 70, 0.15) },
  pop: { seconds: 0.25, gen: (n) => tone(n, (i) => 900 * Math.exp(-i / (SR * 0.02)) + 300, (i) => env(i, 0.001, 0.04)) },
  boing: { seconds: 0.9, gen: (n) => tone(n, (i) => 220 + 120 * Math.sin((2 * Math.PI * 9 * i) / SR) * Math.exp(-i / (SR * 0.4)), (i) => env(i, 0.003, 0.35)) },
  whoosh: { seconds: 0.8, gen: (n, rnd) => { const x = noise(n, rnd); const y = new Float32Array(n); for (let i = 0, s = 0; i < n; i++) { const k = 0.02 + 0.2 * Math.sin((Math.PI * i) / n); y[i] = s += k * (x[i]! - s); } return shape(y, (i) => Math.sin((Math.PI * i) / n) ** 2); } },
  swish: { seconds: 0.35, gen: (n, rnd) => shape(resonate(noise(n, rnd), 3000, 2), (i) => Math.sin((Math.PI * i) / n) ** 3) },
  bonk: { seconds: 0.5, gen: (n, rnd) => mix(n, [tone(n, (i) => 520 * Math.exp(-i / (SR * 0.15)) + 200, (i) => env(i, 0.001, 0.12)), 1], [thump(n, rnd, 140, 0.05), 0.5]) },
};

/** Synthesises an effect and returns WAV bytes (48 kHz mono 16-bit, peak −3 dBFS). */
export function renderSound(id: string, seed: number): { wav: Uint8Array; seconds: number } {
  const s = SOUNDS[id]!;
  const n = len(s.seconds);
  const x = s.gen(n, prng(seed));
  // Short fade-out so nothing clicks at the end.
  const fade = len(0.01);
  for (let i = 0; i < fade; i++) x[n - 1 - i]! *= i / fade;
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 10 ** (-3 / 20) / peak : 0;
  const data = new Int16Array(n);
  for (let i = 0; i < n; i++) data[i] = Math.round(Math.max(-1, Math.min(1, x[i]! * gain)) * 32767);
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  new Uint8Array(out.buffer, 44).set(new Uint8Array(data.buffer));
  return { wav: out, seconds: s.seconds };
}
