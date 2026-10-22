/**
 * Rigging assistant (FR-IMP-03): turns layered artwork into a character on `rig.biped@1`. Layers are mapped to rig
 * targets by name convention (`head`, `eye_L`, `mouth_A`, `upper_arm_R` …) with suggestions the user can change;
 * frames (head centre and size, shoulder and hip lines, limb segments) come from the mapped layers' bounds in each
 * view; every layer becomes placed artwork in its fit space. Views the artwork lacks are declared as gaps; missing
 * mouth shapes or hands can be supplied by library parts. Pure: the caller stores media and manifests.
 */
import type { AssetManifest, View } from '@frame/schema';
import { MOUTH_SHAPES, type FitSpace, type LayerDef, type PartData, type PlacedArt, type ShapeDef, type ViewArt } from '@frame/rig';
import type { CharacterData } from './perform/character.js';

export const RIG_TARGETS = [
  'head', 'neck', 'hair_back', 'hair_front', 'fringe', 'eyes', 'brows', 'nose', 'mouth', 'ears', 'face_detail',
  'torso', 'pelvis',
  'upper_arm_L', 'upper_arm_R', 'forearm_L', 'forearm_R', 'hand_L', 'hand_R',
  'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R',
  'ignore',
] as const;
export type RigTarget = (typeof RIG_TARGETS)[number];

export const RIG_TARGET_LABELS: Record<RigTarget, string> = {
  head: 'Head', neck: 'Neck', hair_back: 'Hair (behind head)', hair_front: 'Hair (in front)', fringe: 'Fringe', eyes: 'Eyes', brows: 'Eyebrows',
  nose: 'Nose', mouth: 'Mouth shape', ears: 'Ears', face_detail: 'Face detail', torso: 'Torso', pelvis: 'Hips and pelvis',
  upper_arm_L: 'Upper arm (left)', upper_arm_R: 'Upper arm (right)', forearm_L: 'Forearm (left)', forearm_R: 'Forearm (right)',
  hand_L: 'Hand (left)', hand_R: 'Hand (right)', thigh_L: 'Thigh (left)', thigh_R: 'Thigh (right)', shin_L: 'Shin (left)', shin_R: 'Shin (right)',
  foot_L: 'Foot (left)', foot_R: 'Foot (right)', ignore: 'Not used',
};

/** Input layer (bounds in artwork units; raster media hash or vector paths). */
export interface RigLayer {
  id: string;
  name: string;
  view?: View;
  bounds: [number, number, number, number];
  media?: string;
  paths?: PlacedArt['paths'];
}

const SIDE = /(?:^|[\s_.-])(l|left|r|right)$|^(l|left|r|right)[\s_.-]/i;
function sideOf(name: string): 'L' | 'R' | undefined {
  const m = name.trim().match(SIDE);
  const s = (m?.[1] ?? m?.[2])?.toLowerCase();
  return s ? (s.startsWith('l') ? 'L' : 'R') : undefined;
}

/** Mouth shape letter from a layer name: `mouth_A` … `mouth_H`, `mouth_X` or `mouth_rest`. */
export function mouthLetter(name: string): string | undefined {
  const m = name.trim().match(/(?:^|[\s_.-])(rest|[a-hx])$/i);
  if (!m) return /^(mouth|lips?)$/i.test(name.trim()) ? 'X' : undefined;
  return m[1]!.toLowerCase() === 'rest' ? 'X' : m[1]!.toUpperCase();
}

