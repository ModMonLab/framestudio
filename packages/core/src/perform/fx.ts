/**
 * Effects, atmosphere and transitions (FR-FX-01..04). Catalog items (J1 atmosphere, K1 effects, K2 transitions) are
 * data naming an engine effect type with parameters; this module draws them as display items in screen space so
 * preview and export render them identically. Every effect is a pure function of time (particles are positioned
 * from seeded random numbers and t, never simulated step by step), so seeking anywhere is exact.
 */
import type { ColorMatrix, Item } from '@frame/render';
import { prng } from '../ids.js';

/** Atmosphere (J1): weather, particles, lighting overlays, foreground and colour grades. */
export interface AtmoData {
  type: 'rain' | 'snow' | 'hail' | 'fog' | 'particles' | 'light' | 'vignette' | 'flash' | 'flicker' | 'rays' | 'grade' | 'clouds' | 'wind'
    | 'haze' | 'traffic' | 'crowd' | 'trees' | 'ripples' | 'city-lights' | 'screens' | 'fan' | 'plants' | 'curtain' | 'window-frame' | 'heads';
  /** Animated backgrounds draw behind the characters (after the back plane); everything else in front. */
  layer?: 'back' | 'front';
  color?: string;
  /** Particles per 1000 px² of frame (or layer count for fog/clouds). */
  density?: number;
  /** Fall/drift speed in frame heights per second. */
  speed?: number;
  /** Slant of rain/wind in degrees. */
  angle?: number;
  size?: number;
  /** Particle look: dot, glow, petal, bubble, confetti, spark, puff, leaf. */
  shape?: 'dot' | 'glow' | 'petal' | 'bubble' | 'confetti' | 'spark' | 'puff' | 'leaf';
  /** Particles rise instead of fall. */
  rise?: boolean;
  blend?: 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'color';
  /** Colour grade 4×5 matrix. */
  matrix?: ColorMatrix;
  /** Lightning every n seconds (storm). */
  lightning?: number;
}

/** Effects (K1): attached to the screen, a stage point or a character. */
export interface EffectData {
  type: 'symbol' | 'flash' | 'star' | 'ring' | 'puff' | 'speed-lines' | 'radial-lines' | 'tint' | 'spotlight' | 'silhouette' | 'freeze' | 'principle' | 'swoosh' | 'streak' | 'afterimage' | 'smear' | 'grade';
  symbol?: 'question' | 'exclamation' | 'hearts' | 'anger' | 'sweat' | 'sparkles' | 'gloom' | 'bulb' | 'zzz' | 'notes' | 'swirl' | 'ellipsis';
  color?: string;
  size?: number;
  /** Animation principle applied to the attached character (FR-ACT-09): squash/stretch, bounce, wobble. */
  principle?: 'anticipation' | 'squash' | 'overshoot' | 'bounce' | 'wobble' | 'jiggle' | 'follow-through' | 'ease';
  /** Treatments: a colour matrix applied to the picture (split tone). */
  matrix?: ColorMatrix;
}

/** How an animation-principle effect deforms its character at clip progress u (FR-ACT-09, Catalog K1). */
export interface Deform { sx: number; sy: number; rot: number; dy: number }

export function principleDeform(p: NonNullable<EffectData['principle']>, u: number, s: number, k: number): Deform {
  const d: Deform = { sx: 1, sy: 1, rot: 0, dy: 0 };
  const decay = 1 - u;
  switch (p) {
    case 'squash': {
      d.sy = 1 - 0.18 * Math.sin(TAU * u * 2) * decay * k;
      d.sx = 1 / d.sy;
      break;
    }
    case 'bounce': {
      d.dy = -Math.abs(Math.sin(Math.PI * u * 3)) * decay * 60 * k;
      const contact = Math.max(0, 1 - Math.abs(Math.sin(Math.PI * u * 3)) * 6);
      d.sy = 1 - 0.1 * contact * decay * k;
      d.sx = 1 / d.sy;
      break;
    }
    case 'wobble':
      d.rot = Math.sin(TAU * u * 4) * decay * 6 * k;
      break;
    case 'jiggle': {
      const j = Math.sin(TAU * s * 9) * 0.035 * decay * k;
      d.sx = 1 + j;
      d.sy = 1 - j;
      break;
    }
    case 'anticipation': {
      // Crouch before the move, then stretch into it.
      const v = u < 0.4 ? -0.12 * Math.sin((Math.PI * u) / 0.4) : 0.1 * Math.sin((Math.PI * (u - 0.4)) / 0.6);
      d.sy = 1 + v * k;
      d.sx = 1 / d.sy;
      break;
    }
    case 'overshoot': {
      const g = 1 + 0.15 * Math.exp(-5 * u) * Math.sin(TAU * u * 2.2) * k;
      d.sx = g;
      d.sy = g;
      break;
    }
    case 'follow-through':
      d.rot = 5 * k * Math.exp(-4 * u) * Math.sin(TAU * u * 3);
      break;
    case 'ease':
      break; // a time warp, applied to the character's performance (see evaluate.ts)
  }
  return d;
}

/** Slow in and out over a clip: the time a character's performance is sampled at (ease presets). */
export const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

/** Transitions (K2) between shots (and at a scene's first shot, from black). */
export interface TransitionData {
  type: 'cut' | 'fade' | 'crossfade' | 'wipe' | 'slide' | 'push' | 'iris' | 'zoom' | 'glitch' | 'shape' | 'page';
  color?: string;
  dir?: 'left' | 'right' | 'up' | 'down';
  /** Iris direction / shape reveal outline. */
  out?: boolean;
  shape?: 'circle' | 'star' | 'heart' | 'blob';
}

