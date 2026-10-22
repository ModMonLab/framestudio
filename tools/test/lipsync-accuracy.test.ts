import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyOverrides, lipSyncAccuracy, lipSyncSummary, mouthTrackFromAlignment, shapeAt } from '@frame/core';
import type { Alignment } from '@frame/schema';
import { resolveCharacter, type CharacterData } from '@frame/core';
import { composeCharacter, NEUTRAL_FACE, REST_POSE } from '@frame/rig';
import type { Item } from '@frame/render';
import { bundledLibrary, loadStyles } from '@frame/assets/node';

const here = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/ac09-lines.json'), 'utf8')) as { lines: string[] };

// Letter-to-phoneme rules of the fixture aligner (services/voice-worker/frame_worker/engines/fixture.py).
const DIGRAPHS: [string, string[]][] = [['tion', ['SH', 'AH', 'N']], ['th', ['TH']], ['sh', ['SH']], ['ch', ['CH']], ['ph', ['F']], ['ng', ['NG']], ['ee', ['IY']], ['ea', ['IY']], ['oo', ['UW']], ['ou', ['AW']], ['ow', ['OW']], ['ai', ['EY']], ['ay', ['EY']], ['oa', ['OW']], ['ck', ['K']], ['qu', ['K', 'W']]];
const LETTERS: Record<string, string[]> = { a: ['AE'], b: ['B'], c: ['K'], d: ['D'], e: ['EH'], f: ['F'], g: ['G'], h: ['HH'], i: ['IH'], j: ['JH'], k: ['K'], l: ['L'], m: ['M'], n: ['N'], o: ['AA'], p: ['P'], q: ['K'], r: ['R'], s: ['S'], t: ['T'], u: ['AH'], v: ['V'], w: ['W'], x: ['K', 'S'], y: ['IY'], z: ['Z'] };
function phonemes(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const out: string[] = [];
  for (let i = 0; i < w.length;) {
    const dg = DIGRAPHS.find(([d]) => w.startsWith(d, i));
    if (dg) { out.push(...dg[1]); i += dg[0].length; continue; }
    if (w[i] === 'e' && i === w.length - 1 && w.length > 2) { i++; continue; }
    out.push(...(LETTERS[w[i]!] ?? []));
    i++;
  }
  return out.length ? out : ['AH'];
}

/** A speech-like alignment: phoneme lengths 45–140 ms (seeded), short pauses between some words. */
function alignment(text: string, seed: number): Alignment {
  let x = seed || 1;
  const rnd = () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 2 ** 32);
  let t = 0.15;
  const words: Alignment['words'] = [];
  const ph: Alignment['phonemes'] = [];
  for (const w of text.split(/\s+/)) {
    const start = t;
    for (const p of phonemes(w)) {
      const d = 0.045 + rnd() * 0.095 * (/^(AA|AE|AH|AO|AW|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)$/.test(p) ? 1.3 : 0.8);
      ph.push({ p, start: t, end: t + d });
      t += d;
    }
    words.push({ text: w, start, end: t });
    if (rnd() < 0.3) t += 0.05 + rnd() * 0.25;
  }
  return { method: 'fixture', confidence: 0.99, words, phonemes: ph };
}

describe('lip-sync accuracy on the AC-09 corpus (FR-LIP-06)', () => {
  it('has 50 lines', () => expect(corpus.lines).toHaveLength(50));

  for (const fps of [24, 25, 30]) {
    it(`at ${fps} fps, ≥ 90 % of bilabial closures land within ±1 frame and the mouth is active over ≥ 95 % of voiced time`, () => {
      const per = corpus.lines.map((line, i) => {
        const al = alignment(line, 1000 + i);
        return lipSyncAccuracy(al, mouthTrackFromAlignment(al, { fps }).blocks, fps);
      });
      const s = lipSyncSummary(per);
      expect(s.bilabialRate).toBeGreaterThanOrEqual(0.9);
      expect(s.coverage).toBeGreaterThanOrEqual(0.95);
      expect(s.pass).toBe(true);
    });
  }

  it('edited mouth blocks override the derived track and survive re-alignment of the line', () => {
    const al = alignment(corpus.lines[0]!, 7);
    const edit = [{ shape: 'D' as const, start: 0.3, end: 0.42 }];
    const before = applyOverrides(mouthTrackFromAlignment(al).blocks, edit);
    expect(shapeAt(before, 0.35)).toBe('D');
    // A new take of the same line (different timing): the line's edits apply on top of its new track.
    const re = alignment(corpus.lines[0]!, 8);
    const after = applyOverrides(mouthTrackFromAlignment(re).blocks, edit);
    expect(shapeAt(after, 0.35)).toBe('D');
    expect(shapeAt(after, 0.2)).toBe(shapeAt(mouthTrackFromAlignment(re).blocks, 0.2));
  });

  it('FR-LIP-03/05: the mouth shape is drawn in front, three-quarter and side views with the expression, and not from behind', () => {
    const content = path.join(here, '../../content');
    const lib = bundledLibrary(content);
    const styles = loadStyles(content);
    const man = lib.manifest('chr.maya-bennett@1')!;
    const mouthRef = (man.data as CharacterData).parts.mouth!;
    const { spec } = resolveCharacter(man, 'on-air', 'flat', styles.flat, { manifest: (r) => lib.manifest(r) });
    const count = (it: Item): number => (it.k === 'group' ? (it.id === mouthRef ? 1 : 0) + it.items.reduce((n: number, x: Item) => n + count(x), 0) : 0);
    const draw = (view: 'front' | 'three' | 'side' | 'back', mouth: 'A' | 'D', curve = 0) => composeCharacter(spec, { view, flip: false, pose: REST_POSE, face: { ...NEUTRAL_FACE, mouthCurve: curve }, mouth, gaze: [0, 0], overlays: {} }).item;
    for (const v of ['front', 'three', 'side'] as const) {
      expect(count(draw(v, 'D')), v).toBeGreaterThan(0);
      expect(JSON.stringify(draw(v, 'A'))).not.toEqual(JSON.stringify(draw(v, 'D')));
      // The expression's curvature still changes the speaking mouth (FR-CHR-08).
      expect(JSON.stringify(draw(v, 'D', 0.8))).not.toEqual(JSON.stringify(draw(v, 'D', -0.8)));
    }
    expect(count(draw('back', 'D'))).toBe(0);
  });
});
