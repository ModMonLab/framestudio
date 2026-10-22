/**
 * Character creation from a base character (FR-CHR builder path, FR-AGT-02 `create_character`): copies a library or
 * project character, applies part, body, colour, look and performance changes, and checks every referenced asset
 * exists with the right kind. The result is a project-local character manifest added with `asset.addLocal`.
 */
import { FrameError, type AssetManifest } from '@frame/schema';
import type { CharacterData, LookData } from './perform/character.js';

/** `parts` keys of a character and the asset kinds that may fill them. */
export const CHARACTER_PART_KINDS: Record<string, string[]> = {
  head: ['head'], eyes: ['eyes'], brows: ['brow'], nose: ['nose'], mouth: ['mouth'], ears: ['ears'], hair: ['hair'],
  fringe: ['fringe'], facialHair: ['facial-hair'], feet: ['feet'], hands: ['base'], base: ['base'],
};
const GARMENT_KINDS = ['top', 'outer', 'bottom', 'dress', 'shoe'];
const HEX = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export interface CharacterSpec {
  name: string;
  /** Character to start from (library `chr.*@n` or a project character). */
  from: string;
  role?: string;
  notes?: string;
  bodyBase?: string;
  body?: CharacterData['body'];
  /** Part refs by `parts` key; `null` removes an optional part (fringe, facial hair). */
  parts?: Record<string, string | null>;
  colors?: Record<string, string>;
  /** Replaces the looks; the first is the default unless `defaultLook` is given. */
  looks?: LookData[];
  defaultLook?: string;
  voice?: string;
  performance?: Partial<CharacterData['performance']>;
}

export interface CharacterLookup {
  manifest(ref: string): AssetManifest | undefined;
}

export function buildCharacter(spec: CharacterSpec, lookup: CharacterLookup, o: { id: string; date: string; author: string }): AssetManifest {
  const problems: string[] = [];
  const base = lookup.manifest(spec.from);
  if (!base || base.kind !== 'chr') throw new FrameError('NOT_FOUND', `${spec.from} is not a character`, { from: spec.from }, 'Start from a character returned by search_assets with kind "chr".');
  if (!spec.name?.trim()) problems.push('name is required');
  const kindOf = (ref: string) => lookup.manifest(ref)?.kind;
  const expect = (ref: string, kinds: string[], what: string) => {
    const k = kindOf(ref);
    if (!k) problems.push(`${what}: ${ref} does not exist`);
    else if (!kinds.includes(k)) problems.push(`${what}: ${ref} is a ${k}, expected ${kinds.join(' or ')}`);
  };
  const data: CharacterData = JSON.parse(JSON.stringify(base.data));
  if (spec.role !== undefined) data.role = spec.role;
  if (spec.notes !== undefined) data.notes = spec.notes;
  if (spec.bodyBase) {
    expect(spec.bodyBase, ['body'], 'bodyBase');
    data.bodyBase = spec.bodyBase;
  }
  if (spec.body) {
    for (const [k, v] of Object.entries(spec.body)) if (typeof v !== 'number' || v < 0 || v > 100) problems.push(`body.${k} must be 0–100`);
    data.body = { ...data.body, ...spec.body };
  }
  for (const [key, ref] of Object.entries(spec.parts ?? {})) {
    const kinds = CHARACTER_PART_KINDS[key];
    if (!kinds) {
      problems.push(`parts.${key} is not a character part (${Object.keys(CHARACTER_PART_KINDS).join(', ')})`);
      continue;
    }
    if (ref === null) {
      if (!['fringe', 'facialHair'].includes(key)) problems.push(`parts.${key} cannot be removed`);
      else delete data.parts[key];
      continue;
    }
    expect(ref, kinds, `parts.${key}`);
    data.parts[key] = ref;
  }
  for (const [k, c] of Object.entries(spec.colors ?? {})) {
    if (!HEX.test(c)) problems.push(`colors.${k} must be #RRGGBB`);
    data.colors[k] = c;
  }
  if (spec.looks) {
    if (!spec.looks.length) problems.push('looks must not be empty');
    for (const l of spec.looks) {
      for (const g of l.garments ?? []) expect(g, GARMENT_KINDS, `look ${l.id} garment`);
      for (const a of l.accessories ?? []) expect(a, ['acc'], `look ${l.id} accessory`);
      for (const [k, c] of Object.entries(l.colors ?? {})) if (!HEX.test(c)) problems.push(`look ${l.id} colors.${k} must be #RRGGBB`);
    }
    data.looks = spec.looks.map((l) => ({ ...l, garments: l.garments ?? [], accessories: l.accessories ?? [], colors: l.colors ?? {} }));
    data.defaultLook = spec.looks[0]?.id ?? data.defaultLook;
  }
  if (spec.defaultLook) {
    if (!data.looks.some((l) => l.id === spec.defaultLook)) problems.push(`defaultLook ${spec.defaultLook} is not one of the looks`);
    data.defaultLook = spec.defaultLook;
  }
  if (spec.voice !== undefined) {
    expect(spec.voice, ['voice'], 'voice');
    data.voice = spec.voice;
  }
  if (spec.performance) data.performance = { ...data.performance, ...spec.performance };
  if (problems.length) throw new FrameError('VALIDATION_FAILED', `The character is not valid: ${problems.join('; ')}`, { problems });
  const { review: _review, ...rest } = base;
  return {
    ...rest,
    id: o.id,
    version: 1,
    name: spec.name.trim(),
    category: 'Characters',
    group: 'Project cast',
    tags: ['cast', 'project'],
    synonyms: [],
    provenance: { method: 'authored', author: o.author, date: o.date, notes: `Built from ${spec.from}.` },
    data,
  } as AssetManifest;
}
