import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { buildCharacter, validateProject } from '@frame/core';
import { libraryFor } from '@frame/assets/node';
import { FrameError, type AssetManifest } from '@frame/schema';
import {
  OpenProject, exportAssetsFromProject, exportProjectFromOpen, importAssetsIntoProject, importProjectPackage, manifestHash, readPackage,
  sha256, stableStringify, writePackage, type OpenProject as Open,
} from '../src/index.js';
import { CHAR, newProject, tmpdir } from './helpers.js';

const CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../content');
const VOICE_ID = 'user.00000000-0000-4000-8000-000000000001';
const CHAR_ID = 'user.00000000-0000-4000-8000-000000000002';
const lib = (p: Open, userDir?: string) => libraryFor({ contentDir: CONTENT, ...(userDir ? { userDir } : {}), projectAssets: p.state.assets });
const meta = { appVersion: '0.1.0', now: '2026-10-22T00:00:00.000Z' };

function voiceManifest(p: Open, o: { id?: string; method?: 'design' | 'clone'; consent?: boolean } = {}): AssetManifest {
  const media = p.store.putMedia(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]), { ext: 'wav', mime: 'audio/wav', durationS: 1 });
  return {
    schemaVersion: 1, id: o.id ?? VOICE_ID, version: 1, kind: 'voice', name: 'Test voice', category: 'Voices', tags: [], synonyms: [], families: [], views: [],
    viewExemptions: {}, anchors: {}, capabilities: [], parameters: [], dependencies: [], layering: {}, previews: {},
    license: { id: 'LicenseRef-Project-Owner', redistributable: false, commercialUse: true },
    provenance: { method: 'generated', author: 'test', date: '2026-10-22' },
    data: {
      description: 'warm', method: o.method ?? 'design', language: 'en',
      ...(o.consent ? { consent: { statement: 'own-voice', speakerName: 'Sam', confirmedBy: 'Sam', date: '2026-10-22' } } : {}),
      references: [{ emotion: 'neutral', media, transcript: 'Hello.', accepted: true, fixture: true }], auditions: [], engineData: {},
    },
  } as AssetManifest;
}

/** A project with a designed voice and a custom character that uses it, placed in the first scene. */
function projectWithCharacter() {
  const p = newProject();
  const scene = Object.keys(p.state.scenes)[0]!;
  const voice = voiceManifest(p);
  p.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest: voice } }] });
  const l = lib(p);
  const chr = buildCharacter({ name: 'Robin', from: 'chr.aiko-tanaka@1', parts: { hair: 'hair.afro@1' }, voice: `${VOICE_ID}@1` }, { manifest: (r) => l.manifest(r) }, { id: CHAR_ID, date: '2026-10-22', author: 'test' });
  p.session.apply({ commands: [
    { name: 'asset.addLocal', params: { manifest: chr } },
    { name: 'instance.add', params: { scene, kind: 'character', asset: `${CHAR_ID}@1`, name: 'Robin', character: { ...CHAR, look: 'studio' } } },
  ] });
  return { p, scene, chr, voice };
}

