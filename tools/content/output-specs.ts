/** Output presets (Catalog R1, FR-RND-04). Any preset can be customised at export time. */
import type { OutputPreset } from '../../packages/io/src/export.js';

export const OUTPUT_PRESETS: Record<string, OutputPreset> = {
  'landscape-hd': { width: 1920, height: 1080, aspect: '16:9', container: 'mp4', video: 'h264', audio: 'aac', loudness: -14, subtitles: ['srt', 'vtt'] },
  'landscape-720p': { width: 1280, height: 720, aspect: '16:9', container: 'mp4', video: 'h264', audio: 'aac', loudness: -14 },
  'landscape-4k': { width: 3840, height: 2160, aspect: '16:9', container: 'mp4', video: 'h265', audio: 'aac', loudness: -14 },
  'portrait-social': { width: 1080, height: 1920, aspect: '9:16', container: 'mp4', video: 'h264', audio: 'aac', loudness: -14 },
  square: { width: 1080, height: 1080, aspect: '1:1', container: 'mp4', video: 'h264', audio: 'aac', loudness: -14 },
  'feed-portrait': { width: 1080, height: 1350, aspect: '4:5', container: 'mp4', video: 'h264', audio: 'aac', loudness: -14 },
  'web-webm': { container: 'webm', video: 'vp9', audio: 'opus', loudness: -14 },
  'transparent-overlay': { container: 'mov', video: 'prores4444', audio: 'pcm', alpha: true },
  'image-sequence': { container: 'png', video: 'png', stems: false },
  'audio-only': { container: 'wav', audio: 'pcm', stems: true, loudness: -16 },
  'animated-gif': { container: 'gif', video: 'gif', maxSeconds: 30 },
  subtitles: { container: 'none', subtitles: ['srt', 'vtt'] },
};
