/**
 * Character builder draft (FR-BLD-01..08): the builder edits a local copy of a character version; nothing reaches the
 * project until "Save version" turns the draft into a new immutable version through the server (FR-CHR-10).
 */
import type { CharacterData, CharacterSpec, LookData } from '@frame/core';
import type { AssetManifest } from '@frame/schema';

export interface Draft {
  name: string;
  data: CharacterData;
}

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function initDraft(m: AssetManifest): Draft {
  return { name: m.name, data: clone(m.data as CharacterData) };
}

/** Optional parts that can be removed (None). */
export const OPTIONAL_PARTS = ['fringe', 'facialHair'];

/**
 * The draft as the changes the server applies to the edited version (`buildCharacter` spec). Only fields that differ
 * from the saved version are sent, so references the saved version already carries are not re-validated.
 */
export function draftSpec(base: AssetManifest, d: Draft): Omit<CharacterSpec, 'from'> {
  const b = base.data as CharacterData;
  const D = d.data;
  const ne = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);
  const spec: Omit<CharacterSpec, 'from'> = { name: d.name };
  if (ne(b.role, D.role)) spec.role = D.role ?? '';
  if (ne(b.notes, D.notes)) spec.notes = D.notes ?? '';
  if (ne(b.lifeStage, D.lifeStage)) spec.lifeStage = D.lifeStage;
  if (ne(b.bodyBase, D.bodyBase)) spec.bodyBase = D.bodyBase;
  if (ne(b.body, D.body)) spec.body = D.body;
  const parts: Record<string, string | null> = {};
  for (const k of new Set([...Object.keys(b.parts), ...Object.keys(D.parts)])) {
    if (!ne(b.parts[k], D.parts[k])) continue;
    if (D.parts[k]) parts[k] = D.parts[k]!;
    else if (OPTIONAL_PARTS.includes(k)) parts[k] = null;
  }
  if (Object.keys(parts).length) spec.parts = parts;
  const colors: Record<string, string> = {};
  for (const k of Object.keys(D.colors)) if (ne(b.colors[k], D.colors[k])) colors[k] = D.colors[k]!;
  if (Object.keys(colors).length) spec.colors = colors;
  if (ne(b.looks, D.looks)) spec.looks = D.looks;
  if (ne(b.defaultLook, D.defaultLook) || spec.looks) spec.defaultLook = D.defaultLook;
  const controls: Record<string, number | string | null> = {};
  for (const k of new Set([...Object.keys(b.controls), ...Object.keys(D.controls)])) if (ne(b.controls[k], D.controls[k])) controls[k] = D.controls[k] ?? null;
  if (Object.keys(controls).length) spec.controls = controls;
  if (ne(b.details ?? [], D.details ?? [])) spec.details = D.details ?? [];
  if (ne(b.voice, D.voice) && D.voice) spec.voice = D.voice;
  if (ne(b.performance, D.performance)) spec.performance = D.performance;
  return spec;
}

export function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Builder tree nodes whose values differ from the saved version (the accent "changed" dot, Design System §7.2). */
export function changedNodes(base: Draft, d: Draft): Set<string> {
  const out = new Set<string>();
  const ne = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
  const B = base.data;
  const D = d.data;
  if (base.name !== d.name || ne(B.role, D.role) || ne(B.notes, D.notes) || ne(B.lifeStage, D.lifeStage)) out.add('identity');
  if (ne(B.bodyBase, D.bodyBase)) out.add('body.base');
  const bodyKeys = (keys: string[]) => keys.some((k) => ne((B.body as Record<string, unknown>)[k], (D.body as Record<string, unknown>)[k]));
  if (bodyKeys(TORSO.map((x) => x[0]))) out.add('body.torso');
  if (bodyKeys(ARMS.map((x) => x[0])) || ne(B.parts.hands, D.parts.hands)) out.add('body.arms');
  if (bodyKeys(LEGS.map((x) => x[0])) || ne(B.parts.feet, D.parts.feet)) out.add('body.legs');
  for (const [node, key] of [['head.shape', 'head'], ['head.eyes', 'eyes'], ['head.brows', 'brows'], ['head.nose', 'nose'], ['head.mouth', 'mouth'], ['head.ears', 'ears'], ['hair.style', 'hair'], ['hair.facial', 'facialHair']] as const) {
    if (ne(B.parts[key], D.parts[key])) out.add(node);
  }
  if (ne(B.parts.fringe, D.parts.fringe)) out.add('hair.style');
  for (const k of new Set([...Object.keys(B.controls), ...Object.keys(D.controls)])) {
    if (!ne(B.controls[k], D.controls[k])) continue;
    out.add(CONTROL_NODE[k.slice(0, k.indexOf('.'))] ?? 'head.shape');
  }
  if (ne(B.colors.skin, D.colors.skin) || ne(B.details, D.details)) out.add('head.skin');
  if (ne(B.colors.hair, D.colors.hair)) out.add('hair.colour');
  if (ne(B.looks, D.looks) || ne(B.defaultLook, D.defaultLook)) out.add('wardrobe.looks');
  if (ne(B.voice, D.voice)) out.add('voice.asset');
  if (ne(B.performance, D.performance)) out.add('performance');
  for (const n of [...out]) {
    const parent = n.includes('.') ? n.slice(0, n.indexOf('.')) : undefined;
    if (parent) out.add(parent);
  }
  return out;
}