describe('packages (FR-DAT-10/11, FR-IMP-04)', () => {
  it('exports a .framechar with custom dependencies and media, pins bundled parts by hash, and is byte-stable', () => {
    const { p, chr } = projectWithCharacter();
    const bytes = exportAssetsFromProject(p, lib(p), 'framechar', [`${CHAR_ID}@1`], meta);
    expect(exportAssetsFromProject(p, lib(p), 'framechar', [`${CHAR_ID}@1`], meta)).toEqual(bytes);
    const pkg = readPackage(bytes, 'framechar');
    expect(pkg.manifest.assets).toEqual([`${CHAR_ID}@1`]);
    const paths = pkg.manifest.contents.map((c) => c.path);
    expect(paths).toContain(`assets/${CHAR_ID}@1.json`);
    expect(paths).toContain(`assets/${VOICE_ID}@1.json`);
    expect(paths.filter((x) => x.startsWith('media/'))).toHaveLength(1);
    const requires = pkg.manifest.requires!.map((r) => r.ref);
    expect(requires).toContain('hair.afro@1');
    expect(requires).not.toContain(`${CHAR_ID}@1`);
    const hair = lib(p).manifest('hair.afro@1')!;
    expect(pkg.manifest.requires!.find((r) => r.ref === 'hair.afro@1')!.hash).toBe(manifestHash(hair));
    expect(JSON.parse(new TextDecoder().decode(pkg.files.get(`assets/${CHAR_ID}@1.json`)))).toEqual(JSON.parse(stableStringify(chr)));
  });

  it('imports a .framechar into a fresh project with identical content, and re-import is a no-op', () => {
    const { p } = projectWithCharacter();
    const bytes = exportAssetsFromProject(p, lib(p), 'framechar', [`${CHAR_ID}@1`], meta);
    const q = newProject(path.join(tmpdir(), 'Other.frame'), 50);
    const r = importAssetsIntoProject(q, lib(q), bytes);
    expect(r.report.added.sort()).toEqual([`${CHAR_ID}@1`, `${VOICE_ID}@1`].sort());
    expect(q.state.assets[`${CHAR_ID}@1`]).toEqual(p.state.assets[`${CHAR_ID}@1`]);
    const hash = (q.state.assets[`${VOICE_ID}@1`]!.data as { references: { media: { hash: string } }[] }).references[0]!.media.hash;
    expect(q.store.verifyMedia(hash)).toBe(true);
    const again = importAssetsIntoProject(q, lib(q), bytes);
    expect(again.report.added).toEqual([]);
    expect(again.report.unchanged.length).toBe(2);
    // One undoable step.
    q.session.undo();
    expect(q.state.assets[`${CHAR_ID}@1`]).toBeUndefined();
  });

  it('refuses different content under an existing id@version, or imports it under a new ID with references rewritten (FR-DAT-11)', () => {
    const { p } = projectWithCharacter();
    const bytes = exportAssetsFromProject(p, lib(p), 'framechar', [`${CHAR_ID}@1`], meta);
    const q = newProject(path.join(tmpdir(), 'Other.frame'), 50);
    const other = voiceManifest(q);
    q.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest: { ...other, name: 'A different voice' } } }] });
    expect(() => importAssetsIntoProject(q, lib(q), bytes)).toThrowError(expect.objectContaining({ code: 'CONFLICT' }) as Error);
    const r = importAssetsIntoProject(q, lib(q), bytes, { onConflict: 'new-id', newId: () => '00000000-0000-4000-8000-0000000000ff' });
    const newVoice = 'user.00000000-0000-4000-8000-0000000000ff@1';
    expect(r.report.renamed).toEqual([{ from: `${VOICE_ID}@1`, to: newVoice }]);
    expect(q.state.assets[`${VOICE_ID}@1`]!.name).toBe('A different voice');
    expect((q.state.assets[`${CHAR_ID}@1`]!.data as { voice: string }).voice).toBe(newVoice);
  });

  it('carries the consent record of cloned voices and refuses clones without one (FR-VOI-04, AC-05)', () => {
    const p = newProject();
    const id = 'user.00000000-0000-4000-8000-000000000003';
    p.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest: voiceManifest(p, { id, method: 'clone', consent: true }) } }] });
    const bytes = exportAssetsFromProject(p, lib(p), 'framevoice', [`${id}@1`], meta);
    const m = JSON.parse(new TextDecoder().decode(readPackage(bytes).files.get(`assets/${id}@1.json`))) as AssetManifest;
    expect((m.data as { consent: { speakerName: string } }).consent.speakerName).toBe('Sam');
    const bad = 'user.00000000-0000-4000-8000-000000000004';
    p.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest: voiceManifest(p, { id: bad, method: 'clone' }) } }] });
    expect(() => exportAssetsFromProject(p, lib(p), 'framevoice', [`${bad}@1`], meta)).toThrowError(expect.objectContaining({ code: 'CONSENT_REQUIRED' }) as Error);
    expect(() => exportAssetsFromProject(p, lib(p), 'framechar', [`${id}@1`], meta)).toThrowError(expect.objectContaining({ code: 'USAGE' }) as Error);
  });

  describe('malicious packages are rejected without writing anything (NFR-09, AC-21)', () => {
    const enc = new TextEncoder();
    const good = () => {
      const data = enc.encode('{}');
      return { manifest: { format: 'frameasset', formatVersion: 1, appVersion: '0', createdAt: 'x', assets: [], contents: [{ path: 'assets/a.json', hash: sha256(data), bytes: data.byteLength, role: 'x' }] }, data };
    };
    const zip = (files: Record<string, Uint8Array>) => zipSync(files);
    const refused = (bytes: Uint8Array) => {
      try {
        readPackage(bytes);
      } catch (e) {
        return (e as FrameError).code;
      }
      return 'accepted';
    };
    it('path traversal and absolute paths', () => {
      const { manifest, data } = good();
      expect(refused(zip({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'assets/a.json': data, '../evil.json': data }))).toBe('INVALID_PACKAGE');
      expect(refused(zip({ 'manifest.json': enc.encode(JSON.stringify({ ...manifest, contents: [{ ...manifest.contents[0], path: 'assets/../../evil.json' }] })), 'assets/../../evil.json': data }))).toBe('INVALID_PACKAGE');
      expect(refused(zip({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'assets/a.json': data, '/etc/passwd.json': data }))).toBe('INVALID_PACKAGE');
    });
    it('script content and undeclared entries', () => {
      const { manifest, data } = good();
      expect(refused(zip({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'assets/a.json': data, 'assets/run.js': enc.encode('alert(1)') }))).toBe('INVALID_PACKAGE');
      expect(refused(zip({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'assets/a.json': data, 'assets/b.json': data }))).toBe('INVALID_PACKAGE');
      expect(() => writePackage('frameasset', [{ path: 'index.html', data, role: 'x' }], { assets: [], appVersion: '0', createdAt: 'x' })).toThrow();
    });
    it('hash mismatches, missing manifest and oversized entries', () => {
      const { manifest, data } = good();
      expect(refused(zip({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'assets/a.json': enc.encode('{"x":1}') }))).toBe('INVALID_PACKAGE');
      expect(refused(zip({ 'assets/a.json': data }))).toBe('INVALID_PACKAGE');
      expect(refused(enc.encode('not a zip'))).toBe('INVALID_PACKAGE');
      const big = new Uint8Array(4096);
      const m2 = { ...manifest, contents: [{ path: 'assets/a.json', hash: sha256(big), bytes: big.byteLength, role: 'x' }] };
      expect(() => readPackage(zip({ 'manifest.json': enc.encode(JSON.stringify(m2)), 'assets/a.json': big }), undefined, { maxEntries: 10, maxEntryBytes: 1024, maxTotalBytes: 1 << 20 })).toThrowError(expect.objectContaining({ code: 'INVALID_PACKAGE' }) as Error);
    });
    it('wrong format and newer format versions', () => {
      const { manifest, data } = good();
      const bytes = zip({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'assets/a.json': data });
      expect(readPackage(bytes).files.size).toBe(1);
      expect(() => readPackage(bytes, 'framechar')).toThrowError(expect.objectContaining({ code: 'INVALID_PACKAGE' }) as Error);
      const newer = zip({ 'manifest.json': enc.encode(JSON.stringify({ ...manifest, formatVersion: 99 })), 'assets/a.json': data });
      expect(() => readPackage(newer)).toThrowError(expect.objectContaining({ code: 'SCHEMA_TOO_NEW' }) as Error);
    });
  });

  it('exports a project package that opens elsewhere without the original user library (AC-20 path)', () => {
    const { p, scene } = projectWithCharacter();
    // An asset from the user library (not bundled, not project-local) travels inside the package.
    const userDir = tmpdir('frame-user-');
    const userVoiceId = 'user.00000000-0000-4000-8000-000000000009';
    const userVoice = voiceManifest(p, { id: userVoiceId });
    fs.writeFileSync(path.join(userDir, `${userVoiceId}@1.json`), stableStringify(userVoice));
    const inst = p.state.scenes[scene]!.instances.find((i) => i.name === 'Robin')!;
    p.session.apply({ commands: [{ name: 'instance.update', params: { scene, id: inst.id, set: { character: { voice: `${userVoiceId}@1` } } } }] });
    const bytes = exportProjectFromOpen(p, lib(p, userDir), meta);
    const pkg = readPackage(bytes, 'frameproj');
    expect(pkg.manifest.project?.name).toBe('Show');
    expect(pkg.files.has(`library/${userVoiceId}@1.json`)).toBe(true);
    expect([...pkg.files.keys()].some((k) => k.startsWith('project/versions') || k.startsWith('project/history'))).toBe(false);
    const target = path.join(tmpdir(), 'Copy.frame');
    const bundledHash = (ref: string) => {
      const e = lib(p).get(ref);
      return e?.source === 'bundled' ? manifestHash(e.manifest) : undefined;
    };
    const res = importProjectPackage(bytes, target, { bundledHash });
    expect(res.missing).toEqual([]);
    const q = OpenProject.open(target);
    expect(q.state.scenes).toEqual(p.state.scenes);
    expect(q.state.assets[`${userVoiceId}@1`]).toEqual(JSON.parse(stableStringify(userVoice)));
    const problems = validateProject(q.state, { assetExists: (r) => lib(q).has(r), mediaExists: (h) => q.store.verifyMedia(h) });
    expect(problems.filter((x) => x.severity === 'error')).toEqual([]);
    // Refuses a non-empty target and missing bundled requirements.
    expect(() => importProjectPackage(bytes, target, { bundledHash })).toThrowError(expect.objectContaining({ code: 'CONFLICT' }) as Error);
    expect(() => importProjectPackage(bytes, path.join(tmpdir(), 'X.frame'), { bundledHash: () => undefined })).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }) as Error);
  });
});

