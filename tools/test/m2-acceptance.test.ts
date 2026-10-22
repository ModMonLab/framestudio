/**
 * M2 acceptance paths (AC-02, AC-20) without a person at the keyboard: a character built from parts of every builder
 * section renders identically in all four views and both families after a .framechar round trip into a fresh project
 * and profile; a whole project renders identically after a .frameproj round trip into a new folder.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCharacter, checkCharacter, evaluateFrame, sequentialIds, type CharacterData } from '@frame/core';
import { libraryFor, loadStyles } from '@frame/assets/node';
import { createNodeRenderer, type NodeRenderer } from '../../packages/render/src/node.js';
import { exportAssetsFromProject, exportProjectFromOpen, importAssetsIntoProject, importProjectPackage, manifestHash, OpenProject } from '@frame/io';
import type { StyleFamily, View } from '@frame/schema';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const content = path.join(repo, 'content');
const styles = loadStyles(content);
const OUTPUT = { preset: 'out.landscape-720p@1', width: 1280, height: 720, aspectRatios: ['16:9'] };
let r: NodeRenderer;
beforeAll(async () => {
  r = await createNodeRenderer({ fontsDir: path.join(content, 'fonts') });
});

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'frame-m2-'));
function project(name: string, seed: number) {
  return OpenProject.create(path.join(tmp(), `${name}.frame`), { name, styleFamily: 'flat', frameRate: 24, output: OUTPUT, appVersion: '0.1.0', newId: sequentialIds(seed), seed: 1, debounceMs: 10_000 });
}
const lib = (p: OpenProject, userDir?: string) => libraryFor({ contentDir: content, ...(userDir ? { userDir } : {}), projectAssets: p.state.assets });
const first = (p: OpenProject, kind: string, skip = 0) => {
  const e = lib(p).byKind(kind).filter((x) => !x.manifest.tags.includes('draft'))[skip]!.manifest;
  return `${e.id}@${e.version}`;
};

function frames(p: OpenProject, ref: string, userDir?: string) {
  const scene = Object.keys(p.state.scenes)[0]!;
  const L = lib(p, userDir);
  const out: Record<string, Uint8Array> = {};
  for (const family of ['flat', 'illustrated'] as StyleFamily[]) {
    for (const view of ['front', 'three', 'side', 'back'] as View[]) {
      const s = p.state.scenes[scene]!;
      const inst = { id: 'ins_acceptance' as never, kind: 'character' as const, asset: ref, name: 'C', transform: { x: 960, y: 1000, scale: 1, rotation: 0, flipX: false }, depthPlane: s.stage.depthPlanes[0]!.id, order: 0, parallax: 1, opacity: 1, visible: true, locked: false, params: {}, character: { look: (L.manifest(ref)!.data as CharacterData).defaultLook, view, posture: 'standing' as const, auto: { idle: false, listening: false, blinks: false, talkingGestures: false } } };
      const state = { ...p.state, scenes: { ...p.state.scenes, [scene]: { ...s, instances: [inst], clips: [] } } };
      const ev = evaluateFrame(state, scene, 0, { assets: { manifest: (x) => L.manifest(x) }, styles, width: 320, height: 180, family });
      expect(ev.issues.filter((i) => !/missing asset (acc|skin-detail|prop|voice)\./.test(i))).toEqual([]);
      out[`${family}-${view}`] = r.rgba(ev.frame);
    }
  }
  return out;
}

describe('M2 acceptance paths', () => {
  it('AC-02: a character from every builder section renders identically in 4 views × 2 families after .framechar into a fresh profile', () => {
    const a = project('Build', 0);
    const L = lib(a);
    // Parts from every section: body (build, feet), head and face (shape, eyes, brows, nose, mouth, ears), hair, wardrobe.
    const spec = {
      name: 'Juno', from: first(a, 'chr'), role: 'Host',
      bodyBase: first(a, 'body', 2),
      parts: { head: first(a, 'head', 1), eyes: first(a, 'eyes', 1), brows: first(a, 'brow', 1), nose: first(a, 'nose', 1), mouth: first(a, 'mouth', 1), ears: first(a, 'ears', 1), hair: first(a, 'hair', 3), feet: first(a, 'feet') },
      colors: { skin: '#8D5B3E', hair: '#1E1612' },
      looks: [{ id: 'main', name: 'Main', garments: [first(a, 'top', 2), first(a, 'bottom', 1), first(a, 'shoe', 1)], accessories: [], colors: { top: '#3F5F8F' } }],
      performance: { idleEnergy: 30 },
    };
    const chr = buildCharacter(spec, { manifest: (x) => L.manifest(x) }, { id: 'user.00000000-0000-4000-8000-0000000000c1', date: '2026-10-22', author: 'acceptance' });
    a.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest: chr } }] });
    const ref = `${chr.id}@1`;
    const check = checkCharacter(chr, (x) => lib(a).manifest(x));
    expect(check.problems.filter((x) => x.severity === 'error')).toEqual([]);
    expect(check.views).toEqual(['front', 'three', 'side', 'back']);
    expect(check.families).toEqual(['flat', 'illustrated']);
    const before = frames(a, ref);

    const pkg = exportAssetsFromProject(a, lib(a), 'framechar', [ref], { appVersion: '0.1.0', now: '2026-10-22T00:00:00Z' });
    // A fresh profile: a new project and an empty user library folder.
    const b = project('Fresh', 900);
    const freshUser = path.join(tmp(), 'library');
    fs.mkdirSync(freshUser, { recursive: true });
    const res = importAssetsIntoProject(b, lib(b, freshUser), pkg);
    expect(res.report.added).toEqual([ref]);
    expect(manifestHash(b.state.assets[ref]!)).toBe(manifestHash(a.state.assets[ref]!));
    const after = frames(b, ref, freshUser);
    for (const k of Object.keys(before)) expect(Buffer.compare(Buffer.from(after[k]!), Buffer.from(before[k]!)), k).toBe(0);
  });

  it('AC-20: a project package opens in a new folder without the original user library and renders identical frames', () => {
    const a = project('Show', 300);
    const userDir = path.join(tmp(), 'library');
    const L = lib(a);
    const chr = buildCharacter({ name: 'Remy', from: first(a, 'chr', 1), parts: { hair: first(a, 'hair', 5) } }, { manifest: (x) => L.manifest(x) }, { id: 'user.00000000-0000-4000-8000-0000000000c2', date: '2026-10-22', author: 'acceptance' });
    // The character lives in the user library only; the project references it.
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, `${chr.id}@1.json`), JSON.stringify(chr));
    const ref = `${chr.id}@1`;
    const scene = Object.keys(a.state.scenes)[0]!;
    a.session.apply({ commands: [{ name: 'instance.add', params: { scene, kind: 'character', asset: ref, name: 'Remy', transform: { x: 960, y: 1000 }, character: { look: (chr.data as CharacterData).defaultLook, view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }] });
    const before = frames(a, ref, userDir);
    const pkg = exportProjectFromOpen(a, lib(a, userDir), { appVersion: '0.1.0', now: '2026-10-22T00:00:00Z' });
    const bundled = libraryFor({ contentDir: content });
    const copy = importProjectPackage(pkg, path.join(tmp(), 'Copy.frame'), { bundledHash: (x) => (bundled.get(x)?.source === 'bundled' ? manifestHash(bundled.get(x)!.manifest) : undefined) });
    const b = OpenProject.open(copy.root);
    const after = frames(b, ref); // no user library
    for (const k of Object.keys(before)) expect(Buffer.compare(Buffer.from(after[k]!), Buffer.from(before[k]!)), k).toBe(0);
    const sc = b.state.scenes[scene]!;
    const ev1 = evaluateFrame(a.state, scene, 48000, { assets: { manifest: (x) => lib(a, userDir).manifest(x) }, styles, width: 320, height: 180 });
    const ev2 = evaluateFrame(b.state, sc.id, 48000, { assets: { manifest: (x) => lib(b).manifest(x) }, styles, width: 320, height: 180 });
    expect(Buffer.compare(Buffer.from(r.rgba(ev2.frame)), Buffer.from(r.rgba(ev1.frame)))).toBe(0);
  });
});
