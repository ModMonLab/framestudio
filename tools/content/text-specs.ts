/** Caption styles (Catalog O1, FR-TXT-01/02). Sizes and spacing are fractions of the font size or output short side. */
import type { CaptionStyle } from '../../packages/core/src/captions.js';

export const CAPTION_STYLES: Record<string, CaptionStyle> = {
  'podcast-captions': { font: 'Inter', weight: 600, size: 0.046, color: '#FFFFFF', mode: 'line', position: 'bottom', maxChars: 42, outline: { color: '#101114', width: 0.09 }, label: { color: '#FFD54A', weight: 700 } },
  'bold-karaoke-captions': { font: 'Inter', weight: 800, size: 0.056, color: '#FFFFFF', mode: 'karaoke', highlight: '#FFD54A', upcoming: '#FFFFFF', position: 'bottom', maxChars: 32, uppercase: true, outline: { color: '#000000', width: 0.12 }, label: { color: '#7FD1FF', weight: 800 } },
  'minimal-captions': { font: 'Inter', weight: 500, size: 0.038, color: '#FFFFFF', mode: 'line', position: 'bottom', maxChars: 48, shadow: { color: '#000000B3', blur: 0.12, dx: 0, dy: 0.04 }, label: { color: '#D9DCE3', weight: 600 } },
  'boxed-captions': { font: 'Inter', weight: 600, size: 0.044, color: '#FFFFFF', mode: 'line', position: 'bottom', maxChars: 40, box: { color: '#000000C0', radius: 0.14, padX: 0.32, padY: 0.02 }, label: { color: '#FFD54A', weight: 700 } },
  'social-pop-captions': { font: 'Inter', weight: 900, size: 0.07, color: '#FFFFFF', mode: 'pop', window: 3, highlight: '#5CF2A0', position: 'bottom', maxChars: 24, uppercase: true, outline: { color: '#000000', width: 0.14 }, label: { color: '#5CF2A0', weight: 900 } },
  'film-subtitles': { font: 'Inter', weight: 500, size: 0.04, color: '#F4F1E6', mode: 'line', position: 'bottom', maxChars: 42, italic: false, outline: { color: '#000000', width: 0.06 }, shadow: { color: '#00000099', blur: 0.08, dx: 0, dy: 0.03 }, label: { color: '#F4F1E6', weight: 600 } },
};

/* ------------------------------------------------------------------ bubbles, titles, graphics, world text (O1) */

import type { BubbleStyle, GraphicStyle, WorldTextStyle } from '../../packages/core/src/index.js';

export const BUBBLES: Record<string, BubbleStyle> = {
  'speech-bubble-round': { shape: 'round' },
  'speech-bubble-square': { shape: 'square' },
  'shout-bubble': { shape: 'shout', fill: '#FFF4C2' },
  'whisper-bubble': { shape: 'whisper', fill: '#F4F6FA', text: '#3A4256' },
  'thought-bubble': { shape: 'thought' },
  'narration-box': { shape: 'narration', fill: '#FFF4C2' },
};

export const GRAPHICS: Record<string, GraphicStyle> = {
  'episode-title-card': { layout: 'card', background: '#1E2433', accent: '#F5B83D', size: 0.08 },
  'cold-open-title': { layout: 'title', accent: '#FFFFFF', size: 0.07, anim: 'pop' },
  'chapter-title': { layout: 'title', accent: '#F5B83D', size: 0.055, background: '#00000099' },
  'quote-card': { layout: 'card', background: '#2B2235', accent: '#E8B4D8', size: 0.05, weight: 600 },
  'name-lower-third': { layout: 'lower-third', background: '#1E2433', accent: '#4F7CFF', size: 0.05 },
  'name-and-role-lower-third': { layout: 'lower-third', background: '#1E2433', accent: '#F5B83D', size: 0.05 },
  'location-lower-third': { layout: 'lower-third', background: '#2A3A2E', accent: '#7FD4A0', size: 0.045 },
  'breaking-news-bar': { layout: 'bar', background: '#141820', accent: '#E5484D', size: 0.045 },
  'social-handle-tag': { layout: 'tag', background: '#000000', size: 0.05 },
  'opening-card': { layout: 'card', background: '#20304A', accent: '#8FD3FF', size: 0.08 },
  'closing-card': { layout: 'card', background: '#20304A', accent: '#8FD3FF', size: 0.07 },
  'subscribe-end-card': { layout: 'card', background: '#B8323A', accent: '#FFFFFF', size: 0.07, anim: 'pop' },
  'credits-roll': { layout: 'credits-roll', background: '#000000', size: 0.06, anim: 'none' },
  'credits-card': { layout: 'credits-card', background: '#101418', accent: '#F5B83D', size: 0.06 },
  'logo-bug': { layout: 'bug', size: 0.05 },
  watermark: { layout: 'bug', size: 0.04 },
  'progress-bar': { layout: 'progress', background: '#FFFFFF', accent: '#E5484D', anim: 'none' },
  countdown: { layout: 'countdown', background: '#1E2433', size: 0.08, anim: 'none' },
  'chart-callout': { layout: 'callout', accent: '#F5B83D', size: 0.05 },
  'arrow-callout': { layout: 'arrow', accent: '#E5484D', size: 0.05 },
  'highlight-circle': { layout: 'circle', accent: '#E5484D', anim: 'none' },
};

export const WORLD_TEXT: Record<string, WorldTextStyle> = {
  'sign-text': { panel: 'sign' },
  'screen-text': { panel: 'screen' },
  'chalkboard-text': { panel: 'chalk' },
};
