import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '@frame/schema';
import { coverage } from '../src/coverage.js';
import type { Catalog } from '../src/catalog.js';

const list = (prefix: string, ids: string[]) => ({ list: 'X1', order: 1, part: 'X', title: 'Test', prefix, columns: ['ID', 'Name', 'Notes'], detailKey: 'notes', intro: '', items: ids.map((id) => ({ id, name: id })) });
const man = (id: string, over: Partial<AssetManifest> = {}): AssetManifest => ({
  schemaVersion: 1, id, version: 1, kind: id.split('.')[0]!, name: id, category: 'Test', tags: [], synonyms: [], families: ['flat', 'illustrated'], views: ['front', 'three', 'side', 'back'], viewExemptions: {}, anchors: {}, capabilities: [], parameters: [], dependencies: [], layering: {},
  previews: { flat: 'sha256-' + 'a'.repeat(64), illustrated: 'sha256-' + 'b'.repeat(64) } as never, license: { id: 'X', redistributable: true, commercialUse: true, attribution: '' }, provenance: { method: 'authored', author: 'A', date: '2026-10-22' }, review: { status: 'approved' } as never, data: {}, ...over,
} as AssetManifest);

describe('catalog coverage report (CAT-10)', () => {
  it('is green only when every applicable check passes', () => {
    const cat = { lists: [list('hair', ['hair.a', 'hair.b', 'hair.c', 'hair.d', 'hair.e']), list('out', ['out.x'])] } as unknown as Catalog;
    const ms: Record<string, AssetManifest> = {
      'hair.a': man('hair.a'),
      'hair.b': man('hair.b', { families: ['flat'] }),
      'hair.c': man('hair.c', { views: ['front', 'three', 'side'], viewExemptions: { back: 'hidden by hood' } }),
      'hair.d': man('hair.d', { review: { status: 'pending' } as never }),
      'out.x': man('out.x', { families: [], views: [], previews: {} as never }),
    };
    const r = coverage(cat, (id) => ms[id], () => true, '2026-10-22');
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(by['hair.a']!.green).toBe(true);
    expect(by['hair.b']).toMatchObject({ green: false, families: 'missing' });
    expect(by['hair.c']).toMatchObject({ green: true, views: 'ok' });
    expect(by['hair.d']).toMatchObject({ green: false, review: 'pending' });
    expect(by['hair.e']).toMatchObject({ green: false, manifest: 'missing' });
    expect(by['out.x']).toMatchObject({ green: true, families: 'n/a', views: 'n/a', previews: 'n/a' });
    expect(r).toMatchObject({ total: 6, green: 3, withManifest: 5 });
  });

  it('reports the rig check as not run for character-attached items without a validator', () => {
    const cat = { lists: [list('hair', ['hair.a'])] } as unknown as Catalog;
    const r = coverage(cat, () => man('hair.a'), undefined);
    expect(r.rows[0]).toMatchObject({ validator: 'not run', green: false });
  });
});
