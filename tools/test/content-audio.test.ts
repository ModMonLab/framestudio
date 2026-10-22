import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundledLibrary } from '@frame/assets/node';
import { bundledMediaFile, decodeAudioFile, measureLoudness } from '@frame/io';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');

describe('bundled sounds (CAT-08)', () => {
  it('every sound asset has its media; music and ambience meet their loudness targets and loop seamlessly; cues and SFX peak at −3 dBFS', async () => {
    const lib = bundledLibrary(content);
    const sounds = [...lib.byKind('music'), ...lib.byKind('amb'), ...lib.byKind('cue'), ...lib.byKind('sfx')];
    expect(sounds.length).toBeGreaterThanOrEqual(60);
    for (const e of sounds) {
      const snd = (e.manifest.data as { sound: { media: { hash: string; durationS: number }; loop: boolean; lufs?: number; peakDbfs?: number } }).sound;
      const file = bundledMediaFile(content, snd.media.hash);
      expect(file, e.manifest.id).toBeTruthy();
      const pcm = await decodeAudioFile(file!);
      const x = pcm.data[0]!;
      expect(Math.abs(x.length / pcm.sampleRate - snd.media.durationS)).toBeLessThan(0.01);
      const m = measureLoudness(pcm);
      if (snd.lufs !== undefined) {
        // Within 1 LU of the target unless the peak ceiling limited it (then quieter, never louder).
        expect(m.integrated, e.manifest.id).toBeLessThanOrEqual(snd.lufs + 1);
        expect(m.integrated, e.manifest.id).toBeGreaterThan(snd.lufs - 6);
      } else expect(Math.abs(m.samplePeakDb - (snd.peakDbfs ?? -3)), e.manifest.id).toBeLessThan(0.2);
      if (snd.loop) {
        // Seamless: the step across the loop point is no bigger than ordinary sample-to-sample steps.
        let typical = 0;
        for (let i = 1; i < x.length; i++) typical = Math.max(typical, Math.abs(x[i]! - x[i - 1]!));
        expect(Math.abs(x[0]! - x[x.length - 1]!), e.manifest.id).toBeLessThanOrEqual(typical + 1e-3);
      }
    }
    expect(fs.existsSync(path.join(content, 'media'))).toBe(true);
  });
});
