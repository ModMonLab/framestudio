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
  // Movement.
  'footsteps-concrete': { seconds: 2, gen: (n, rnd) => mix(n, ...[0, 0.5, 1, 1.5].map((at, k) => [mix(len(0.2), [thump(len(0.2), rnd, 110, 0.03), 0.6], [shape(resonate(noise(len(0.2), rnd), 2800, 3), (i) => env(i, 0.0005, 0.025)), 0.7]), 0.9 - k * 0.04, len(at)] as [Float32Array, number, number])) },
  'footsteps-grass': { seconds: 2, gen: (n, rnd) => mix(n, ...[0, 0.5, 1, 1.5].map((at, k) => [shape(lowpass(noise(len(0.25), rnd), 3500), (i) => env(i, 0.01, 0.06) * (0.6 + 0.4 * Math.sin(i / 90))), 0.9 - k * 0.04, len(at)] as [Float32Array, number, number])) },
  'running-steps': { seconds: 1.6, gen: (n, rnd) => mix(n, ...[0, 0.28, 0.56, 0.84, 1.12, 1.4].map((at, k) => [thump(len(0.15), rnd, 140 + (k % 2) * 15, 0.03), 0.9, len(at)] as [Float32Array, number, number]), [shape(lowpass(noise(n, rnd), 1500), (i) => 0.08 * Math.sin((Math.PI * i) / n)), 1]) },
  'sit-on-sofa': { seconds: 0.9, gen: (n, rnd) => mix(n, [thump(n, rnd, 60, 0.18), 1], [shape(lowpass(noise(n, rnd), 1200), (i) => env(i, 0.02, 0.25)), 0.5], [shape(resonate(noise(n, rnd), 380, 20), (i) => env(Math.max(0, i - len(0.15)), 0.05, 0.2) * (i > len(0.15) ? 1 : 0)), 0.8]) },
  'clothes-rustle': { seconds: 0.8, gen: (n, rnd) => shape(resonate(noise(n, rnd), 4200, 1.5), (i) => Math.sin((Math.PI * i) / n) * (0.5 + 0.5 * Math.abs(Math.sin(i / 1800)))) },
  'body-fall': { seconds: 1, gen: (n, rnd) => mix(n, [thump(n, rnd, 55, 0.3), 1.3], [shape(lowpass(noise(n, rnd), 2000), (i) => env(i, 0.001, 0.12)), 0.7], [thump(n, rnd, 90, 0.08), 0.5, len(0.18)]) },
  // Objects.
  doorbell: { seconds: 1.6, gen: (n) => mix(n, [tone(n, () => 659.3, (i) => env(i, 0.002, 0.6)), 1], [tone(n, () => 523.3, (i) => env(i, 0.002, 0.8)), 1, len(0.5)]) },
  'pour-drink': { seconds: 2, gen: (n, rnd) => { const y = new Float32Array(n); const x = noise(n, rnd); for (let k = 0; k < 6; k++) { const r = resonate(x, 500 + k * 260 + 400 * (k % 2), 14); for (let i = 0; i < n; i++) y[i] = y[i]! + r[i]! * (0.5 + 0.5 * Math.sin(i / (300 + k * 97))); } return shape(y, (i) => Math.min(1, i / len(0.1), (n - i) / len(0.2))); } },
  'paper-rustle': { seconds: 0.9, gen: (n, rnd) => shape(resonate(noise(n, rnd), 5200, 1.2), (i) => Math.sin((Math.PI * i) / n) * (rnd() < 0.02 ? 1.8 : 1)) },
  'page-turn': { seconds: 0.6, gen: (n, rnd) => mix(n, [shape(resonate(noise(n, rnd), 3600, 1.5), (i) => Math.sin((Math.PI * i) / n) ** 2), 1], [shape(resonate(noise(n, rnd), 6000, 8), (i) => env(Math.max(0, i - len(0.45)), 0.001, 0.02) * (i > len(0.45) ? 1 : 0)), 0.8]) },
  'pen-click': { seconds: 0.3, gen: (n, rnd) => mix(n, [clink(n, 3400, 0.02), 1], [shape(resonate(noise(n, rnd), 5000, 8), (i) => env(i, 0.0002, 0.006)), 0.8], [clink(n, 2900, 0.02), 0.6, len(0.12)]) },
  'keyboard-typing': { seconds: 2, gen: (n, rnd) => { const parts: [Float32Array, number, number][] = []; let t = 0.02; let k = 0; while (t < 1.9) { parts.push([mix(len(0.06), [shape(resonate(noise(len(0.06), rnd), 2800 + (k % 3) * 400, 6), (i) => env(i, 0.0003, 0.008)), 1], [thump(len(0.06), rnd, 240, 0.01), 0.3]), 0.7 + 0.3 * rnd(), len(t)]); t += 0.08 + rnd() * 0.12; k++; } return mix(n, ...parts); } },
  'mouse-click': { seconds: 0.25, gen: (n, rnd) => mix(n, [shape(resonate(noise(n, rnd), 4200, 10), (i) => env(i, 0.0002, 0.004)), 1], [shape(resonate(noise(n, rnd), 3600, 10), (i) => env(i, 0.0002, 0.004)), 0.6, len(0.07)]) },
  'camera-shutter': { seconds: 0.4, gen: (n, rnd) => mix(n, [shape(resonate(noise(n, rnd), 3000, 4), (i) => env(i, 0.0003, 0.012)), 1], [thump(n, rnd, 320, 0.02), 0.4], [shape(resonate(noise(n, rnd), 2400, 4), (i) => env(i, 0.0003, 0.02)), 0.9, len(0.09)]) },
  zipper: { seconds: 0.9, gen: (n, rnd) => { const x = noise(n, rnd); return shape(resonate(x, 3200, 3), (i) => Math.sin((Math.PI * i) / n) * (0.5 + 0.5 * Math.sign(Math.sin((2 * Math.PI * (30 + 60 * i / n) * i) / SR)))); } },
  'glass-break': { seconds: 1.6, gen: (n, rnd) => mix(n, [shape(lowpass(noise(n, rnd), 9000), (i) => env(i, 0.0005, 0.05)), 1], ...[2800, 3700, 4900, 6100, 7600].map((f, k) => [clink(n, f, 0.25 + k * 0.05), 0.4, len(0.02 + k * 0.04 + rnd() * 0.05)] as [Float32Array, number, number])) },
  'kettle-whistle': { seconds: 2.5, gen: (n, rnd) => mix(n, [tone(n, (i) => 1800 + 300 * Math.min(1, i / len(1.2)) + 15 * Math.sin(i / 400), (i) => Math.min(1, i / len(0.8)) * Math.min(1, (n - i) / len(0.1))), 1], [shape(resonate(noise(n, rnd), 2000, 4), (i) => Math.min(1, i / len(0.8)) * 0.3), 0.6]) },
  'microwave-ding': { seconds: 1.4, gen: (n) => mix(n, [tone(n, () => 2093, (i) => env(i, 0.001, 0.5)), 1], [tone(n, () => 4186, (i) => env(i, 0.001, 0.2)), 0.25]) },
  'toaster-pop': { seconds: 0.6, gen: (n, rnd) => mix(n, [shape(resonate(noise(n, rnd), 1800, 6), (i) => env(i, 0.0003, 0.02)), 1], [clink(n, 1500, 0.08), 0.4], [thump(n, rnd, 260, 0.04), 0.5, len(0.18)]) },
  // Tech.
  'computer-startup': { seconds: 2.4, gen: (n) => mix(n, ...[261.6, 329.6, 392, 523.3].map((f) => [tone(n, () => f, (i) => Math.min(1, i / len(0.08)) * Math.exp(-i / len(1.4))), 0.5] as [Float32Array, number])) },
  'static-noise': { seconds: 2, gen: (n, rnd) => shape(noise(n, rnd), (i) => (0.6 + 0.4 * Math.sin(i / 4000)) * (rnd() < 0.002 ? 2 : 1)) },
  // Crowd (synthesised textures, not voices).
  applause: { seconds: 3, gen: (n, rnd) => { const parts: [Float32Array, number, number][] = []; for (let k = 0; k < 160; k++) parts.push([shape(resonate(noise(len(0.03), rnd), 1500 + rnd() * 2500, 2), (i) => env(i, 0.0003, 0.006)), 0.4 + rnd() * 0.6, len(rnd() * 2.9)]); return shape(mix(n, ...parts), (i) => Math.min(1, i / len(0.3), (n - i) / len(0.6))); } },
  'laugh-track': { seconds: 2.5, gen: (n, rnd) => { const y = new Float32Array(n); for (let v = 0; v < 8; v++) { const f = 180 + rnd() * 220; const r = 4 + rnd() * 3; const ph = rnd() * 6; const a = tone(n, (i) => f * (1 + 0.04 * Math.sin(i / 900)), (i) => Math.max(0, Math.sin((2 * Math.PI * r * i) / SR + ph)) ** 2 * Math.min(1, i / len(0.2)) * Math.exp(-i / len(1.6))); for (let i = 0; i < n; i++) y[i] = y[i]! + a[i]!; } return mix(n, [y, 0.4], [shape(lowpass(noise(n, rnd), 1800), (i) => Math.exp(-i / len(1.5))), 0.2]); } },
  'gasp-crowd': { seconds: 1.2, gen: (n, rnd) => shape(resonate(noise(n, rnd), 1300, 1.2), (i) => Math.min(1, i / len(0.08)) * Math.exp(-i / len(0.5))) },
  boo: { seconds: 2, gen: (n, rnd) => mix(n, ...[110, 130, 146, 165, 98].map((f) => [tone(n, (i) => f * (1 - 0.1 * i / n), (i) => Math.min(1, i / len(0.25)) * Math.min(1, (n - i) / len(0.4))), 0.3] as [Float32Array, number]), [shape(lowpass(noise(n, rnd), 600), () => 0.3), 1]) },
  cheer: { seconds: 2.4, gen: (n, rnd) => mix(n, [shape(resonate(noise(n, rnd), 1100, 1), (i) => Math.min(1, i / len(0.15)) * Math.exp(-i / len(1.8))), 1], ...[440, 520, 610].map((f) => [tone(n, (i) => f + 40 * Math.sin(i / 700), (i) => Math.min(1, i / len(0.1)) * Math.exp(-i / len(0.9))), 0.15] as [Float32Array, number])) },
  // Motion, cartoon and impacts.
  'zip-pass': { seconds: 0.5, gen: (n, rnd) => shape(resonate(noise(n, rnd), 2500, 3), (i) => Math.sin((Math.PI * i) / n) ** 4) },
  'slide-whistle': { seconds: 1.2, gen: (n) => tone(n, (i) => 500 + 900 * Math.sin((Math.PI * i) / n), (i) => Math.min(1, i / len(0.05), (n - i) / len(0.05)) * 0.8) },
  'punch-impact': { seconds: 0.5, gen: (n, rnd) => mix(n, [thump(n, rnd, 90, 0.08), 1.2], [shape(lowpass(noise(n, rnd), 4000), (i) => env(i, 0.0003, 0.03)), 0.9]) },
  crash: { seconds: 1.8, gen: (n, rnd) => mix(n, [thump(n, rnd, 60, 0.3), 1], [shape(lowpass(noise(n, rnd), 7000), (i) => env(i, 0.001, 0.4)), 0.9], ...[1900, 2700, 3900].map((f, k) => [clink(n, f, 0.4), 0.3, len(0.05 + k * 0.08)] as [Float32Array, number, number])) },
  'explosion-small': { seconds: 2, gen: (n, rnd) => mix(n, [thump(n, rnd, 45, 0.5), 1.5], [shape(lowpass(noise(n, rnd), 1500), (i) => env(i, 0.002, 0.6)), 1.2], [shape(lowpass(noise(n, rnd), 6000), (i) => env(i, 0.0005, 0.08)), 0.6]) },
  // Vocal sounds (breath and noise textures; not speech).
  'throat-clear': { seconds: 0.8, gen: (n, rnd) => mix(n, [shape(resonate(noise(n, rnd), 260, 4), (i) => env(i, 0.02, 0.12)), 1], [shape(resonate(noise(n, rnd), 320, 4), (i) => (i > len(0.3) ? env(i - len(0.3), 0.01, 0.1) : 0)), 1.2]) },
  sigh: { seconds: 1.4, gen: (n, rnd) => shape(resonate(lowpass(noise(n, rnd), 2200), 700, 1.5), (i) => Math.sin((Math.PI * i) / n) ** 1.5 * (1 - 0.4 * i / n)) },
  cough: { seconds: 0.7, gen: (n, rnd) => mix(n, [shape(resonate(noise(n, rnd), 420, 2), (i) => env(i, 0.003, 0.07)), 1], [shape(resonate(noise(n, rnd), 380, 2), (i) => (i > len(0.25) ? env(i - len(0.25), 0.003, 0.06) : 0)), 0.8]) },
  sniff: { seconds: 0.5, gen: (n, rnd) => shape(resonate(noise(n, rnd), 3800, 2), (i) => Math.sin((Math.PI * i) / n) ** 2 * (i < n * 0.5 ? 1 : 0.6)) },
  yawn: { seconds: 2.2, gen: (n, rnd) => mix(n, [shape(resonate(lowpass(noise(n, rnd), 1800), 600, 2), (i) => Math.sin((Math.PI * i) / n) ** 2), 1], [tone(n, (i) => 220 - 70 * i / n, (i) => Math.sin((Math.PI * i) / n) ** 3 * 0.15), 1]) },
  // Vehicles.
  'car-pass': { seconds: 3, gen: (n, rnd) => { const d = (i: number) => (i / n - 0.5) * 2; return mix(n, [shape(lowpass(noise(n, rnd), 900), (i) => 1 / (1 + 12 * d(i) ** 2)), 1], [tone(n, (i) => 90 * (1 - 0.15 * Math.tanh(d(i) * 3)), (i) => 0.5 / (1 + 12 * d(i) ** 2)), 1]); } },
  'car-horn': { seconds: 1, gen: (n) => mix(n, ...[392, 494].map((f) => [tone(n, () => f, (i) => (i / SR < 0.7 ? Math.min(1, (i / SR) * 100, (0.7 - i / SR) * 100) : 0)), 0.5] as [Float32Array, number]), ...[784, 988].map((f) => [tone(n, () => f, (i) => (i / SR < 0.7 ? 0.2 : 0)), 0.3] as [Float32Array, number])) },
  'bicycle-bell': { seconds: 1.2, gen: (n) => mix(n, [clink(n, 2900, 0.5), 1], [clink(n, 2900, 0.5), 0.8, len(0.15)]) },
  'train-horn': { seconds: 2.5, gen: (n) => mix(n, ...[311, 370, 466].map((f) => [tone(n, () => f, (i) => Math.min(1, i / len(0.1), (n - i) / len(0.3))), 0.35] as [Float32Array, number]), ...[622, 740].map((f) => [tone(n, () => f, (i) => Math.min(1, i / len(0.1), (n - i) / len(0.3)) * 0.3), 0.3] as [Float32Array, number])) },
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