describe('locks (FR-DAT-06)', () => {
  it('pins every referenced library asset with its content hash at save, keeps pins, and drops unused ones', async () => {
    const { computeLocks, lockMismatches } = await import('../src/index.js');
    const { p, scene } = projectWithCharacter();
    const L = lib(p);
    const lookup = (ref: string) => {
      const e = L.get(ref);
      return e ? { manifest: e.manifest, source: e.source } : undefined;
    };
    p.locksFor = (state) => computeLocks(state, lookup);
    p.flush();
    const locks = JSON.parse(fs.readFileSync(path.join(p.store.root, 'locks/assets.json'), 'utf8'));
    expect(locks.assets['hair.afro@1']).toEqual({ hash: manifestHash(L.manifest('hair.afro@1')!), source: 'bundled' });
    // Parts of the base character's own references are pinned too; project-local assets are not (they live in the project).
    expect(locks.assets[`${CHAR_ID}@1`]).toBeUndefined();
    expect(Object.keys(locks.assets).length).toBeGreaterThan(8);
    expect(p.state.locks).toEqual(locks);
    expect(lockMismatches(p.state.locks, lookup)).toEqual([]);
    // A changed library manifest under the same version is reported, and the pin is kept.
    const tampered = (ref: string) => {
      const e = lookup(ref);
      return e && ref === 'hair.afro@1' ? { ...e, manifest: { ...e.manifest, name: 'Changed' } } : e;
    };
    expect(lockMismatches(p.state.locks, tampered).map((m) => m.ref)).toEqual(['hair.afro@1']);
    expect(computeLocks(p.state, tampered).assets['hair.afro@1']).toEqual(locks.assets['hair.afro@1']);
    const problems = validateProject(p.state, { assetHash: (r) => { const e = tampered(r); return e ? manifestHash(e.manifest) : undefined; } });
    expect(problems.find((x) => x.code === 'LOCK_MISMATCH')?.target?.id).toBe('hair.afro@1');
    // Removing the only user of a part drops its pin at the next save.
    const inst = p.state.scenes[scene]!.instances.find((i) => i.name === 'Robin')!;
    p.session.apply({ commands: [{ name: 'instance.remove', params: { scene, ids: [inst.id] } }, { name: 'asset.removeLocal', params: { ref: `${CHAR_ID}@1` } }] });
    p.flush();
    expect(p.state.locks.assets['hair.afro@1']).toBeUndefined();
    expect(OpenProject.open(p.store.root).state.locks).toEqual(p.state.locks);
  });
});
