/**
 * Atmosphere (Catalog J1), effects (K1) and transitions (K2) as data for the engine's effect types
 * (packages/core/src/perform/fx.ts). Items whose look needs drawn artwork (traffic, crowds, trees, window frames) are
 * not authored here yet.
 */
import type { AtmoData, EffectData, TransitionData } from '../../packages/core/src/index.js';

const lum = (k: number): [number, number, number] => [0.2126 * k, 0.7152 * k, 0.0722 * k];
const desat = (amount: number): number[] => {
  const [r, g, b] = lum(amount);
  const s = 1 - amount;
  return [s + r, g, b, 0, 0, r, s + g, b, 0, 0, r, g, s + b, 0, 0, 0, 0, 0, 1, 0];
};

export const ATMOSPHERE: Record<string, AtmoData> = {
  'light-rain': { type: 'rain', density: 120, speed: 1.4, angle: 10, color: '#C9D8E8' },
  'heavy-rain': { type: 'rain', density: 420, speed: 2, angle: 16, color: '#B8C9DC' },
  'storm-with-lightning': { type: 'rain', density: 420, speed: 2.2, angle: 22, color: '#B8C9DC' },
  snow: { type: 'snow', density: 90, speed: 0.1, size: 5 },
  blizzard: { type: 'snow', density: 320, speed: 0.35, size: 4 },
  fog: { type: 'fog', density: 7, speed: 0.015, color: '#E8ECF0' },
  mist: { type: 'fog', density: 4, speed: 0.01, color: '#F4F6F8' },
  'wind-with-leaves': { type: 'particles', shape: 'leaf', density: 18, speed: 0.08, size: 7, color: '#C88A3A' },
  'wind-with-debris': { type: 'wind', density: 50, speed: 0.4, angle: 70, color: '#BFAF96', size: 30 },
  hail: { type: 'hail', density: 160, speed: 2.4, size: 6, color: '#EEF3F8' },
  'dust-motes': { type: 'particles', shape: 'glow', density: 40, speed: 0.01, size: 2, color: '#FFF1D0' },
  fireflies: { type: 'particles', shape: 'glow', density: 16, speed: 0.015, size: 3, color: '#F4FF8A', rise: true },
  'floating-petals': { type: 'particles', shape: 'petal', density: 16, speed: 0.06, size: 7, color: '#F6B6C8' },
  bubbles: { type: 'particles', shape: 'bubble', density: 18, speed: 0.08, size: 6, color: '#DDF3FF', rise: true },
  embers: { type: 'particles', shape: 'glow', density: 30, speed: 0.08, size: 2.5, color: '#FF8A3D', rise: true },
  confetti: { type: 'particles', shape: 'confetti', density: 60, speed: 0.15, size: 7 },
  smoke: { type: 'particles', shape: 'puff', density: 10, speed: 0.04, size: 10, color: '#8E8E93', rise: true },
  steam: { type: 'particles', shape: 'puff', density: 8, speed: 0.05, size: 8, color: '#FFFFFF', rise: true },
  sparkles: { type: 'particles', shape: 'spark', density: 24, speed: 0.01, size: 5, color: '#FFE9A8' },
  day: { type: 'light', color: '#FFF8E8', blend: 'soft-light' },
  'golden-hour': { type: 'light', color: '#FFB25C', blend: 'soft-light' },
  dusk: { type: 'light', color: '#8C6FB8', blend: 'multiply' },
  night: { type: 'light', color: '#2B3A66', blend: 'multiply' },
  moonlight: { type: 'light', color: '#9DB4FF', blend: 'multiply' },
  'neon-glow': { type: 'light', color: '#FF3FA4', blend: 'screen' },
  'window-light-shafts': { type: 'rays', density: 4, angle: 25, color: '#FFF4D6' },
  spotlight: { type: 'vignette', color: '#000000' },
  flicker: { type: 'flicker', color: '#000000' },
  'lightning-flash': { type: 'flash', lightning: 4, color: '#EAF2FF' },
  'colour-wash': { type: 'light', color: '#4F7CFF', blend: 'color' },
  vignette: { type: 'vignette', color: '#000000' },
  'god-rays': { type: 'rays', density: 6, angle: 15, color: '#FFFBEA' },
  'drifting-clouds': { type: 'clouds', density: 5, speed: 0.012, color: '#FFFFFF' },
  'rain-on-glass': { type: 'particles', shape: 'bubble', density: 30, speed: 0.03, size: 4, color: '#DCE8F4' },
  'warm-grade': { type: 'grade', matrix: [1.08, 0, 0, 0, 0.02, 0, 1.02, 0, 0, 0.01, 0, 0, 0.9, 0, 0, 0, 0, 0, 1, 0] },
  'cool-grade': { type: 'grade', matrix: [0.92, 0, 0, 0, 0, 0, 1, 0, 0, 0.01, 0, 0, 1.1, 0, 0.03, 0, 0, 0, 1, 0] },
  noir: { type: 'grade', matrix: (() => { const m = desat(1); return m.map((v, i) => (i % 5 === 4 ? -0.08 : i < 15 && i % 5 < 3 ? v * 1.25 : v)); })() },
  sepia: { type: 'grade', matrix: [0.393, 0.769, 0.189, 0, 0, 0.349, 0.686, 0.168, 0, 0, 0.272, 0.534, 0.131, 0, 0, 0, 0, 0, 1, 0] },
  pastel: { type: 'grade', matrix: (() => desat(0.35).map((v, i) => (i % 5 === 4 && i < 15 ? 0.08 : i % 5 < 3 && i < 15 ? v * 0.85 : v)))() },
  'high-contrast': { type: 'grade', matrix: [1.35, 0, 0, 0, -0.17, 0, 1.35, 0, 0, -0.17, 0, 0, 1.35, 0, -0.17, 0, 0, 0, 1, 0] },
  desaturated: { type: 'grade', matrix: desat(0.6) },
  'retro-vhs': { type: 'grade', matrix: [1.1, 0.05, 0, 0, 0.02, 0, 0.95, 0.05, 0, 0, 0.05, 0, 0.85, 0, 0.04, 0, 0, 0, 1, 0] },
};