const TAU = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);

function hexToRgb(c: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Atmosphere layer at time s (seconds since the clip start), intensity 0…1 and seed. Screen space, w × h. */
export function atmosphereItems(a: AtmoData, w: number, h: number, s: number, k: number, seed: number): Item[] {
  if (k <= 0.001) return [];
  const scale = h / 1080;
  const color = a.color ?? '#FFFFFF';
  const rnd = prng(seed);
  const out: Item[] = [];
  const count = (perK: number) => Math.round(((w * h) / 1e6) * perK * k);
  switch (a.type) {
    case 'rain':
    case 'hail':
    case 'wind': {
      const n = count(a.density ?? 180);
      const speed = (a.speed ?? 1.6) * h;
      const ang = ((a.angle ?? 12) * Math.PI) / 180;
      const len = (a.size ?? (a.type === 'hail' ? 6 : 34)) * scale;
      let d = '';
      for (let i = 0; i < n; i++) {
        const x0 = rnd() * (w + h * Math.tan(ang)) - h * Math.tan(ang) * 0.5;
        const ph = rnd();
        const v = speed * (0.75 + rnd() * 0.5);
        const y = frac(ph + (s * v) / (h + len)) * (h + len) - len;
        const x = x0 + y * Math.tan(ang);
        if (a.type === 'hail') {
          out.push({ k: 'ellipse', cx: x, cy: y, rx: len / 2, ry: len / 2, fill: { color }, op: 0.85 });
        } else d += `M${x.toFixed(1)} ${y.toFixed(1)}L${(x + Math.sin(ang) * len).toFixed(1)} ${(y + Math.cos(ang) * len).toFixed(1)}`;
      }
      if (d) out.push({ k: 'path', d, stroke: { paint: { color }, width: Math.max(1, (a.type === 'wind' ? 3 : 1.6) * scale), cap: 'round', join: 'round' }, op: a.type === 'wind' ? 0.45 : 0.55 });
      break;
    }
    case 'snow':
    case 'particles': {
      const n = count(a.density ?? 60);
      const shape = a.type === 'snow' ? 'dot' : a.shape ?? 'dot';
      const size = (a.size ?? (a.type === 'snow' ? 5 : 4)) * scale;
      const speed = (a.speed ?? (a.type === 'snow' ? 0.12 : 0.05)) * h;
      for (let i = 0; i < n; i++) {
        const x0 = rnd() * w;
        const ph = rnd();
        const sway = (10 + rnd() * 30) * scale;
        const r = size * (0.5 + rnd());
        const v = speed * (0.6 + rnd() * 0.8);
        let y = frac(ph + (s * v) / (h + 4 * r)) * (h + 4 * r) - 2 * r;
        if (a.rise) y = h - y;
        const x = x0 + Math.sin(s * (0.6 + rnd()) + i) * sway;
        const tw = 0.5 + 0.5 * Math.sin(s * (2 + rnd() * 3) + i * 1.7);
        switch (shape) {
          case 'glow':
            out.push({ k: 'ellipse', cx: x, cy: y, rx: r * 3, ry: r * 3, fill: { radial: { center: [x, y], radius: r * 3, stops: [{ offset: 0, color }, { offset: 1, color: `${color}00` }] } }, op: 0.3 + 0.7 * tw, blend: 'screen' });
            break;
          case 'petal':
          case 'leaf':
          case 'confetti': {
            const rot = s * (1 + rnd() * 2) + i;
            const cx = Math.cos(rot) * r * 1.6;
            const cy = Math.sin(rot) * r * 0.8;
            const c = shape === 'confetti' ? ['#E5484D', '#F5B83D', '#3FB37F', '#4F7CFF', '#B86BFF'][i % 5]! : color;
            out.push({ k: 'path', d: `M${(x - cx).toFixed(1)} ${(y - cy).toFixed(1)}Q${(x + cy).toFixed(1)} ${(y - cx).toFixed(1)} ${(x + cx).toFixed(1)} ${(y + cy).toFixed(1)}Q${(x - cy).toFixed(1)} ${(y + cx).toFixed(1)} ${(x - cx).toFixed(1)} ${(y - cy).toFixed(1)}Z`, fill: { color: c }, op: 0.9 });
            break;
          }
          case 'bubble':
            out.push({ k: 'ellipse', cx: x, cy: y, rx: r * 2, ry: r * 2, stroke: { paint: { color }, width: Math.max(1, scale * 1.5) }, op: 0.6 });
            break;
          case 'spark':
            out.push({ k: 'path', d: star(x, y, r * 2.2, r * 0.5, 4), fill: { color }, op: tw });
            break;
          case 'puff':
            out.push({ k: 'ellipse', cx: x, cy: y, rx: r * 6, ry: r * 4, fill: { color }, op: 0.08 + 0.06 * tw });
            break;
          default:
            out.push({ k: 'ellipse', cx: x, cy: y, rx: r, ry: r, fill: { color }, op: a.type === 'snow' ? 0.9 : 0.35 + 0.5 * tw });
        }
      }
      break;
    }
    case 'fog':
    case 'clouds': {
      const n = Math.max(3, Math.round((a.density ?? 6) * (a.type === 'clouds' ? 1 : 1.5)));
      const speed = (a.speed ?? 0.02) * w;
      const items: Item[] = [];
      for (let i = 0; i < n; i++) {
        const y = a.type === 'clouds' ? h * (0.05 + rnd() * 0.3) : h * (0.35 + rnd() * 0.65);
        const rw = w * (0.25 + rnd() * 0.35);
        const x = frac(rnd() + (s * speed * (0.5 + rnd())) / (w + rw)) * (w + 2 * rw) - rw;
        items.push({ k: 'ellipse', cx: x, cy: y, rx: rw, ry: rw * (a.type === 'clouds' ? 0.28 : 0.18), fill: { color }, op: a.type === 'clouds' ? 0.85 : 0.35 });
      }
      out.push({ k: 'group', items, blur: (a.type === 'clouds' ? 18 : 40) * scale, op: Math.min(1, k) });
      return out;
    }
    case 'light':
      out.push({ k: 'rect', x: 0, y: 0, w, h, fill: { color }, op: 0.6 * k, ...(a.blend ? { blend: a.blend } : { blend: 'multiply' }) });
      return out;
    case 'haze': {
      // Heat shimmer: faint wavy bands drifting up from the ground.
      const items: Item[] = [];
      for (let i = 0; i < 9; i++) {
        const y0 = h * (1 - frac(rnd() + s * 0.08 * (0.6 + rnd() * 0.4)) * 0.6);
        let d = '';
        for (let x = 0; x <= w; x += w / 24) d += `${x ? 'L' : 'M'}${x.toFixed(1)} ${(y0 + Math.sin(x / (w * 0.06) + s * 3 + i) * h * 0.006).toFixed(1)}`;
        items.push({ k: 'path', d, stroke: { paint: { color }, width: h * 0.012, cap: 'round' }, op: 0.12 });
      }
      out.push({ k: 'group', items, blur: 6 * scale, op: Math.min(1, k) });
      return out;
    }
    case 'traffic': {
      // Distant cars passing both ways on a road band.
      const n = Math.max(2, Math.round(a.density ?? 6));
      for (let i = 0; i < n; i++) {
        const dir = i % 2 ? 1 : -1;
        const cw = w * (0.08 + rnd() * 0.04);
        const ch = cw * 0.32;
        const y = h * (0.6 + (i % 2) * 0.04);
        const x = frac(rnd() + (s * (a.speed ?? 0.12) * (0.7 + rnd() * 0.6) * dir)) * (w + 2 * cw) - cw;
        const body = ['#3A4150', '#6B2E34', '#2E4A6B', '#7A7A7A', '#C9A13A'][Math.floor(rnd() * 5)]!;
        out.push({ k: 'group', op: 0.85 * Math.min(1, k), items: [
          { k: 'rect', x, y: y - ch, w: cw, h: ch * 0.6, r: ch * 0.2, fill: { color: body } },
          { k: 'rect', x: x + cw * 0.2, y: y - ch * 1.35, w: cw * 0.55, h: ch * 0.45, r: ch * 0.15, fill: { color: body } },
          { k: 'ellipse', cx: x + cw * 0.22, cy: y - ch * 0.38, rx: ch * 0.2, ry: ch * 0.2, fill: { color: '#141414' } },
          { k: 'ellipse', cx: x + cw * 0.78, cy: y - ch * 0.38, rx: ch * 0.2, ry: ch * 0.2, fill: { color: '#141414' } },
        ] });
      }
      return out;
    }
    case 'crowd':
    case 'heads': {
      // Silhouettes: a background crowd bobbing on the back plane, or big heads in the foreground.
      const fg = a.type === 'heads';
      const n = fg ? 5 : Math.max(6, Math.round(a.density ?? 14));
      const items: Item[] = [];
      for (let i = 0; i < n; i++) {
        const r = fg ? h * (0.12 + rnd() * 0.05) : h * (0.025 + rnd() * 0.01);
        const x = ((i + 0.5) / n) * w + (rnd() - 0.5) * (w / n) * 0.6;
        const base = fg ? h * 1.04 : h * (0.66 + rnd() * 0.03);
        const bob = Math.abs(Math.sin(s * (1.6 + rnd()) + i)) * r * (fg ? 0.15 : 0.35);
        const y = base - bob;
        items.push({ k: 'ellipse', cx: x, cy: y - r * (fg ? 1.4 : 2.6), rx: r, ry: r * 1.1, fill: { color } });
        items.push({ k: 'ellipse', cx: x, cy: y, rx: r * 2, ry: r * (fg ? 1.4 : 1.8), fill: { color } });
      }
      out.push({ k: 'group', items, op: (fg ? 0.92 : 0.55) * Math.min(1, k), ...(fg ? { blur: 2 * scale } : {}) });
      return out;
    }
    case 'trees': {
      const n = Math.max(2, Math.round(a.density ?? 5));
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * w + (rnd() - 0.5) * (w / n) * 0.5;
        const ht = h * (0.25 + rnd() * 0.15);
        const base = h * 0.66;
        const sway = Math.sin(s * (0.9 + rnd() * 0.5) + i) * 3;
        const rot = (sway * Math.PI) / 180;
        const [c, sn] = [Math.cos(rot), Math.sin(rot)];
        out.push({ k: 'group', tf: [c, sn, -sn, c, x - x * c + base * sn, base - x * sn - base * c], op: 0.8 * Math.min(1, k), items: [
          { k: 'rect', x: x - ht * 0.03, y: base - ht * 0.45, w: ht * 0.06, h: ht * 0.45, fill: { color: '#4A3A2C' } },
          { k: 'ellipse', cx: x, cy: base - ht * 0.68, rx: ht * 0.28, ry: ht * 0.34, fill: { color } },
          { k: 'ellipse', cx: x - ht * 0.15, cy: base - ht * 0.55, rx: ht * 0.2, ry: ht * 0.22, fill: { color } },
          { k: 'ellipse', cx: x + ht * 0.16, cy: base - ht * 0.57, rx: ht * 0.2, ry: ht * 0.22, fill: { color } },
        ] });
      }
      return out;
    }
    case 'ripples': {
      const n = count(a.density ?? 40);
      const items: Item[] = [];
      for (let i = 0; i < n; i++) {
        const y = h * (0.7 + rnd() * 0.3);
        const x = frac(rnd() + s * 0.02 * (rnd() - 0.5)) * w;
        const len = w * (0.02 + rnd() * 0.05) * (0.6 + 0.4 * Math.sin(s * 2 + i));
        items.push({ k: 'path', d: `M${(x - len).toFixed(1)} ${y.toFixed(1)}L${(x + len).toFixed(1)} ${y.toFixed(1)}`, stroke: { paint: { color }, width: Math.max(1, 2.2 * scale), cap: 'round' }, op: 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(s * 3 + i * 1.7)) });
      }
      out.push({ k: 'group', items, op: Math.min(1, k) });
      return out;
    }
    case 'city-lights': {
      const n = count(a.density ?? 60);
      const items: Item[] = [];
      for (let i = 0; i < n; i++) {
        const x = rnd() * w;
        const y = h * (0.15 + rnd() * 0.45);
        const tw = 0.5 + 0.5 * Math.sin(s * (1 + rnd() * 3) + i * 2.1);
        const r = (1.6 + rnd() * 2.4) * scale;
        items.push({ k: 'ellipse', cx: x, cy: y, rx: r, ry: r, fill: { color: rnd() < 0.3 ? '#FFD27A' : color }, op: 0.35 + 0.65 * tw });
      }
      out.push({ k: 'group', items, op: Math.min(1, k) });
      return out;
    }
    case 'screens': {
      const n = Math.max(2, Math.round(a.density ?? 6));
      for (let i = 0; i < n; i++) {
        const sw = w * (0.06 + rnd() * 0.05);
        const sh = sw * 0.62;
        const x = ((i + 0.5) / n) * w - sw / 2;
        const y = h * (0.28 + rnd() * 0.2);
        const hue = ['#3C7DD9', '#3CB371', '#D9A23C', '#8A5CD9'][Math.floor(rnd() * 4)]!;
        const flick = 0.65 + 0.35 * Math.sin(s * (5 + rnd() * 6) + i);
        out.push({ k: 'group', op: Math.min(1, k), items: [
          { k: 'rect', x: x - sw * 0.04, y: y - sw * 0.04, w: sw * 1.08, h: sh + sw * 0.08, r: sw * 0.03, fill: { color: '#1E2026' } },
          { k: 'rect', x, y, w: sw, h: sh, fill: { color: hue }, op: flick },
          ...[0.25, 0.45, 0.65].map((f) => ({ k: 'rect' as const, x: x + sw * 0.1, y: y + sh * f, w: sw * (0.4 + frac(f * 7 + Math.floor(s * 2) * 0.37) * 0.45), h: sh * 0.07, fill: { color: '#FFFFFF' }, op: 0.55 })),
        ] });
      }
      return out;
    }
    case 'fan': {
      // A ceiling fan at the top of the frame, blades turning (seen from below at an angle).
      const cx = w / 2;
      const cy = h * 0.08;
      const R = h * 0.22;
      const items: Item[] = [{ k: 'rect', x: cx - h * 0.006, y: 0, w: h * 0.012, h: cy, fill: { color } }];
      for (let i = 0; i < 4; i++) {
        const ang = s * (a.speed ?? 6) + (i * Math.PI) / 2;
        const bx = Math.cos(ang) * R * 0.55;
        const by = Math.sin(ang) * R * 0.55 * 0.22;
        items.push({ k: 'ellipse', cx: cx + bx, cy: cy + by, rx: Math.abs(Math.cos(ang)) * R * 0.48 + R * 0.06, ry: R * 0.06, fill: { color } });
      }
      items.push({ k: 'ellipse', cx, cy, rx: h * 0.035, ry: h * 0.022, fill: { color: '#2A2A2E' } });
      out.push({ k: 'group', items, op: 0.95 * Math.min(1, k) });
      return out;
    }
    case 'plants': {
      // Out-of-focus leaves in the bottom corners.
      const items: Item[] = [];
      for (const side of [0, 1]) for (let i = 0; i < 5; i++) {
        const bx = side ? w * (1.02 - rnd() * 0.12) : w * (-0.02 + rnd() * 0.12);
        const by = h * 1.05;
        const len = h * (0.3 + rnd() * 0.25);
        const ang = (side ? -1 : 1) * (0.4 + rnd() * 0.6) + Math.sin(s * 0.8 + i) * 0.04 - Math.PI / 2;
        const tx = bx + Math.cos(ang) * len;
        const ty = by + Math.sin(ang) * len;
        const nx = -Math.sin(ang) * len * 0.18;
        const ny = Math.cos(ang) * len * 0.18;
        items.push({ k: 'path', d: `M${bx.toFixed(1)} ${by.toFixed(1)}Q${((bx + tx) / 2 + nx).toFixed(1)} ${((by + ty) / 2 + ny).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}Q${((bx + tx) / 2 - nx).toFixed(1)} ${((by + ty) / 2 - ny).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}Z`, fill: { color: i % 2 ? color : '#2F5A34' } });
      }
      out.push({ k: 'group', items, blur: 14 * scale, op: 0.95 * Math.min(1, k) });
      return out;
    }
    case 'curtain': {
      // A curtain edge on the left with soft folds, swaying a little.
      const cw = w * 0.16;
      const items: Item[] = [];
      for (let i = 0; i < 4; i++) {
        const x = (i / 4) * cw;
        const sway = Math.sin(s * 0.7 + i) * w * 0.004;
        items.push({ k: 'path', d: `M${x.toFixed(1)} 0L${(x + cw / 4 + 1).toFixed(1)} 0L${(x + cw / 4 + sway * 2).toFixed(1)} ${h}L${(x + sway).toFixed(1)} ${h}Z`, fill: { color: i % 2 ? color : shadeHex(color, 0.8) } });
      }
      out.push({ k: 'group', items, op: 0.97 * Math.min(1, k) });
      return out;
    }
    case 'window-frame': {
      const bw = h * 0.04;
      const items: Item[] = [
        { k: 'rect', x: 0, y: 0, w, h: bw, fill: { color } }, { k: 'rect', x: 0, y: h - bw, w, h: bw, fill: { color } },
        { k: 'rect', x: 0, y: 0, w: bw, h, fill: { color } }, { k: 'rect', x: w - bw, y: 0, w: bw, h, fill: { color } },
        { k: 'rect', x: w / 2 - bw * 0.35, y: 0, w: bw * 0.7, h, fill: { color } }, { k: 'rect', x: 0, y: h * 0.45 - bw * 0.35, w, h: bw * 0.7, fill: { color } },
      ];
      out.push({ k: 'group', items, op: Math.min(1, k) });
      return out;
    }
    case 'vignette':
      out.push({ k: 'rect', x: 0, y: 0, w, h, fill: { radial: { center: [w / 2, h / 2], radius: Math.hypot(w, h) / 2, stops: [{ offset: 0.45, color: '#00000000' }, { offset: 1, color: a.color ?? '#000000' }] } }, op: 0.85 * k });
      return out;
    case 'flash': {
      // Lightning flashes at seeded times.
      const every = a.lightning ?? 5;
      const cycle = Math.floor(s / every);
      const at = cycle * every + prng(seed + cycle)() * every * 0.6;
      const d = s - at;
      const v = d >= 0 && d < 0.35 ? (d < 0.06 ? 1 : d < 0.12 ? 0.3 : d < 0.18 ? 0.8 : Math.max(0, 1 - (d - 0.18) / 0.17)) : 0;
      if (v > 0) out.push({ k: 'rect', x: 0, y: 0, w, h, fill: { color }, op: 0.7 * v * k, blend: 'screen' });
      return out;
    }
    case 'flicker': {
      const v = 0.5 + 0.5 * Math.sin(s * 23 + Math.sin(s * 7) * 4);
      out.push({ k: 'rect', x: 0, y: 0, w, h, fill: { color: a.color ?? '#000000' }, op: 0.25 * v * k });
      return out;
    }
    case 'rays': {
      const n = a.density ?? 5;
      let d = '';
      for (let i = 0; i < n; i++) {
        const x = w * (0.15 + 0.7 * (i / Math.max(1, n - 1))) + Math.sin(s * 0.3 + i) * 20 * scale;
        const bw = w * (0.03 + rnd() * 0.05);
        const dx = h * Math.tan(((a.angle ?? 20) * Math.PI) / 180);
        d += `M${x} 0L${x + bw} 0L${x + bw + dx} ${h}L${x + dx - bw} ${h}Z`;
      }
      out.push({ k: 'group', items: [{ k: 'path', d, fill: { color } }], blur: 24 * scale, op: 0.35 * k, blend: 'screen' });
      return out;
    }
    case 'grade':
      return out; // applied as a colour matrix around the frame (gradeMatrix)
  }
  return out.length ? [{ k: 'group', items: out, op: Math.min(1, 0.4 + 0.6 * k) }] : [];
}

