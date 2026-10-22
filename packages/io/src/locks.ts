/**
 * Locks (FR-DAT-06): every library asset a project references — directly or through project-local assets and other
 * other assets (a character's parts) — pinned as `id@version → { hash, source }`. A pinned entry is never rewritten while the reference
 * stays in use, so a library asset whose content changed under the same version is detected (LOCK_MISMATCH).
 */
import { collectRefs, refClosure, type AssetSource } from '@frame/assets';
import { CURRENT_SCHEMA_VERSION, type AssetManifest, type Locks } from '@frame/schema';
import type { ProjectState } from '@frame/core';
import { manifestHash } from './package.js';

export type LockLookup = (ref: string) => { manifest: AssetManifest; source: AssetSource } | undefined;

export function computeLocks(state: ProjectState, lookup: LockLookup): Locks {
  const local = new Set(Object.keys(state.assets));
  const used = collectRefs([state.project, state.episodes, state.scenes, state.takes, state.assets]);
  const { refs } = refClosure([...used].filter((r) => !local.has(r)), (r) => (local.has(r) ? state.assets[r] : lookup(r)?.manifest));
  const assets: Locks['assets'] = {};
  for (const ref of refs.sort()) {
    if (local.has(ref)) continue;
    const prev = state.locks.assets[ref];
    const e = lookup(ref)!;
    assets[ref] = prev ?? { hash: manifestHash(e.manifest), source: e.source === 'project' ? 'imported' : e.source };
  }
  return { schemaVersion: CURRENT_SCHEMA_VERSION, assets };
}

/** Lock entries whose library content no longer matches the pinned hash. */
export function lockMismatches(locks: Locks, lookup: LockLookup): { ref: string; pinned: string; current: string }[] {
  const out: { ref: string; pinned: string; current: string }[] = [];
  for (const [ref, l] of Object.entries(locks.assets)) {
    const e = lookup(ref);
    if (!e) continue;
    const current = manifestHash(e.manifest);
    if (current !== l.hash) out.push({ ref, pinned: l.hash, current });
  }
  return out;
}

/**
 * Assets the project uses that have no artwork in `family` (FR-PRJ-05: switching style family is refused while any
 * exist). Assets without a family list (audio, data) never block.
 */
export function styleFamilyBlockers(state: ProjectState, lookup: LockLookup, family: string): { ref: string; name: string; families: string[] }[] {
  const local = new Set(Object.keys(state.assets));
  const used = collectRefs([state.project, state.episodes, state.scenes, state.assets]);
  const manifest = (r: string) => (local.has(r) ? state.assets[r] : lookup(r)?.manifest);
  const { refs } = refClosure([...used], manifest);
  const out: { ref: string; name: string; families: string[] }[] = [];
  for (const ref of refs.sort()) {
    const m = manifest(ref) as (AssetManifest & { families?: string[] }) | undefined;
    if (m?.families && m.families.length && !m.families.includes(family)) out.push({ ref, name: m.name, families: [...m.families] });
  }
  return out;
}
