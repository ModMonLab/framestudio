/**
 * Character creation from a base character (FR-CHR builder path, FR-AGT-02 `create_character`): copies a library or
 * project character, applies part, body, colour, look and performance changes, and checks every referenced asset
 * exists with the right kind. The result is a project-local character manifest added with `asset.addLocal`.
 */
import { FrameError, type AssetManifest, type Project, type Scene } from '@frame/schema';
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
  /** Life stage asset (Catalog A1). */
  lifeStage?: string;
  /** Control values by control asset ref (sliders 0–100, option names, colours); `null` resets a control. */
  controls?: Record<string, number | string | null>;
  /** Skin details, makeup and identity overlays (replaces the list). */
  details?: string[];
  /** What changed, recorded on new versions (FR-AST-05). */
  changes?: string;
}

export interface CharacterLookup {
  manifest(ref: string): AssetManifest | undefined;
}

export function buildCharacter(spec: CharacterSpec, lookup: CharacterLookup, o: { id: string; date: string; author: string; version?: number }): AssetManifest {
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
  if (spec.lifeStage) {
    expect(spec.lifeStage, ['stage'], 'lifeStage');
    data.lifeStage = spec.lifeStage;
  }
  for (const [ref, v] of Object.entries(spec.controls ?? {})) {
    if (v === null) {
      delete data.controls[ref];
      continue;
    }
    const k = kindOf(ref);
    if (!k) problems.push(`controls: ${ref} does not exist`);
    else if (!k.endsWith('-ctl')) problems.push(`controls: ${ref} is a ${k}, not a control`);
    else if (typeof v === 'number' && (v < 0 || v > 100)) problems.push(`controls.${ref} must be 0–100`);
    data.controls[ref] = v;
  }
  if (spec.details) {
    for (const d of spec.details) if (!kindOf(d)) problems.push(`details: ${d} does not exist`);
    data.details = [...spec.details];
  }
  if (problems.length) throw new FrameError('VALIDATION_FAILED', `The character is not valid: ${problems.join('; ')}`, { problems });
  const { review: _review, changes: _changes, ...rest } = base;
  const version = o.version ?? 1;
  return {
    ...rest,
    id: o.id,
    version,
    name: spec.name.trim(),
    category: 'Characters',
    group: 'Project cast',
    tags: ['cast', 'project'],
    synonyms: [],
    provenance: { method: 'authored', author: o.author, date: o.date, notes: version > 1 ? `Version ${version} of ${o.id}.` : `Built from ${spec.from}.` },
    ...(spec.changes ? { changes: spec.changes } : {}),
    data,
  } as AssetManifest;
}

/**
 * Saving a character (FR-CHR-10, FR-BLD-06): a project character gets its next free version under the same ID; a
 * library character cannot change, so saving it creates a new project character ("Save as new").
 */
export function characterVersionTarget(from: string, versionsOf: (id: string) => number[], newId: () => string, asNew = false): { id: string; version: number; isNew: boolean } {
  const at = from.lastIndexOf('@');
  const id = from.slice(0, at);
  if (asNew || !id.startsWith('user.')) return { id: newId(), version: 1, isNew: true };
  return { id, version: Math.max(0, ...versionsOf(id)) + 1, isNew: false };
}

/** Every place a scene uses any version of an asset: instances, clips, instance voices and base expressions (FR-AST-05). */
export interface AssetUsage {
  ref: string;
  scene: string;
  sceneName: string;
  kind: 'instance' | 'clip' | 'voice' | 'expression' | 'cast';
  id: string;
  name: string;
}

export function assetUsages(state: { scenes: Record<string, Scene>; project: Project }, assetId: string): AssetUsage[] {
  const out: AssetUsage[] = [];
  const is = (ref: string | undefined) => !!ref && ref.slice(0, ref.lastIndexOf('@')) === assetId;
  for (const c of state.project.cast) if (is(c.character)) out.push({ ref: c.character, scene: '', sceneName: '', kind: 'cast', id: c.id, name: c.name });
  for (const sc of Object.values(state.scenes)) {
    for (const i of sc.instances) {
      if (is(i.asset)) out.push({ ref: i.asset!, scene: sc.id, sceneName: sc.name, kind: 'instance', id: i.id, name: i.name });
      if (is(i.character?.voice)) out.push({ ref: i.character!.voice!, scene: sc.id, sceneName: sc.name, kind: 'voice', id: i.id, name: i.name });
      if (is(i.character?.baseExpression)) out.push({ ref: i.character!.baseExpression!, scene: sc.id, sceneName: sc.name, kind: 'expression', id: i.id, name: i.name });
    }
    for (const c of sc.clips) if (is(c.asset)) out.push({ ref: c.asset!, scene: sc.id, sceneName: sc.name, kind: 'clip', id: c.id, name: c.name ?? c.asset! });
  }
  return out;
}