/** Control asset kinds and the builder node that shows them. */
export const CONTROL_NODE: Record<string, string> = { 'face-ctl': 'head.shape', 'eye-ctl': 'head.eyes', 'hair-ctl': 'hair.style' };

/** Body sliders (rig body parameters, 0–100) grouped like the builder sections (FR-BLD-02). */
export const TORSO: [string, string, [string, string]][] = [
  ['shoulders', 'Shoulder width', ['Narrow', 'Broad']], ['chest', 'Chest', ['Less', 'More']], ['bust', 'Bust', ['None', 'Full']],
  ['waist', 'Waist width', ['Narrow', 'Wide']], ['belly', 'Belly', ['Flat', 'Round']], ['hips', 'Hip width', ['Narrow', 'Wide']], ['stoop', 'Posture', ['Upright', 'Stooped']],
];
export const ARMS: [string, string, [string, string]][] = [['armLength', 'Arm length', ['Shorter', 'Longer']], ['limbThickness', 'Limb thickness', ['Slender', 'Sturdy']]];
export const LEGS: [string, string, [string, string]][] = [['legLength', 'Leg length', ['Shorter', 'Longer']]];
export const BODY_DEFAULTS: Record<string, number> = { shoulders: 50, chest: 50, waist: 50, hips: 50, armLength: 50, legLength: 50, limbThickness: 50, belly: 0, bust: 0, stoop: 0 };

/** Garment kinds a look holds, in wardrobe order. */
export const GARMENT_SLOTS: [string, string][] = [['top', 'Top'], ['outer', 'Outerwear'], ['bottom', 'Bottoms'], ['dress', 'Dresses'], ['shoe', 'Shoes']];

export function newLookId(looks: LookData[], name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'look';
  let id = base;
  for (let i = 2; looks.some((l) => l.id === id); i++) id = `${base}-${i}`;
  return id;
}

/** Deterministic pseudo-random generator for "Randomise" (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomiseOptions {
  /** Choices per part key (refs), from the library. */
  parts: Record<string, string[]>;
  skins: string[];
  hairColors: string[];
  bodies: string[];
  /** Keep these unchanged (constraints). */
  keep: { lifeStage: boolean; body: boolean; palette: boolean };
}

/** "Randomise" within constraints (FR-BLD-05): parts, body base and colours; identity, looks and voice stay. */
export function randomise(d: Draft, o: RandomiseOptions, seed: number): Draft {
  const r = rng(seed);
  const pick = <T,>(xs: T[]): T | undefined => (xs.length ? xs[Math.floor(r() * xs.length)] : undefined);
  const next = clone(d);
  for (const [key, refs] of Object.entries(o.parts)) {
    const v = pick(refs);
    if (v) next.data.parts[key] = v;
  }
  if (!o.keep.body) {
    const b = pick(o.bodies);
    if (b) next.data.bodyBase = b;
    next.data.body = {};
  }
  if (!o.keep.palette) {
    const s = pick(o.skins);
    if (s) next.data.colors.skin = s;
    const h = pick(o.hairColors);
    if (h) next.data.colors.hair = h;
  }
  return next;
}
