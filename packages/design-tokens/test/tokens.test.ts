import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { clip, clipCategories, color, contrastRatio, tokensCss, tokensJson } from '../src/index.js';

const here = path.dirname(new URL(import.meta.url).pathname);

describe('design tokens (Design System §2)', () => {
  for (const theme of ['dark', 'light'] as const) {
    const c = color[theme];
    for (const surface of ['panel', 'subtle', 'field'] as const) {
      it(`${theme}: text ≥ 7:1 on ${surface}`, () => {
        expect(contrastRatio(c.text, c[surface])).toBeGreaterThanOrEqual(7);
      });
      for (const t of ['text2', 'text3'] as const) {
        it(`${theme}: ${t} ≥ 4.5:1 on ${surface}`, () => {
          expect(contrastRatio(c[t], c[surface])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
    it(`${theme}: clip text readable on clip fill (≥ 4.5:1)`, () => {
      for (const cat of clipCategories) {
        const [fill, text] = clip[theme][cat];
        expect(contrastRatio(text, fill), cat).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${theme}: focus ring non-text contrast ≥ 3:1 against panel`, () => {
      expect(contrastRatio(c.focus, c.panel)).toBeGreaterThanOrEqual(3);
    });
  }

  it('checked-in tokens.css and tokens.json match the source', () => {
    const css = fs.readFileSync(path.join(here, '../tokens.css'), 'utf8');
    const json = JSON.parse(fs.readFileSync(path.join(here, '../tokens.json'), 'utf8'));
    expect(css).toBe(tokensCss());
    expect(json).toEqual(JSON.parse(JSON.stringify(tokensJson())));
  });
});