export interface CharacterVersionRequest {
  /** The character version being edited. */
  from: string;
  /** Changes relative to `from` (name optional). */
  spec?: Omit<CharacterSpec, 'from' | 'name'> & { name?: string };
  /** Save as a new character instead of a new version. */
  asNew?: boolean;
  /** Switch usages to the saved version: one instance, every instance in a scene, or the project. */
  update?: { scope: 'instance' | 'scene' | 'project'; scene?: string; instance?: string };
}

/**
 * Commands that save a character version (FR-CHR-10, FR-BLD-06): `asset.addLocal` of version n+1 (or a new character
 * plus its cast entry) and, when asked, the switch of the chosen usages — all one undoable step. A new character
 * replaces the old one only in the instance or scene asked for, never project-wide.
 */
export function characterVersionCommands(
  state: { scenes: Record<string, Scene>; project: Project },
  req: CharacterVersionRequest,
  lookup: CharacterLookup & { versions(id: string): number[] },
  o: { newId: () => string; date: string; author: string },
): { manifest: AssetManifest; commands: { name: string; params: Record<string, unknown> }[]; label: string; isNew: boolean } {
  const base = req.from ? lookup.manifest(req.from) : undefined;
  if (!base || base.kind !== 'chr') throw new FrameError('NOT_FOUND', `${req.from} is not a character`);
  const target = characterVersionTarget(req.from, (id) => lookup.versions(id), o.newId, req.asNew === true);
  const name = req.spec?.name ?? (target.isNew && req.asNew ? `${base.name} copy` : base.name);
  const manifest = buildCharacter({ ...(req.spec ?? {}), from: req.from, name }, lookup, { id: target.id, version: target.version, date: o.date, author: o.author });
  const ref = `${manifest.id}@${manifest.version}`;
  const commands: { name: string; params: Record<string, unknown> }[] = [{ name: 'asset.addLocal', params: { manifest } }];
  if (target.isNew) commands.push({ name: 'cast.add', params: { character: ref, name: manifest.name } });
  const u = req.update;
  if (u) {
    const data = manifest.data as CharacterData;
    const looks = data.looks.map((l) => l.id);
    if (u.scope !== 'project' && !u.scene) throw new FrameError('USAGE', 'update.scene is required for scope instance or scene');
    if (u.scope === 'instance' && !u.instance) throw new FrameError('USAGE', 'update.instance is required for scope instance');
    if (target.isNew) {
      if (u.scope === 'project') throw new FrameError('USAGE', 'A new character replaces the old one in an instance or a scene, not the whole project');
      const sc = state.scenes[u.scene!];
      if (!sc) throw new FrameError('NOT_FOUND', `Scene ${u.scene} not found`);
      for (const i of sc.instances) {
        if (i.asset !== req.from || (u.scope === 'instance' && i.id !== u.instance)) continue;
        commands.push({ name: 'instance.update', params: { scene: sc.id, id: i.id, set: { asset: ref, name: manifest.name, ...(i.character && !looks.includes(i.character.look) ? { character: { look: data.defaultLook } } : {}) } } });
      }
    } else {
      commands.push({ name: 'asset.updateUsages', params: { from: req.from, to: ref, scope: u.scope, ...(u.scene ? { scene: u.scene } : {}), ...(u.instance ? { instance: u.instance } : {}), looks, fallbackLook: data.defaultLook } });
    }
  }
  const label = target.isNew ? `Save ${manifest.name} as a new character` : `Save ${manifest.name} version ${manifest.version}`;
  return { manifest, commands, label, isNew: target.isNew };
}
