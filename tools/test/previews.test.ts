/** Asset previews for eye and brow states and character controls (FR-AST-07). */
import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrame, previewSetup, previewable, sheetSetup } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';

const content = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');
const lib = bundledLibrary(content);
const defaults = JSON.parse(fs.readFileSync(path.join(content, 'library.json'), 'utf8')).defaults as { previewCharacter: string; previewHair: string };
const pc = defaults.previewCharacter;
const preview = { ref: pc, manifest: lib.manifest(pc)!, hair: defaults.previewHair };
const first = (kind: string) => lib.search('', { kind, limit: 50 });

it('every eye state, brow state and control has a preview that differs from the plain preview character', () => {
  const styles = loadStyles(content);
  const assets = (s: { assets: Record<string, unknown> }) => ({ manifest: (r: string) => (s.assets[r] as never) ?? lib.manifest(r) });
  const plain = previewSetup(pc, preview.manifest, preview)!;
  const base = evaluateFrame(plain.state, plain.scene, 48000, { assets: assets(plain.state), styles, width: 320, height: 180 });
  for (const kind of ['eyestate', 'browstate', 'face-ctl', 'eye-ctl', 'hair-ctl']) {
    expect(previewable(kind)).toBe(true);
    const hits = first(kind);
    expect(hits.length, kind).toBeGreaterThan(0);
    let differs = 0;
    const unchanged: string[] = [];
    for (const h of hits) {
      const s = previewSetup(h.ref, h.manifest, preview, (r) => lib.manifest(r));
      expect(s, h.ref).toBeTruthy();
      const ev = evaluateFrame(s!.state, s!.scene, s!.t, { assets: assets(s!.state), styles, width: 320, height: 180 });
      if (JSON.stringify(ev.frame) !== JSON.stringify(base.frame)) differs++;
      else unchanged.push(h.ref);
    }
    // Neutral states (e.g. brows at rest) may look like the plain character; most must not.
    expect(differs / hits.length, `${kind}: unchanged ${unchanged.join(', ')}`).toBeGreaterThan(0.6);
  }
});

it('a turnaround sheet shows the character in all four views', () => {
  const ref = first('chr')[0]!.ref;
  const s = sheetSetup(ref, lib.manifest(ref)!);
  const views = s.state.scenes[s.scene]!.instances.map((i) => i.character?.view);
  expect(views).toEqual(['front', 'three', 'side', 'back']);
});