/** Colour matrix for a grade at intensity k (identity at 0). */
export function gradeMatrix(a: AtmoData, k: number): ColorMatrix | undefined {
  if (a.type !== 'grade' || !a.matrix) return undefined;
  const id = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  return a.matrix.map((v, i) => id[i]! + (v - id[i]!) * Math.min(1, k));
}

export function star(cx: number, cy: number, r1: number, r2: number, points: number): string {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }
  return `${d}Z`;
}

const heart = (cx: number, cy: number, r: number) => `M${cx} ${cy + r * 0.9}C${cx - r * 1.6} ${cy - r * 0.1} ${cx - r * 0.7} ${cy - r * 1.3} ${cx} ${cy - r * 0.45}C${cx + r * 0.7} ${cy - r * 1.3} ${cx + r * 1.6} ${cy - r * 0.1} ${cx} ${cy + r * 0.9}Z`;

/**
 * An effect at (x, y) in screen space with size unit r (≈ a head height), u = clip progress 0…1, s = seconds since
 * the clip start, k = intensity. Screen effects ignore x/y.
 */
export function effectItems(e: EffectData, x: number, y: number, r: number, w: number, h: number, u: number, s: number, k: number, seed: number): Item[] {
  if (k <= 0.001) return [];
  const pop = Math.min(1, u * 8) * (u > 0.85 ? Math.max(0, (1 - u) / 0.15) : 1); // pop in, fade out
  const grow = 1 + 0.25 * Math.max(0, 1 - u * 6) * Math.sin(u * 40); // little overshoot
  const color = e.color ?? '#FFFFFF';
  const ink = '#1A1A1A';
  const line = (wd: number) => ({ paint: { color: ink }, width: wd, cap: 'round' as const, join: 'round' as const });
  const rr = r * (e.size ?? 1) * grow;
  switch (e.type) {
    case 'symbol': {
      const items: Item[] = [];
      const bob = Math.sin(s * 4) * rr * 0.04;
      const cy = y + bob;
      switch (e.symbol) {
        case 'question':
        case 'exclamation':
        case 'zzz':
          items.push({ k: 'text', text: e.symbol === 'question' ? '?' : e.symbol === 'exclamation' ? '!' : 'Z z z', x, y: cy, size: rr * (e.symbol === 'zzz' ? 0.45 : 0.9), family: 'Inter', weight: 800, color: e.color ?? (e.symbol === 'zzz' ? '#8AA4FF' : '#F5B83D'), align: 'center', valign: 'bottom', outline: { color: ink, width: rr * 0.05 } });
          break;
        case 'hearts':
          for (let i = 0; i < 3; i++) {
            const t = frac(s * 0.7 + i / 3);
            items.push({ k: 'path', d: heart(x + (i - 1) * rr * 0.4 + Math.sin(t * 6 + i) * rr * 0.08, cy - t * rr * 0.8, rr * 0.18), fill: { color: e.color ?? '#E5484D' }, op: 1 - t });
          }
          break;
        case 'anger': {
          const a = rr * 0.22;
          items.push({ k: 'path', d: `M${x - a} ${cy - a * 0.3}Q${x - a * 0.3} ${cy - a * 0.3} ${x - a * 0.3} ${cy - a}M${x + a * 0.3} ${cy - a}Q${x + a * 0.3} ${cy - a * 0.3} ${x + a} ${cy - a * 0.3}M${x + a} ${cy + a * 0.3}Q${x + a * 0.3} ${cy + a * 0.3} ${x + a * 0.3} ${cy + a}M${x - a * 0.3} ${cy + a}Q${x - a * 0.3} ${cy + a * 0.3} ${x - a} ${cy + a * 0.3}`, stroke: { paint: { color: e.color ?? '#E5484D' }, width: rr * 0.07, cap: 'round', join: 'round' } });
          break;
        }
        case 'sweat':
          for (let i = 0; i < 2; i++) {
            const t = frac(s * 0.8 + i * 0.5);
            const dx = x + (i ? rr * 0.25 : 0);
            const dy = cy + t * rr * 0.4;
            items.push({ k: 'path', d: `M${dx} ${dy - rr * 0.12}Q${dx + rr * 0.08} ${dy} ${dx} ${dy + rr * 0.05}Q${dx - rr * 0.08} ${dy} ${dx} ${dy - rr * 0.12}Z`, fill: { color: e.color ?? '#8FD3FF' }, stroke: line(rr * 0.015), op: 1 - t * 0.6 });
          }
          break;
        case 'sparkles':
          for (let i = 0; i < 4; i++) {
            const tw = 0.5 + 0.5 * Math.sin(s * 6 + i * 2);
            const ang = (i / 4) * TAU + 0.4;
            items.push({ k: 'path', d: star(x + Math.cos(ang) * rr * 0.45, cy + Math.sin(ang) * rr * 0.3, rr * 0.13 * (0.6 + tw), rr * 0.03, 4), fill: { color: e.color ?? '#FFE27A' }, op: 0.4 + 0.6 * tw });
          }
          break;
        case 'gloom': {
          const c = e.color ?? '#5B6170';
          items.push({ k: 'ellipse', cx: x - rr * 0.18, cy, rx: rr * 0.25, ry: rr * 0.16, fill: { color: c } }, { k: 'ellipse', cx: x + rr * 0.15, cy: cy - rr * 0.04, rx: rr * 0.28, ry: rr * 0.19, fill: { color: c } });
          let d = '';
          for (let i = 0; i < 4; i++) {
            const t = frac(s * 1.5 + i / 4);
            const dx = x - rr * 0.25 + i * rr * 0.17;
            d += `M${dx} ${cy + rr * 0.18 + t * rr * 0.3}l-3 ${rr * 0.08}`;
          }
          items.push({ k: 'path', d, stroke: { paint: { color: '#7FA8D9' }, width: rr * 0.025, cap: 'round' } });
          break;
        }
        case 'bulb': {
          const glow = 0.6 + 0.4 * Math.sin(s * 5);
          items.push({ k: 'ellipse', cx: x, cy, rx: rr * 0.5, ry: rr * 0.5, fill: { color: '#FFF3B0' }, op: 0.35 * glow, blend: 'screen' });
          items.push({ k: 'ellipse', cx: x, cy, rx: rr * 0.22, ry: rr * 0.24, fill: { color: e.color ?? '#FFE27A' }, stroke: line(rr * 0.025) });
          items.push({ k: 'rect', x: x - rr * 0.09, y: cy + rr * 0.2, w: rr * 0.18, h: rr * 0.12, fill: { color: '#9AA0A6' }, stroke: line(rr * 0.02) });
          break;
        }
        case 'notes':
          for (let i = 0; i < 2; i++) {
            const t = frac(s * 0.6 + i * 0.5);
            const nx = x + (i - 0.5) * rr * 0.5 + Math.sin(t * 8) * rr * 0.06;
            const ny = cy - t * rr * 0.6;
            items.push({ k: 'ellipse', cx: nx, cy: ny, rx: rr * 0.08, ry: rr * 0.06, fill: { color: e.color ?? ink }, op: 1 - t }, { k: 'path', d: `M${nx + rr * 0.07} ${ny}L${nx + rr * 0.07} ${ny - rr * 0.28}L${nx + rr * 0.18} ${ny - rr * 0.22}`, stroke: { paint: { color: e.color ?? ink }, width: rr * 0.025, cap: 'round', join: 'round' }, op: 1 - t });
          }
          break;
        case 'swirl': {
          let d = '';
          const rot = s * 4;
          for (let i = 0; i <= 40; i++) {
            const a = rot + (i / 40) * TAU * 2.2;
            const rad = (i / 40) * rr * 0.3;
            d += `${i ? 'L' : 'M'}${(x + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad * 0.7).toFixed(1)}`;
          }
          items.push({ k: 'path', d, stroke: { paint: { color: e.color ?? '#8C6BFF' }, width: rr * 0.035, cap: 'round', join: 'round' } });
          break;
        }
        case 'ellipsis':
          for (let i = 0; i < 3; i++) {
            const on = frac(s * 1.4) * 3 > i;
            items.push({ k: 'ellipse', cx: x + (i - 1) * rr * 0.18, cy, rx: rr * 0.05, ry: rr * 0.05, fill: { color: e.color ?? ink }, op: on ? 1 : 0.25 });
          }
          break;
      }
      return [{ k: 'group', items, op: pop * Math.min(1, k) }];
    }
    case 'flash':
      return [{ k: 'rect', x: 0, y: 0, w, h, fill: { color }, op: Math.max(0, 1 - u * 1.4) * 0.85 * k, blend: 'screen' }];
    case 'star':
      return [{ k: 'path', d: star(x, y, rr * 0.6 * (0.6 + u), rr * 0.25 * (0.6 + u), 8), fill: { color: e.color ?? '#FFE27A' }, stroke: line(rr * 0.03), op: Math.max(0, 1 - u) * k }];
    case 'ring':
      return [{ k: 'ellipse', cx: x, cy: y, rx: rr * 1.6 * u, ry: rr * 0.6 * u, stroke: { paint: { color }, width: rr * 0.08 * (1 - u) + 1 }, op: Math.max(0, 1 - u) * k }];
    case 'puff': {
      const rnd = prng(seed);
      const items: Item[] = [];
      for (let i = 0; i < 6; i++) {
        const a = rnd() * TAU;
        const d = rr * (0.2 + u * 0.6) * (0.6 + rnd() * 0.4);
        items.push({ k: 'ellipse', cx: x + Math.cos(a) * d, cy: y + Math.sin(a) * d * 0.4, rx: rr * (0.12 + u * 0.15), ry: rr * (0.1 + u * 0.12), fill: { color: e.color ?? '#D8D0C2' } });
      }
      return [{ k: 'group', items, op: Math.max(0, 1 - u) * k }];
    }
    case 'speed-lines': {
      const rnd = prng(seed);
      let d = '';
      for (let i = 0; i < 26; i++) {
        const ly = rnd() * h;
        const lx = frac(rnd() + s * (1.5 + rnd())) * (w * 1.4) - w * 0.2;
        d += `M${lx.toFixed(1)} ${ly.toFixed(1)}L${(lx + w * (0.15 + rnd() * 0.2)).toFixed(1)} ${ly.toFixed(1)}`;
      }
      return [{ k: 'path', d, stroke: { paint: { color: e.color ?? '#FFFFFF' }, width: Math.max(1, h / 300), cap: 'round' }, op: 0.6 * k * pop }];
    }
    case 'radial-lines': {
      const rnd = prng(seed + Math.floor(s * 12));
      let d = '';
      const R = Math.hypot(w, h) / 2;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * TAU + rnd() * 0.05;
        const r0 = R * (0.55 + rnd() * 0.2);
        d += `M${(w / 2 + Math.cos(a) * R).toFixed(1)} ${(h / 2 + Math.sin(a) * R).toFixed(1)}L${(w / 2 + Math.cos(a) * r0).toFixed(1)} ${(h / 2 + Math.sin(a) * r0).toFixed(1)}`;
      }
      return [{ k: 'path', d, stroke: { paint: { color: e.color ?? ink }, width: Math.max(1.5, h / 220), cap: 'round' }, op: 0.75 * k * pop }];
    }
    case 'tint':
      return [{ k: 'rect', x: 0, y: 0, w, h, fill: { color: e.color ?? '#4F7CFF' }, op: 0.35 * k * pop, blend: 'color' }];
    case 'swoosh': {
      // A crescent of motion behind the attached point.
      const R = rr * 2.2;
      const a0 = Math.PI * (0.6 + u * 0.3);
      const a1 = a0 + Math.PI * 0.9;
      const p = (a: number, rad: number) => `${(x + Math.cos(a) * rad).toFixed(1)} ${(y + Math.sin(a) * rad).toFixed(1)}`;
      const d = `M${p(a0, R)}A${R} ${R} 0 0 1 ${p(a1, R)}A${R * 0.82} ${R * 0.82} 0 0 0 ${p(a0, R * 0.9)}Z`;
      return [{ k: 'path', d, fill: { color }, op: 0.75 * k * pop }];
    }
    case 'streak': {
      // Motion-blur streaks trailing the attached point.
      const rnd = prng(seed);
      const items: Item[] = [];
      for (let i = 0; i < 7; i++) {
        const yy = y + (rnd() - 0.5) * rr * 2.4;
        const len = rr * (1.5 + rnd() * 2.5);
        const x0 = x - rr * 0.8 - rnd() * rr * 0.6;
        items.push({ k: 'path', d: `M${x0.toFixed(1)} ${yy.toFixed(1)}L${(x0 - len).toFixed(1)} ${yy.toFixed(1)}`, stroke: { paint: { color }, width: Math.max(1.5, rr * 0.06), cap: 'round' }, op: (0.35 + rnd() * 0.4) * k * pop });
      }
      return items;
    }
    case 'spotlight': {
      const R = Math.max(rr * 1.6, h * 0.18);
      const d = `M0 0L${w} 0L${w} ${h}L0 ${h}ZM${x - R} ${y}A${R} ${R} 0 1 0 ${x + R} ${y}A${R} ${R} 0 1 0 ${x - R} ${y}Z`;
      return [{ k: 'path', d, fill: { color: '#000000' }, evenOdd: true, op: 0.7 * k * pop }];
    }
    default:
      return []; // silhouette, freeze and principles change how other things draw (see evaluate.ts)
  }
}

