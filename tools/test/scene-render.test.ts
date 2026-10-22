import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { evaluateFrame, secondsToTicks, validateProject } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';
import { createNodeRenderer, type NodeRenderer } from '../../packages/render/src/node.js';
import { checkGolden } from '../../packages/render/src/golden.js';
import { buildSampleScene } from './sample-scene.js';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
let r: NodeRenderer;
beforeAll(async () => {
  r = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
});

describe('scene evaluation and rendering (FR-RND-01/02, M1 slice)', () => {
  const lib = bundledLibrary(content);
  const styles = loadStyles(content);
  const assets = { manifest: (ref: string) => lib.manifest(ref) };

  for (const family of ['flat', 'illustrated'] as const) {
    it(`renders the two-host podcast scene (${family}) at key times`, () => {
      const { session, scene } = buildSampleScene(family);
      const problems = validateProject(session.state, { assetExists: (ref) => lib.has(ref) }).filter((p) => p.blocksExport);
      expect(problems.map((p) => p.message)).toEqual([]);
      for (const s of [2.0, 6.0]) {
        const ev = evaluateFrame(session.state, scene, secondsToTicks(s), { assets, styles, width: 960, height: 540 });
        expect(ev.issues.filter((i) => !i.includes('missing asset'))).toEqual([]);
        const res = checkGolden(r, path.join(repo, 'tools/test/golden'), `podcast-${family}-${s}s`, ev.frame);
        expect(res.status, JSON.stringify(res)).not.toBe('mismatch');
      }
    });
  }

  it('burns in captions from a caption style asset (FR-TXT-01/02)', () => {
    for (const style of ['txt.boxed-captions@1', 'txt.bold-karaoke-captions@1']) {
      const { session, scene } = buildSampleScene('flat');
      session.apply({ commands: [{ name: 'project.setSettings', params: { captions: { enabled: true, burnIn: true, speakerLabels: true, style } } }] });
      const ev = evaluateFrame(session.state, scene, secondsToTicks(2.2), { assets, styles, width: 960, height: 540, captions: true });
      expect(ev.issues.filter((i) => i.startsWith('Caption'))).toEqual([]);
      const res = checkGolden(r, path.join(repo, 'tools/test/golden'), `captions-${style.split('.')[1]!.split('@')[0]}`, ev.frame);
      expect(res.status, JSON.stringify(res)).not.toBe('mismatch');
    }
  });

  it('is deterministic: the same revision and time give identical pixels (NFR-03)', () => {
    const a = buildSampleScene('flat');
    const b = buildSampleScene('flat');
    const fa = evaluateFrame(a.session.state, a.scene, secondsToTicks(3.3), { assets, styles, width: 480, height: 270 });
    const fb = evaluateFrame(b.session.state, b.scene, secondsToTicks(3.3), { assets, styles, width: 480, height: 270 });
    expect(Buffer.from(r.rgba(fa.frame)).equals(Buffer.from(r.rgba(fb.frame)))).toBe(true);
  });

  it('re-aligning a take updates lip sync (mouth tracks are cached per alignment, not per take id)', () => {
    const { session, scene, lines } = buildSampleScene('flat');
    const take = session.state.scenes[scene]!.clips.find((c) => c.id === lines[0])!.line!.take!;
    const at = () => JSON.stringify(evaluateFrame(session.state, scene, secondsToTicks(1.3), { assets, styles, width: 320, height: 180 }).frame);
    const before = at();
    const al = session.state.takes[take]!.alignment!;
    session.apply({ commands: [{ name: 'take.update', params: { id: take, set: { alignment: { ...al, phonemes: al.phonemes.map((p) => ({ ...p, p: 'AA' })) } } } }] });
    const wide = at();
    expect(wide).not.toBe(before);
    session.apply({ commands: [{ name: 'take.update', params: { id: take, set: { alignment: JSON.parse(JSON.stringify(al)) } } }] });
    expect(at()).toBe(before);
  });

  it('lip sync moves the speaker mouth only while a ready take plays', () => {
    const { session, scene } = buildSampleScene('flat');
    const at = (s: number) => evaluateFrame(session.state, scene, secondsToTicks(s), { assets, styles, width: 320, height: 180 });
    expect(at(1.0).captions.map((c) => c.speaker)).toEqual(['Maya Bennett']);
    expect(at(4.8).captions).toEqual([]);
    expect(at(6).captions[0]!.speaker).toBe('Leo Park');
  });
});
