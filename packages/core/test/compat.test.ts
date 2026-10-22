import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '@frame/schema';
import { compatibility } from '../src/index.js';

const m = (o: Partial<AssetManifest>): AssetManifest => ({
  schemaVersion: 1, id: 'act.x', version: 1, kind: 'act', name: 'X', category: 'c', tags: [], synonyms: [], families: ['flat', 'illustrated'], views: ['front', 'three', 'side', 'back'],
  viewExemptions: {}, anchors: {}, capabilities: ['rig.biped@1'], parameters: [], dependencies: [], layering: {}, previews: {},
  license: { id: 'x', redistributable: true, commercialUse: true }, provenance: { method: 'authored', author: 'a', date: 'd' }, data: {}, ...o,
}) as AssetManifest;

describe('asset compatibility (FR-AST-04)', () => {
  const chr = m({ id: 'chr.a', kind: 'chr', name: 'Ada' });
  it('reports family, rig, view and posture reasons', () => {
    expect(compatibility(m({}), { family: 'flat' })).toBe(true);
    expect(compatibility(m({ families: ['illustrated'] }), { family: 'flat' })).toBe('No flat artwork');
    expect(compatibility(m({ capabilities: ['rig.quadruped@1'] }), { family: 'flat', character: { manifest: chr, view: 'front', posture: 'standing' } })).toMatch(/^Needs rig.quadruped@1/);
    expect(compatibility(m({ views: ['front'] }), { family: 'flat', character: { manifest: chr, view: 'side', posture: 'standing' } })).toBe('Not drawn for the side view');
    expect(compatibility(m({ views: ['front'], viewExemptions: { side: 'reason' } }), { family: 'flat', character: { manifest: chr, view: 'side', posture: 'standing' } })).toBe(true);
    expect(compatibility(m({ data: { action: { postures: ['standing'] } } }), { family: 'flat', character: { manifest: chr, view: 'front', posture: 'seated' } })).toBe('Not for seated characters (standing)');
    // Props and kits (no rig capability) are not judged by the character's view.
    expect(compatibility(m({ capabilities: [], views: ['front'] }), { family: 'flat', character: { manifest: chr, view: 'side', posture: 'standing' } })).toBe(true);
  });
});
