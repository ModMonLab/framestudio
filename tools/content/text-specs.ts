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