/** Suggested target from a layer name (FR-IMP-03 auto-suggestions). */
export function suggestTarget(name: string): RigTarget {
  const n = name.toLowerCase().replace(/[\s.-]+/g, '_');
  const side = sideOf(name) ?? 'L';
  const t = (base: string) => `${base}_${side}` as RigTarget;
  if (/hair.*(back|behind)|back_?hair/.test(n)) return 'hair_back';
  if (/fringe|bangs/.test(n)) return 'fringe';
  if (/hair/.test(n)) return 'hair_front';
  if (/brow/.test(n)) return 'brows';
  if (/eye|iris|pupil/.test(n)) return 'eyes';
  if (/nose/.test(n)) return 'nose';
  if (/mouth|lips?($|_)/.test(n)) return 'mouth';
  if (/(^|_)ears?($|_)/.test(n)) return 'ears';
  if (/blush|freckle|beard|mustache|moustache|glasses|scar/.test(n)) return 'face_detail';
  if (/(^|_)(head|face|skull)($|_)/.test(n)) return 'head';
  if (/neck/.test(n)) return 'neck';
  if (/upper_?arm|bicep|(^|_)arm_?upper/.test(n)) return t('upper_arm');
  if (/fore_?arm|lower_?arm|arm_?lower/.test(n)) return t('forearm');
  if (/hand|fist|palm/.test(n)) return t('hand');
  if (/thigh|upper_?leg/.test(n)) return t('thigh');
  if (/shin|calf|lower_?leg/.test(n)) return t('shin');
  if (/foot|feet|shoe|boot/.test(n)) return t('foot');
  if (/(^|_)arm($|_)|sleeve/.test(n)) return t('upper_arm');
  if (/(^|_)leg($|_)/.test(n)) return t('thigh');
  if (/pelvis|hips?($|_)|waist|pants|trousers|skirt|shorts/.test(n)) return 'pelvis';
  if (/torso|body|chest|shirt|top|jacket|coat|dress/.test(n)) return 'torso';
  return 'ignore';
}

interface TargetDef {
  part: 'head' | 'eyes' | 'brows' | 'nose' | 'mouth' | 'ears' | 'hair' | 'base' | 'hands' | 'feet';
  slot: string;
  space: FitSpace;
}
const TARGET: Record<Exclude<RigTarget, 'ignore'>, TargetDef> = {
  head: { part: 'head', slot: 'head', space: 'head' },
  neck: { part: 'head', slot: 'neck', space: 'head' },
  face_detail: { part: 'head', slot: 'face.overlay', space: 'head' },
  hair_back: { part: 'hair', slot: 'hair.back', space: 'head' },
  hair_front: { part: 'hair', slot: 'hair.front', space: 'head' },
  fringe: { part: 'hair', slot: 'fringe', space: 'head' },
  eyes: { part: 'eyes', slot: 'eyes', space: 'head' },
  brows: { part: 'brows', slot: 'brows', space: 'head' },
  nose: { part: 'nose', slot: 'nose', space: 'head' },
  mouth: { part: 'mouth', slot: 'mouth', space: 'head' },
  ears: { part: 'ears', slot: 'ears', space: 'head' },
  torso: { part: 'base', slot: 'body.torso', space: 'torso' },
  pelvis: { part: 'base', slot: 'body.pelvis', space: 'pelvis' },
  upper_arm_L: { part: 'base', slot: 'arm.*', space: 'upperArmL' },
  upper_arm_R: { part: 'base', slot: 'arm.*', space: 'upperArmR' },
  forearm_L: { part: 'base', slot: 'arm.*', space: 'foreArmL' },
  forearm_R: { part: 'base', slot: 'arm.*', space: 'foreArmR' },
  hand_L: { part: 'hands', slot: 'hand.*', space: 'handL' },
  hand_R: { part: 'hands', slot: 'hand.*', space: 'handR' },
  thigh_L: { part: 'base', slot: 'leg.*', space: 'thighL' },
  thigh_R: { part: 'base', slot: 'leg.*', space: 'thighR' },
  shin_L: { part: 'base', slot: 'leg.*', space: 'shinL' },
  shin_R: { part: 'base', slot: 'leg.*', space: 'shinR' },
  foot_L: { part: 'feet', slot: 'foot.*', space: 'footL' },
  foot_R: { part: 'feet', slot: 'foot.*', space: 'footR' },
};

const PART_SLOT: Record<TargetDef['part'], string> = { head: 'head', eyes: 'eyes', brows: 'brows', nose: 'nose', mouth: 'mouth', ears: 'ears', hair: 'hair', base: 'body', hands: 'hands', feet: 'feet' };
const PART_NAMES: Record<TargetDef['part'], string> = { head: 'Head', eyes: 'Eyes', brows: 'Eyebrows', nose: 'Nose', mouth: 'Mouth', ears: 'Ears', hair: 'Hair', base: 'Body', hands: 'Hands', feet: 'Feet' };
/** Character `parts` keys for the generated parts. */
const PART_KEY: Record<TargetDef['part'], string> = { head: 'head', eyes: 'eyes', brows: 'brows', nose: 'nose', mouth: 'mouth', ears: 'ears', hair: 'hair', base: 'base', hands: 'hands', feet: 'feet' };

