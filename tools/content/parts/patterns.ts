/**
 * Fabric patterns (Catalog B6, FR-WRD-02): repeating vector tiles drawn over patternable garments. Tiles are in tile
 * units with absolute M/L/C/Q/Z commands; p1…p3 are the pattern's own colours (garment colour shows between them).
 */
import type { PatternData } from '../../../packages/rig/src/types.js';

const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
const circle = (cx: number, cy: number, r: number) => {
  const k = r * 0.5523;
  return `M${cx + r} ${cy} C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} Z`;
};
const blob = (cx: number, cy: number, rx: number, ry: number, wob: number) => {
  // An irregular closed shape (camouflage, leopard spots) from four curved arcs.
  const p: [number, number][] = [[cx + rx, cy + wob], [cx - wob, cy + ry], [cx - rx, cy - wob], [cx + wob, cy - ry]];
  let d = `M${p[0]![0]} ${p[0]![1]}`;
  for (let i = 0; i < 4; i++) {
    const a = p[i]!, b = p[(i + 1) % 4]!;
    d += ` Q${(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.45} ${(a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.45} ${b[0]} ${b[1]}`;
  }
  return `${d} Z`;
};
const petal = (cx: number, cy: number, r: number, ang: number) => {
  const a = (ang * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a);
  const P = (x: number, y: number) => `${(cx + x * c - y * s).toFixed(2)} ${(cy + x * s + y * c).toFixed(2)}`;
  return `M${P(0, 0)} Q${P(r * 0.6, -r * 0.5)} ${P(r, 0)} Q${P(r * 0.6, r * 0.5)} ${P(0, 0)} Z`;
};

const C = (p1: string, p2 = '#FFFFFF', p3 = '#2B2D33') => ({ p1, p2, p3 });

export const PATTERNS: Record<string, PatternData> = {
  solid: { tile: [20, 20], layers: [], defaults: { scale: 1, rotation: 0, colors: C('#FFFFFF') } },
  stripes: { tile: [16, 16], layers: [{ color: 'p1', d: rect(0, 0, 16, 6) }], defaults: { scale: 1, rotation: 0, colors: C('#EFE7DA') } },
  pinstripe: { tile: [12, 12], layers: [{ color: 'p1', d: rect(5.5, 0, 1, 12), opacity: 0.8 }], defaults: { scale: 1, rotation: 0, colors: C('#D8D8DC') } },
  checks: { tile: [20, 20], layers: [{ color: 'p1', d: `${rect(0, 0, 10, 10)} ${rect(10, 10, 10, 10)}` }], defaults: { scale: 1, rotation: 0, colors: C('#EFE7DA') } },
  plaid: { tile: [32, 32], layers: [
    { color: 'p1', d: `${rect(0, 6, 32, 8)} ${rect(6, 0, 8, 32)}`, opacity: 0.55 },
    { color: 'p2', d: `${rect(0, 22, 32, 2)} ${rect(22, 0, 2, 32)}`, opacity: 0.8 },
  ], defaults: { scale: 1, rotation: 0, colors: C('#2B2D33', '#D9A441') } },
  houndstooth: { tile: [16, 16], layers: [{ color: 'p1', d: 'M0 0 L8 0 L8 4 L12 0 L16 0 L8 8 L8 16 L4 16 L8 12 L0 12 L0 8 L4 4 L0 4 Z' }], defaults: { scale: 0.9, rotation: 0, colors: C('#2B2D33') } },
  'polka-dots': { tile: [18, 18], stagger: true, layers: [{ color: 'p1', d: circle(9, 9, 3.2) }], defaults: { scale: 1, rotation: 0, colors: C('#FFFFFF') } },
  floral: { tile: [30, 30], stagger: true, layers: [
    { color: 'p1', d: [0, 72, 144, 216, 288].map((a) => petal(15, 15, 7, a)).join(' ') },
    { color: 'p2', d: circle(15, 15, 2) },
    { color: 'p3', d: `${petal(3, 27, 5, 200)} ${petal(27, 3, 5, 20)}`, opacity: 0.7 },
  ], defaults: { scale: 1, rotation: 0, colors: C('#E58FA5', '#F4D35E', '#5E8F5A') } },
  camouflage: { tile: [48, 48], layers: [
    { color: 'p1', d: `${blob(12, 12, 10, 7, 3)} ${blob(36, 30, 12, 8, -4)}` },
    { color: 'p2', d: `${blob(34, 8, 8, 5, 2)} ${blob(10, 36, 9, 7, -3)}` },
    { color: 'p3', d: `${blob(24, 22, 6, 4, 2)} ${blob(44, 44, 5, 4, 1)}` },
  ], defaults: { scale: 1, rotation: 0, colors: C('#5B6B3F', '#8C7B4F', '#2E3524') } },
  'denim-texture': { tile: [8, 8], blend: 'multiply', layers: [{ color: 'p1', d: 'M0 8 L8 0 L8 1.4 L1.4 8 Z', opacity: 0.35 }], defaults: { scale: 1, rotation: 0, colors: C('#9FB3CC') } },
  'knit-texture': { tile: [10, 12], blend: 'multiply', layers: [{ color: 'p1', d: 'M0 0 Q2.5 6 5 12 L5 10 Q2.5 5 1 0 Z M10 0 Q7.5 6 5 12 L5 10 Q7.5 5 9 0 Z', opacity: 0.35 }], defaults: { scale: 1, rotation: 0, colors: C('#B8A99A') } },
  leopard: { tile: [36, 36], stagger: true, layers: [
    { color: 'p1', d: `${blob(9, 9, 5, 4, 1.5)} ${blob(27, 24, 5.5, 4, -1.5)}`, opacity: 0.9 },
    { color: 'p2', d: `${blob(9, 9, 2.4, 1.8, 0.5)} ${blob(27, 24, 2.6, 1.8, -0.5)}` },
  ], defaults: { scale: 1, rotation: 0, colors: C('#3A2A1E', '#B9783A') } },
  paisley: { tile: [32, 32], stagger: true, layers: [
    { color: 'p1', d: 'M16 6 C24 6 26 16 20 22 C16 26 10 26 8 22 C6 18 10 16 13 18 C15 19 15 22 13 22 C16 20 20 16 18 12 C17 9 14 8 12 9 C13 7 14 6 16 6 Z' },
    { color: 'p2', d: circle(16, 15, 1.6) },
  ], defaults: { scale: 1, rotation: 0, colors: C('#7B5EA8', '#D9A441') } },
  'custom-print': { tile: [40, 40], image: true, layers: [], defaults: { scale: 1, rotation: 0, colors: C('#FFFFFF') } },
};