export const EFFECTS: Record<string, EffectData> = {
  'impact-flash': { type: 'flash', color: '#FFFFFF' },
  'screen-flash': { type: 'flash', color: '#FFFFFF' },
  'impact-star': { type: 'star', color: '#FFE27A' },
  'dust-puff': { type: 'puff', color: '#D8D0C2' },
  'dash-puff': { type: 'puff', color: '#E8E2D6', size: 0.8 },
  'shockwave-ring': { type: 'ring', color: '#FFFFFF' },
  'speed-lines': { type: 'speed-lines' },
  'radial-focus-lines': { type: 'radial-lines' },
  'question-mark': { type: 'symbol', symbol: 'question' },
  exclamation: { type: 'symbol', symbol: 'exclamation' },
  hearts: { type: 'symbol', symbol: 'hearts' },
  'anger-mark': { type: 'symbol', symbol: 'anger' },
  'sweat-drops': { type: 'symbol', symbol: 'sweat' },
  sparkles: { type: 'symbol', symbol: 'sparkles' },
  'gloom-cloud': { type: 'symbol', symbol: 'gloom' },
  'light-bulb': { type: 'symbol', symbol: 'bulb' },
  zzz: { type: 'symbol', symbol: 'zzz' },
  'music-notes': { type: 'symbol', symbol: 'notes' },
  swirl: { type: 'symbol', symbol: 'swirl' },
  'ellipsis-dots': { type: 'symbol', symbol: 'ellipsis' },
  'spotlight-focus': { type: 'spotlight' },
  'dramatic-silhouette': { type: 'silhouette' },
  tint: { type: 'tint', color: '#4F7CFF' },
  'freeze-frame': { type: 'freeze' },
};

export const TRANSITIONS: Record<string, TransitionData> = {
  cut: { type: 'cut' },
  'fade-to-black': { type: 'fade', color: '#000000' },
  'fade-to-white': { type: 'fade', color: '#FFFFFF' },
  crossfade: { type: 'crossfade' },
  'wipe-left': { type: 'wipe', dir: 'left' },
  'wipe-right': { type: 'wipe', dir: 'right' },
  'wipe-up': { type: 'wipe', dir: 'up' },
  'wipe-down': { type: 'wipe', dir: 'down' },
  slide: { type: 'slide', dir: 'left' },
  push: { type: 'push', dir: 'left' },
  'iris-in': { type: 'iris' },
  'iris-out': { type: 'iris', out: true },
  'zoom-blur': { type: 'zoom' },
  'ink-splash': { type: 'shape', shape: 'blob' },
  glitch: { type: 'glitch' },
  'whip-blur': { type: 'zoom' },
  'shape-reveal': { type: 'shape', shape: 'star' },
};
