import type { LocalIdPrefix } from '@frame/schema';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export type IdSource = (prefix: LocalIdPrefix) => string;

/** Random project-local ID, e.g. `scn_a8Kd02LmQz` (FR-DAT-01). */
export const randomId: IdSource = (prefix) => {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % 62];
  return `${prefix}_${s}`;
};

/** Deterministic ID source for tests and seeded generation. */
export function sequentialIds(seed = 0): IdSource {
  let n = seed;
  return (prefix) => {
    n++;
    return `${prefix}_${n.toString(36).padStart(8, '0')}`;
  };
}

/** Deterministic PRNG (mulberry32) used for every seeded random choice (FR-RND-02). */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a) for deriving per-object seeds. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