type Box = [number, number, number, number];
const union = (bs: Box[]): Box | undefined => {
  if (!bs.length) return undefined;
  const x0 = Math.min(...bs.map((b) => b[0]));
  const y0 = Math.min(...bs.map((b) => b[1]));
  const x1 = Math.max(...bs.map((b) => b[0] + b[2]));
  const y1 = Math.max(...bs.map((b) => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};

export interface RigRequest {
  name: string;
  layers: RigLayer[];
  /** layer id → target (missing ids use the suggestion). */
  mapping: Record<string, RigTarget>;
  /** Library parts that fill gaps: e.g. `{ mouth: 'mouth.<id>@1' }` when the artwork lacks speech shapes. */
  libraryParts?: Partial<Record<'mouth' | 'hands' | 'feet' | 'eyes' | 'brows', string>>;
  colors?: Record<string, string>;
  /** IDs for generated assets. */
  newId: () => string;
  author: string;
  date: string;
  sourceFile: string;
  rights: string;
}

export interface RigProblem { severity: 'error' | 'warning'; message: string }

export interface RigResult {
  character: AssetManifest;
  parts: AssetManifest[];
  views: View[];
  mouthShapes: string[];
  problems: RigProblem[];
  /** Effective target per layer (after suggestions). */
  mapping: Record<string, RigTarget>;
}

/** Builds the character and its parts from mapped artwork. Problems with severity error mean it cannot be saved. */
export function rigArtwork(req: RigRequest): RigResult {
  const problems: RigProblem[] = [];
  const mapping: Record<string, RigTarget> = {};
  for (const l of req.layers) mapping[l.id] = req.mapping[l.id] ?? suggestTarget(l.name);
  const viewsOf = [...new Set(req.layers.map((l) => l.view ?? 'front'))] as View[];
  const ALL: View[] = ['front', 'three', 'side', 'back'];
  const views = ALL.filter((v) => viewsOf.includes(v));
  const partArt = new Map<TargetDef['part'], Partial<Record<View, ViewArt>>>();
  const mouthLetters = new Set<string>();
  const anchorsByView: Partial<Record<View, ViewArt['anchors']>> = {};
  let headRatio: number | undefined;

  for (const view of views) {
    const layers = req.layers.filter((l) => (l.view ?? 'front') === view && mapping[l.id] !== 'ignore');
    const of = (t: RigTarget) => layers.filter((l) => mapping[l.id] === t);
    const head = union(of('head').map((l) => l.bounds));
    if (!head) {
      problems.push({ severity: 'error', message: `The ${view} view has no layer mapped to Head` });
      continue;
    }
    const hc: [number, number] = [head[0] + head[2] / 2, head[1] + head[3] / 2];
    const torso = union(of('torso').map((l) => l.bounds));
    const pelvis = union(of('pelvis').map((l) => l.bounds)) ?? (torso ? [torso[0], torso[1] + torso[3], torso[2], torso[3] * 0.25] as Box : undefined);
    if (!torso && layers.some((l) => TARGET[mapping[l.id] as Exclude<RigTarget, 'ignore'>].space !== 'head')) problems.push({ severity: 'warning', message: `The ${view} view has body layers but none mapped to Torso; body parts are placed relative to the head` });
    // Body frame fallback: a torso box under the head.
    const tb: Box = torso ?? [head[0], head[1] + head[3], head[2], head[3] * 1.5];
    const pb: Box = pelvis ?? [tb[0], tb[1] + tb[3], tb[2], tb[3] * 0.25];
    if (view === views[0]) {
      const all = union(layers.map((l) => l.bounds))!;
      const total = all[1] + all[3] - head[1];
      if (total > head[3] * 1.2) headRatio = Math.max(2, Math.min(9, total / head[3]));
    }
    const anchors: NonNullable<ViewArt['anchors']> = {};
    const box = (l: RigLayer, def: TargetDef): [number, number, number, number] => {
      const [x, y, w, h] = l.bounds;
      switch (def.space) {
        case 'head': return [(x - hc[0]) / (head[2] / 2), (y - hc[1]) / (head[3] / 2), (x + w - hc[0]) / (head[2] / 2), (y + h - hc[1]) / (head[3] / 2)];
        case 'torso': return [(x - (tb[0] + tb[2] / 2)) / (tb[2] / 2), (y - tb[1]) / tb[3], (x + w - (tb[0] + tb[2] / 2)) / (tb[2] / 2), (y + h - tb[1]) / tb[3]];
        case 'pelvis': return [(x - (pb[0] + pb[2] / 2)) / (pb[2] / 2), (y - pb[1]) / pb[3], (x + w - (pb[0] + pb[2] / 2)) / (pb[2] / 2), (y + h - pb[1]) / pb[3]];
        case 'handL': case 'handR': {
          const k = w / h;
          return [-k / 2, -0.05, k / 2, 0.95];
        }
        case 'footL': case 'footR': {
          const k = h / w;
          return [-0.25, -k * 0.6, 0.75, k * 0.4];
        }
        default:
          // Limb segments: drawn hanging down; the layer spans the bone from its top to its bottom.
          return [-1, 0, 1, 1];
      }
    };
    const layersByPart = new Map<TargetDef['part'], LayerDef[]>();
    for (const l of layers) {
      const target = mapping[l.id]!;
      if (target === 'ignore') continue;
      const def = TARGET[target];
      const art: PlacedArt = { box: box(l, def), src: l.bounds, ...(l.media ? { image: l.media } : {}), ...(l.paths ? { paths: l.paths } : {}) };
      const shape: ShapeDef = { art };
      let when: LayerDef['when'];
      if (target === 'mouth') {
        const letter = mouthLetter(l.name);
        if (!letter) {
          problems.push({ severity: 'warning', message: `Mouth layer "${l.name}" has no shape letter (mouth_A … mouth_H, mouth_X); used as the resting mouth` });
        }
        const L = letter ?? 'X';
        mouthLetters.add(`${view}:${L}`);
        when = { mouth: L === 'X' ? ['X'] : [L] };
      }
      const list = layersByPart.get(def.part) ?? [];
      list.push({ slot: def.slot, space: def.space, shapes: [shape], ...(when ? { when } : {}) });
      layersByPart.set(def.part, list);
      // Feature anchors on the head art let library parts (mouth, eyes, brows) fill gaps in place (FR-IMP-03).
      if (def.space === 'head' && ['eyes', 'brows', 'mouth', 'nose', 'ears'].includes(target)) {
        const [u0, v0, u1, v1] = art.box;
        const at: [number, number] = [(u0 + u1) / 2, (v0 + v1) / 2];
        const s = sideOf(l.name);
        const nm = target === 'eyes' ? `eye${s ?? (at[0] < 0 ? 'R' : 'L')}` : target === 'brows' ? `brow${s ?? (at[0] < 0 ? 'R' : 'L')}` : target === 'ears' ? `ear${s ?? (at[0] < 0 ? 'R' : 'L')}` : target;
        if (!anchors[nm]) anchors[nm] = { space: 'head', at };
      }
    }
    // Default anchors where the artwork has no feature layer (a typical face layout in head units).
    const defaults: Record<string, [number, number]> = { eyeL: [0.35, -0.05], eyeR: [-0.35, -0.05], browL: [0.35, -0.3], browR: [-0.35, -0.3], nose: [0, 0.2], mouth: [0, 0.5], earL: [0.95, 0.05], earR: [-0.95, 0.05] };
    for (const [k, at] of Object.entries(defaults)) if (!anchors[k]) anchors[k] = { space: 'head', at };
    anchorsByView[view] = anchors;
    for (const [part, ls] of layersByPart) {
      const m = partArt.get(part) ?? {};
      m[view] = { points: {}, layers: ls, ...(part === 'head' ? { anchors } : {}) };
      partArt.set(part, m);
    }
  }

  // Mouth: all nine shapes in every drawn view, or a library mouth fills in (FR-LIP, FR-IMP-03).
  const letters = (v: View) => MOUTH_SHAPES.filter((x) => mouthLetters.has(`${v}:${x}`));
  const mouthComplete = views.filter((v) => v !== 'back').every((v) => letters(v).length === MOUTH_SHAPES.length);
  const useLibraryMouth = !!req.libraryParts?.mouth;
  if (!useLibraryMouth && partArt.has('mouth') && !mouthComplete) {
    problems.push({ severity: 'error', message: `The artwork has ${views.map((v) => `${letters(v).length} of 9 mouth shapes in ${v}`).join(', ')}; draw the rest (mouth_A … mouth_H, mouth_X) or use a library mouth` });
  }
  if (!useLibraryMouth && !partArt.has('mouth')) problems.push({ severity: 'error', message: 'No mouth layers: map mouth shapes or use a library mouth so the character can speak' });

  const exempt = Object.fromEntries((['front', 'three', 'side', 'back'] as View[]).filter((v) => !views.includes(v)).map((v) => [v, 'Not drawn in the imported artwork (FR-IMP-03 view gap)']));
  const licence = { id: 'LicenseRef-User-Owned', redistributable: true, commercialUse: true };
  const provenance = { method: 'imported' as const, author: req.author, date: req.date, sourceFile: req.sourceFile, rightsStatement: req.rights, notes: 'Rigged with the rigging assistant.' };
  const parts: AssetManifest[] = [];
  const partRefs: Record<string, string> = {};
  for (const [part, byView] of partArt) {
    if (part === 'mouth' && useLibraryMouth) continue;
    const famArt = { views: byView, ...(Object.keys(exempt).length ? { exempt } : {}) };
    // Back views have no face features (FR-LIP-05); those parts declare it.
    const faceFeature = ['eyes', 'brows', 'nose', 'mouth'].includes(part);
    const ex = { ...exempt, ...(faceFeature && !byView.back ? { back: 'Face features are not drawn from behind (FR-LIP-05)' } : {}) };
    const data: PartData = {
      slot: PART_SLOT[part],
      // The drawing is the drawing: both style families use the imported artwork (decision 0019).
      families: { flat: { ...famArt, ...(Object.keys(ex).length ? { exempt: ex } : {}) }, illustrated: { ...famArt, ...(Object.keys(ex).length ? { exempt: ex } : {}) } },
    };
    const id = `user.${req.newId()}`;
    parts.push({
      schemaVersion: 1, id, version: 1, kind: part === 'base' ? 'base' : part === 'brows' ? 'brow' : part === 'hands' ? 'base' : part, name: `${req.name} — ${PART_NAMES[part]}`,
      category: 'Imported parts', group: req.name, tags: ['imported', 'rigged'], synonyms: [], families: ['flat', 'illustrated'], views,
      viewExemptions: exempt, anchors: {}, capabilities: ['rig.biped@1'], parameters: [], dependencies: [], layering: {}, previews: {},
      license: licence, provenance, data,
    } as AssetManifest);
    partRefs[PART_KEY[part]] = `${id}@1`;
  }
  for (const [k, ref] of Object.entries(req.libraryParts ?? {})) if (ref) partRefs[k] = ref;
  if (!partRefs.head) problems.push({ severity: 'error', message: 'No head: map at least one layer to Head' });

  const data: CharacterData = {
    role: 'Imported character',
    lifeStage: '',
    bodyBase: '',
    body: headRatio ? { headRatio } as CharacterData['body'] : {},
    parts: partRefs,
    controls: {},
    colors: { skin: '#E0B48C', hair: '#3A2A20', lip: '#B5636A', eye: '#3B2A20', ...(req.colors ?? {}) },
    looks: [{ id: 'default', name: 'As drawn', garments: [], accessories: [], colors: {} }],
    defaultLook: 'default',
    performance: { idleEnergy: 40, gestureSize: 50, expressionStrength: 60, signatureActions: [] },
  };
  const character: AssetManifest = {
    schemaVersion: 1, id: `user.${req.newId()}`, version: 1, kind: 'chr', name: req.name, category: 'Characters', group: 'Project cast',
    tags: ['cast', 'imported'], synonyms: [], families: ['flat', 'illustrated'], views, viewExemptions: exempt, anchors: {}, capabilities: ['rig.biped@1'],
    parameters: [], dependencies: [], layering: {}, previews: {}, license: licence, provenance, data,
  } as AssetManifest;
  const mouthShapes = useLibraryMouth ? [...MOUTH_SHAPES] : MOUTH_SHAPES.filter((x) => views.some((v) => mouthLetters.has(`${v}:${x}`)));
  return { character, parts, views, mouthShapes, problems, mapping };
}
