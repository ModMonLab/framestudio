/**
 * Reference discovery over plain data (FR-DAT-06, FR-DAT-10, FR-IMP-04): every `id@version` string and every
 * content-addressed media object found anywhere in a value. Generic by design — no knowledge of asset kinds or
 * names (FR-ARC-06) — so locks and packages pick up any reference a manifest or scene carries.
 */
import { AssetRefPattern, type AssetManifest, type MediaRef } from '@frame/schema';

const REF = new RegExp(AssetRefPattern);
const HASH = /^sha256-[0-9a-f]{64}$/;

/**
 * Every asset reference (`id@version`) in a value, in first-seen order. A manifest's `capabilities` are capability
 * tokens (`rig.biped@1`), not asset references, and are skipped.
 */
export function collectRefs(value: unknown, out = new Set<string>()): Set<string> {
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      if (v.includes('@') && REF.test(v)) out.add(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'capabilities') walk(x);
  };
  walk(value);
  return out;
}

/** Every media reference object (`{ hash, ext, mime, … }`) in a value, keyed by hash. */
export function collectMedia(value: unknown, out = new Map<string, MediaRef>()): Map<string, MediaRef> {
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.hash === 'string' && HASH.test(o.hash) && typeof o.ext === 'string' && typeof o.mime === 'string') out.set(o.hash, o as unknown as MediaRef);
      for (const x of Object.values(o)) walk(x);
    }
  };
  walk(value);
  return out;
}

/**
 * The transitive closure of references starting from `roots`: every manifest reachable through refs found in
 * manifests. `missing` lists refs that could not be resolved. `expand` stops traversal below a manifest (bundled
 * assets are pinned as a whole, so their own references are not followed).
 */
export function refClosure(roots: Iterable<string>, lookup: (ref: string) => AssetManifest | undefined, expand: (ref: string) => boolean = () => true): { refs: string[]; missing: string[] } {
  const seen = new Set<string>();
  const missing: string[] = [];
  const queue = [...roots];
  while (queue.length) {
    const ref = queue.shift()!;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const m = lookup(ref);
    if (!m) {
      missing.push(ref);
      continue;
    }
    if (expand(ref)) for (const r of collectRefs(m)) if (r !== ref && !seen.has(r)) queue.push(r);
  }
  return { refs: [...seen].filter((r) => !missing.includes(r)), missing };
}