/** Black silhouette colour matrix (treatment). */
export const SILHOUETTE_MATRIX: ColorMatrix = [0, 0, 0, 0, 0.05, 0, 0, 0, 0, 0.05, 0, 0, 0, 0, 0.08, 0, 0, 0, 1, 0];

/**
 * Composites a transition between the previous shot's picture A and the current shot's picture B at progress u
 * (0 → all A, 1 → all B). A may be empty at a scene's first shot (fades come up from the colour).
 */
export function transitionItems(tr: TransitionData, a: Item[], b: Item[], u: number, w: number, h: number, focus: [number, number] = [w / 2, h / 2]): Item[] {
  const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  const grp = (items: Item[], extra: Partial<Extract<Item, { k: 'group' }>> = {}): Item => ({ k: 'group', items, ...extra });
  const rect = (x: number, y: number, rw: number, rh: number) => `M${x} ${y}L${x + rw} ${y}L${x + rw} ${y + rh}L${x} ${y + rh}Z`;
  const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
  const dir = tr.dir ?? 'left';
  switch (tr.type) {
    case 'cut':
      return b;
    case 'fade': {
      const color = tr.color ?? '#000000';
      if (u < 0.5) return [grp(a), { k: 'rect', x: 0, y: 0, w, h, fill: { color }, op: Math.min(1, u * 2) }];
      return [grp(b), { k: 'rect', x: 0, y: 0, w, h, fill: { color }, op: Math.min(1, (1 - u) * 2) }];
    }
    case 'crossfade':
      return [grp(a), grp(b, { op: e })];
    case 'wipe': {
      const r = dir === 'left' ? rect(w * (1 - e), 0, w * e, h) : dir === 'right' ? rect(0, 0, w * e, h) : dir === 'up' ? rect(0, h * (1 - e), w, h * e) : rect(0, 0, w, h * e);
      return [grp(a), grp(b, { clip: r })];
    }
    case 'slide':
    case 'push': {
      const [dx, dy] = dir === 'left' ? [w, 0] : dir === 'right' ? [-w, 0] : dir === 'up' ? [0, h] : [0, -h];
      const bIn = grp(b, { tf: [1, 0, 0, 1, dx * (1 - e), dy * (1 - e)] });
      return tr.type === 'push' ? [grp(a, { tf: [1, 0, 0, 1, -dx * e, -dy * e] }), bIn] : [grp(a), bIn];
    }
    case 'iris': {
      const R = Math.hypot(w, h);
      if (tr.out) return [grp(b), grp(a, { clip: circle(focus[0], focus[1], R * (1 - e)) })];
      return [grp(a), grp(b, { clip: circle(focus[0], focus[1], R * e) })];
    }
    case 'zoom': {
      const sA = 1 + e * 0.6;
      const sB = 1.6 - e * 0.6;
      const z = (s: number): [number, number, number, number, number, number] => [s, 0, 0, s, (w / 2) * (1 - s), (h / 2) * (1 - s)];
      return u < 0.5 ? [grp(a, { tf: z(sA), blur: e * 12 })] : [grp(b, { tf: z(sB), blur: (1 - e) * 12 })];
    }
    case 'glitch': {
      const band = Math.floor(u * 9) % 2;
      const off = Math.sin(u * 50) * w * 0.03;
      return [grp(band ? b : a, { tf: [1, 0, 0, 1, off, 0] }), grp(band ? a : b, { clip: rect(0, h * frac(u * 3.7), w, h * 0.12), tf: [1, 0, 0, 1, -off, 0] })];
    }
    case 'page': {
      // A page turns from the right: A's remaining part, the folded-over back of the page, B underneath.
      const slant = h * 0.38;
      const xb = (w + slant) * (1 - e) - slant * 0.2;
      const xt = xb + slant;
      const flap = Math.min(w * 0.16, (w + slant - xb) * 0.45);
      const keep = `M0 0L${Math.min(w, Math.max(0, xt))} 0L${Math.min(w, Math.max(0, xb))} ${h}L0 ${h}Z`;
      if (xt <= 0) return b;
      const back = `M${xt} 0L${xb} ${h}L${xb - flap} ${h}L${xt - flap * 0.55} 0Z`;
      return [grp(b), grp(a, { clip: keep }), { k: 'path', d: back, fill: { color: '#EEE9DF' }, op: 0.97 }, { k: 'path', d: `M${xt} 0L${xb} ${h}`, stroke: { paint: { color: '#00000040' }, width: Math.max(1, h / 300) } }];
    }
    case 'shape': {
      const R = Math.hypot(w, h) * e;
      const [cx, cy] = focus;
      const d = tr.shape === 'star' ? star(cx, cy, R * 1.2, R * 0.55, 5) : tr.shape === 'heart' ? heart(cx, cy, R) : tr.shape === 'blob' ? blob(cx, cy, R) : circle(cx, cy, R);
      return [grp(a), grp(b, { clip: d })];
    }
  }
  return b;
}

const blob = (cx: number, cy: number, r: number) => {
  let d = '';
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * TAU;
    const rr = r * (0.85 + 0.15 * Math.sin(a * 5) + 0.08 * Math.sin(a * 9));
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  return `${d}Z`;
};

function shadeHex(c: string, f: number): string {
  const [r, g, b] = hexToRgb(c);
  const h = (x: number) => Math.max(0, Math.min(255, Math.round(x * f))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export { hexToRgb };
