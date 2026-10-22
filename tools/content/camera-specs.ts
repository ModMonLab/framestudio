/**
 * Camera language (Catalog M1): framings and angles are camera presets computed from subjects (FR-CAM-01);
 * moves are timed camera-move clips (FR-CAM-03), read by the evaluator from `data.move`.
 */
import type { CameraMove, FramingData } from '../../packages/core/src/index.js';

export const FRAMINGS: Record<string, FramingData> = {
  'extreme-wide': { size: 1, headroom: 0, stage: true },
  wide: { size: 2.4, headroom: 0.18 },
  full: { size: 1.25, headroom: 0.08 },
  'medium-wide': { size: 0.95, headroom: 0.08 },
  medium: { size: 0.62, headroom: 0.08 },
  'medium-close-up': { size: 0.45, headroom: 0.07 },
  'close-up': { size: 0.3, headroom: 0.06 },
  'extreme-close-up': { size: 0.17, headroom: 0.02 },
  'two-shot': { size: 0.75, headroom: 0.08 },
  'three-shot': { size: 0.85, headroom: 0.08 },
  'over-the-shoulder': { size: 0.55, headroom: 0.08 },
  'insert-detail': { size: 1.6, headroom: 0.25 },
  // Angles keep the framing and shift the view (a flat stage has no real camera height).
  'eye-level': { size: 0.62, headroom: 0.08 },
  'low-angle': { size: 0.7, headroom: 0.1, bias: 0.08 },
  'high-angle': { size: 0.7, headroom: 0.04, bias: -0.06 },
  'dutch-tilt': { size: 0.65, headroom: 0.08, roll: 8 },
};

export const MOVES: Record<string, CameraMove> = {
  pan: { dx: 420, ease: 'inOut' },
  tilt: { dy: -260, ease: 'inOut' },
  'push-in': { zoom: 1.3, ease: 'inOut' },
  'pull-out': { zoom: 0.75, ease: 'inOut' },
  'slow-creep': { zoom: 1.1, ease: 'linear' },
  'dolly-with-parallax': { dx: 300, ease: 'inOut' },
  truck: { dx: -360, ease: 'inOut' },
  'follow-subject': { follow: true, ease: 'linear' },
  'reframe-between-subjects': { target: true, ease: 'inOut' },
  'crash-zoom': { zoom: 2, ease: 'snap' },
  'whip-pan': { dx: 900, ease: 'snap' },
  'shake-light': { shake: 6 },
  'shake-medium': { shake: 14 },
  'shake-heavy': { shake: 28 },
  rumble: { shake: 18, ease: 'linear' },
  'handheld-drift': { shake: 3, ease: 'linear' },
  'snap-zoom': { zoom: 1.5, ease: 'snap' },
  'bounce-zoom': { zoom: 1.3, ease: 'bounce' },
};
