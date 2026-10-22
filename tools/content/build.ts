/**
 * Builds bundled asset manifests (content/assets/<prefix>/<id>.json) from the catalog source and the authoring
 * generators. Every manifest records licence, provenance and review status (CAT-04/05/06). Run: pnpm content:build
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, type CatalogItem, type CatalogList } from '../../packages/assets/src/catalog.js';
import type { AssetManifest, View } from '../../packages/schema/src/index.js';
import type { PartData } from '../../packages/rig/src/types.js';
import { stableCompact } from '../../packages/io/src/fsutil.js';
import { headPart, HEAD_SHAPES } from './parts/head.js';
import { browPart, earsPart, eyesPart, mouthPart, nosePart } from './parts/features.js';
import { bodyPart, feetPart, handsPart, HAND_POSES } from './parts/body.js';
import { hairPart } from './parts/hair.js';
import { bottomPart, shoePart, topPart } from './parts/wardrobe.js';
import { BOTTOMS, DRESSES, OUTERS, SHOES, TOPS } from './catalog-specs.js';
import { ACTIONS, EXPRESSIONS } from './performance-specs.js';
import { CAST, castData } from './cast-specs.js';
import { COFFEE_KIT_PARTS, PROPS, propPart, kitPartsData } from './parts/props.js';
import { BUBBLES, CAPTION_STYLES, GRAPHICS, WORLD_TEXT } from './text-specs.js';
import { OUTPUT_PRESETS } from './output-specs.js';
import { renderSound, SR } from './sounds.js';
import { MUSIC, normalise, renderAmbience, renderCue, renderMusic, wav16 } from './music.js';
import { FRAMINGS, MOVES } from './camera-specs.js';
import { RECIPES, SHOT_RECIPES } from './recipe-specs.js';
import { ATMOSPHERE, EFFECTS, TRANSITIONS } from './fx-specs.js';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(repo, 'content/assets');
const DATE = '2026-10-22';
const ALL_VIEWS: View[] = ['front', 'three', 'side', 'back'];

const LICENSE = { id: 'LicenseRef-Frame-Bundled', redistributable: true, commercialUse: true, attribution: 'Frame bundled content; free to use in exported videos, including commercially.' };
const PROVENANCE = { method: 'authored' as const, author: 'Frame content pipeline (parametric authoring in tools/content)', date: DATE, notes: 'Generated as part-contract data and validated by the rig check; awaiting human visual review (CAT-06).' };

interface Built {
  data: unknown;
  kind?: string;
  families?: ('flat' | 'illustrated')[];
  views?: View[];
  viewExemptions?: Record<string, string>;
  capabilities?: string[];
  parameters?: AssetManifest['parameters'];
  anchors?: Record<string, unknown>;
  tags?: string[];
  dependencies?: string[];
  provenance?: AssetManifest['provenance'];
}

/** Writes synthesised audio as content-addressed media and returns its sound asset data. */
function mediaSound(x: Float32Array, loop: boolean, tag: string, target: { lufs?: number; peakDb: number }): Built {
  const wav = wav16(x);
  const hash = `sha256-${createHash('sha256').update(wav).digest('hex')}`;
  const file = path.join(repo, 'content/media', `${hash}.wav`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, wav);
  }
  return {
    data: { sound: { media: { hash, mime: 'audio/wav', ext: 'wav', bytes: wav.length, durationS: Math.round((x.length / SR) * 1000) / 1000, sampleRate: SR, channels: 1 }, loop, ...(target.lufs !== undefined ? { lufs: target.lufs } : { peakDbfs: target.peakDb }) } },
    tags: ['sound', tag],
    provenance: { method: 'authored', author: 'Frame content pipeline (procedural synthesis in tools/content/music.ts)', date: DATE, notes: 'Synthesised (additive, FM and plucked-string voices; filtered noise); no recordings or third-party samples. Placeholder awaiting listening review (CAT-06/CAT-08).' },
  };
}

function partBuilt(p: PartData, extra: Partial<Built> = {}): Built {
  const fams = Object.keys(p.families) as ('flat' | 'illustrated')[];
  const flat = p.families.flat!;
  const views = ALL_VIEWS.filter((v) => flat.views[v]);
  return { data: p, families: fams, views, viewExemptions: flat.exempt ?? {}, capabilities: ['rig.biped@1'], parameters: (p.params ?? []).map((x) => ({ key: x.key, type: x.type, default: x.default, ...(x.range ? { range: x.range } : {}), ...(x.options ? { options: x.options } : {}), label: x.label, ...(x.endLabels ? { endLabels: x.endLabels } : {}) })), ...extra };
}

const slug = (id: string) => id.split('.')[1]!;
const hashSeed = (id: string) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const slider = (param: string, endLabels?: [string, string], target: 'morph' | 'body' = 'morph') => ({ control: { type: 'slider', param, target, range: [0, 100], default: 50, ...(endLabels ? { endLabels } : {}) } });

/* ------------------------------------------------------------------ list builders */

const FACE_CTL: Record<string, [string, 'morph' | 'body']> = {
  'face-width': ['face.width', 'morph'], 'face-length': ['face.length', 'morph'], 'jaw-width': ['face.jaw', 'morph'], 'chin-shape': ['face.chin-shape', 'morph'],
  'chin-length': ['face.chin-length', 'morph'], 'cheekbone-height': ['face.cheekbone', 'morph'], 'cheek-fullness': ['face.cheeks', 'morph'], 'forehead-height': ['face.forehead', 'morph'],
  'neck-width': ['neckWidth', 'body'], 'neck-length': ['neckLength', 'body'],
};

const EYE_CTL: Record<string, unknown> = {
  'eye-size': slider('eye.size').control, 'eye-spacing': slider('eye.spacing').control, 'eye-tilt': slider('eye.tilt').control, 'eye-height': slider('eye.height').control,
  'iris-size': slider('eye.iris').control,
  'iris-colour': { type: 'color', color: 'eye', presets: ['#4B3426', '#6B4A2E', '#2E1F18', '#7A5A3A', '#3D5A40', '#5C7A4A', '#3E6A8C', '#6A8FB0', '#7C8A99', '#8A7A5A', '#A07A3A', '#2A2A2A', '#5A4A6E', '#9C6B4A', '#4A6E6A', '#B0A090'], default: '#4B3426' },
  'pupil-style': { type: 'enum', option: 'pupil', options: ['round', 'highlighted', 'cartoon'], default: 'highlighted' },
  eyelashes: { type: 'enum', option: 'lashes', options: ['none', 'subtle', 'defined', 'bold'], default: 'subtle' },
  'lower-lash-line': { type: 'enum', option: 'lowerLash', options: ['on', 'off'], default: 'off' },
  'eyelid-crease': { type: 'enum', option: 'crease', options: ['none', 'single', 'double'], default: 'single' },
  heterochromia: { type: 'enum', option: 'heterochromia', options: ['off', 'on'], default: 'off', color: 'eye2' },
};

const HAIR_CTL: Record<string, unknown> = {
  volume: slider('hair.volume').control, length: slider('hair.length').control, 'curl-tightness': slider('hair.curl').control,
  parting: { type: 'enum', option: 'parting', options: ['left', 'centre', 'right', 'none'], default: 'none' },
  'hair-colour': { type: 'color', color: 'hair', presets: ['#1E1612', '#2F221C', '#4A3020', '#6B4423', '#8A5A2B', '#A8743A', '#C9A063', '#E3C98F', '#B5552E', '#8C2F1F', '#D9D4CC', '#9A9A9A', '#5A5A5A', '#2A2A3A', '#5E2E6E', '#2E5E8C'], default: '#2F221C' },
  'highlight-colour': { type: 'color', color: 'hairHighlight', presets: [], default: null },
  'highlight-amount': slider('hair.highlight').control, greying: slider('hair.grey').control, flyaways: slider('hair.flyaways').control, sway: slider('hair.sway').control,
};

/** Expression controls (A18/A19) used by expression presets and blinks. */
const EYE_STATES: Record<string, Record<string, number | string>> = {
  open: { eyeOpen: 1 }, wide: { eyeOpen: 1.3 }, narrowed: { eyeOpen: 0.6, eyeLower: 0.3 }, squint: { eyeOpen: 0.55, eyeLower: 0.6 },
  'half-closed': { eyeOpen: 0.5 }, closed: { eyeOpen: 0 }, 'closed-happy': { eyeOpen: 0, eyeHappy: 1 }, 'wink-left': { eyeOpenL: 0, eyeOpenR: 1, eyeHappy: 0.4 },
  'wink-right': { eyeOpenL: 1, eyeOpenR: 0, eyeHappy: 0.4 }, 'looking-down': { eyeOpen: 0.7, lookDown: 1 },
};
const BROW_STATES: Record<string, Record<string, number>> = {
  neutral: {}, raised: { inner: 0.9, outer: 0.8 }, lowered: { inner: -0.6, outer: -0.4 }, 'inner-raised': { inner: 0.9, outer: -0.2 },
  'inner-lowered': { inner: -0.8, furrow: 0.8 }, 'one-raised-left': { innerL: 0.9, outerL: 0.9, innerR: -0.2, outerR: -0.1 },
  'one-raised-right': { innerR: 0.9, outerR: 0.9, innerL: -0.2, outerL: -0.1 }, furrowed: { inner: -0.4, furrow: 1 }, relaxed: { inner: 0.1, outer: -0.1 },
};
const MOUTH_LETTERS: Record<string, [string, string[]]> = {
  'x-rest': ['X', []], 'a-closed': ['A', ['M', 'B', 'P']], 'b-slightly-open': ['B', ['K', 'S', 'T', 'IY', 'D', 'G', 'N', 'NG', 'Z', 'SH', 'ZH', 'CH', 'JH', 'Y', 'HH', 'R', 'EY', 'IH']],
  'c-open': ['C', ['EH', 'AE', 'AH0']], 'd-wide-open': ['D', ['AA', 'AH', 'AY', 'AW']], 'e-rounded': ['E', ['AO', 'ER', 'OY']], 'f-puckered': ['F', ['UW', 'OW', 'W', 'UH']],
  'g-teeth-on-lip': ['G', ['F', 'V']], 'h-tongue-up': ['H', ['L', 'TH', 'DH']],
};

const BODY_BASES: Record<string, Record<string, number>> = {
  slim: { shoulders: 38, chest: 35, waist: 32, hips: 38, limbThickness: 30 },
  average: {},
  athletic: { shoulders: 72, chest: 62, waist: 40, hips: 50, limbThickness: 62 },
  broad: { shoulders: 85, chest: 78, waist: 62, hips: 55, limbThickness: 68 },
  stocky: { shoulders: 70, chest: 70, waist: 72, hips: 66, limbThickness: 75, legLength: 25, armLength: 35 },
  curvy: { shoulders: 48, chest: 62, waist: 35, hips: 82, bust: 55, limbThickness: 58 },
  heavyset: { shoulders: 75, chest: 82, waist: 95, hips: 80, belly: 75, limbThickness: 85 },
  lanky: { shoulders: 42, chest: 38, waist: 35, hips: 38, legLength: 85, armLength: 85, limbThickness: 25 },
  petite: { shoulders: 35, chest: 38, waist: 35, hips: 42, limbThickness: 38, heightScale: 88 },
  elderly: { shoulders: 45, chest: 50, waist: 62, hips: 55, stoop: 55, limbThickness: 42 },
  muscular: { shoulders: 95, chest: 92, waist: 48, hips: 52, limbThickness: 95, armLength: 55 },
  pear: { shoulders: 32, chest: 42, waist: 45, hips: 88, limbThickness: 55 },
};
const STAGES: Record<string, { flat: number; illustrated: number; height: number }> = {
  toddler: { flat: 2.5, illustrated: 4, height: 0.45 }, child: { flat: 3, illustrated: 5, height: 0.62 }, teen: { flat: 3.5, illustrated: 6.5, height: 0.9 },
  'young-adult': { flat: 4, illustrated: 7, height: 1 }, adult: { flat: 4, illustrated: 7.5, height: 1 }, senior: { flat: 4, illustrated: 7, height: 0.96 },
};
const SKIN_TONES: Record<string, string> = {
  porcelain: '#F6DDD0', ivory: '#F2D7BF', sand: '#EBC9A5', 'light-beige': '#E6C4A6', peach: '#EDBE9C', 'rose-beige': '#DDB09A', golden: '#D9A877', honey: '#CC9A68',
  'olive-light': '#C9A47E', olive: '#B58E66', tan: '#B98A62', caramel: '#A87447', amber: '#A56B3E', cinnamon: '#9A6038', chestnut: '#8A5A3C', bronze: '#8E5B34',
  sienna: '#7E4A2C', umber: '#6E4630', mocha: '#674132', espresso: '#4A2E24', cocoa: '#5C3A28', ebony: '#3C2620', 'deep-mahogany': '#4A2A1E', onyx: '#2E1E1A',
};

function build(list: CatalogList, item: CatalogItem): Built | undefined {
  const s = slug(item.id);
  switch (list.prefix) {
    case 'head': return HEAD_SHAPES[s] ? partBuilt(headPart(s)) : undefined;
    case 'eyes': return partBuilt(eyesPart(s));
    case 'brow': return partBuilt(browPart(s));
    case 'nose': return partBuilt(nosePart(s));
    case 'mouth': return partBuilt(mouthPart(s), { capabilities: ['rig.biped@1', 'mouthshapes.9'] });
    case 'ears': return partBuilt(earsPart(s), { anchors: { earring: 'ear' } });
    case 'hair': return partBuilt(hairPart(s), { capabilities: ['rig.biped@1', 'hat-compatible'] });
    case 'feet': return partBuilt(feetPart(s));
    case 'top': return TOPS[s] ? partBuilt(topPart(TOPS[s]!)) : undefined;
    case 'outer': return OUTERS[s] ? partBuilt(topPart(OUTERS[s]!)) : undefined;
    case 'bottom': return BOTTOMS[s] ? partBuilt(bottomPart(BOTTOMS[s]!)) : undefined;
    case 'dress': return DRESSES[s] ? partBuilt(topPart(DRESSES[s]!)) : undefined;
    case 'shoe': return SHOES[s] ? partBuilt(shoePart(SHOES[s]!)) : undefined;
    case 'hand': return HAND_POSES[s] ? { data: { handPose: s, set: 'base.hands@1' }, families: ['flat', 'illustrated'], views: ALL_VIEWS, dependencies: ['base.hands@1'], capabilities: ['rig.biped@1'] } : undefined;
    case 'face-ctl': {
      const [param, target] = FACE_CTL[s]!;
      const ends = item.range?.split(' – ') as [string, string] | undefined;
      return { data: slider(param, ends, target) };
    }
    case 'eye-ctl': return { data: { control: EYE_CTL[s] } };
    case 'hair-ctl': return { data: { control: HAIR_CTL[s] } };
    case 'eyestate': return { data: { eyeState: EYE_STATES[s] } };
    case 'browstate': return { data: { browState: BROW_STATES[s] } };
    case 'mouthshape': {
      const [letter, phonemes] = MOUTH_LETTERS[s]!;
      return { data: { mouthShape: letter, phonemes } };
    }
    case 'body': return { data: { bodyParams: BODY_BASES[s] } };
    case 'stage': return { data: { lifeStage: { headRatio: { flat: STAGES[s]!.flat, illustrated: STAGES[s]!.illustrated }, heightScale: STAGES[s]!.height } } };
    case 'skin': return { data: { skinTone: { base: SKIN_TONES[s], undertone: item.undertone?.toLowerCase() } } };
    case 'exp': return EXPRESSIONS[s] ? { data: { expression: EXPRESSIONS[s] }, families: ['flat', 'illustrated'], views: ['front', 'three', 'side'], viewExemptions: { back: 'Faces are not visible from behind; expressions still drive head attitude.' }, capabilities: ['rig.biped@1'] } : undefined;
    case 'act': {
      const a = ACTIONS[s];
      return a ? { data: { action: a }, families: ['flat', 'illustrated'], views: ALL_VIEWS, capabilities: ['rig.biped@1', ...a.channels.map((c) => `channel:${c}`)], parameters: [{ key: 'intensity', type: 'number', default: 1, range: [0, 2], label: 'Intensity' }, { key: 'speed', type: 'number', default: 1, range: [0.25, 3], label: 'Speed' }, ...(a.hand && a.hand !== 'both' ? [{ key: 'hand', type: 'enum' as const, default: a.hand, options: ['L', 'R'], label: 'Hand' }] : [])] } : undefined;
    }
    case 'chr': {
      const c = CAST[s];
      return c ? { data: castData(c), families: ['flat', 'illustrated'], views: ALL_VIEWS, capabilities: ['rig.biped@1'], tags: ['cast'] } : undefined;
    }
    case 'prop': {
      const p = PROPS[s];
      return p ? { data: propPart(p), families: ['flat', 'illustrated'], views: ['front'], viewExemptions: { three: 'Props are drawn from the camera.', side: 'Props are drawn from the camera.', back: 'Props are drawn from the camera.' }, anchors: { ...(p.anchors ?? {}), bounds: p.bounds }, capabilities: p.capabilities ?? [], ...(p.states ? { parameters: [{ key: 'state', type: 'enum' as const, default: p.states[0], options: p.states, label: 'State' }] } : {}) } : undefined;
    }
    case 'kit':
      if (s === 'coffee-shop') return { data: { kit: { parts: kitPartsData(COFFEE_KIT_PARTS), marks: [{ name: 'Counter', x: 560, y: 1000, facing: 'right' }, { name: 'Table left', x: 1050, y: 1000, facing: 'right' }, { name: 'Table right', x: 1500, y: 1000, facing: 'left' }, { name: 'Door', x: 1800, y: 1000, facing: 'left' }], ambience: 'amb.coffee-shop@1', props: ['prop.round-table@1', 'prop.studio-chair@1', 'prop.mug@1', 'prop.phone@1', 'prop.potted-plant@1', 'prop.door@1'] } }, families: ['flat', 'illustrated'], views: ['front'] };
      return s === 'podcast-studio' ? { data: { kit: { parts: kitPartsData(), marks: [{ name: 'Seat A', x: 640, y: 960, facing: 'right' }, { name: 'Seat B', x: 1280, y: 960, facing: 'left' }, { name: 'Seat C', x: 420, y: 980, facing: 'right' }, { name: 'Seat D', x: 1500, y: 980, facing: 'left' }], ambience: 'amb.studio-room-tone@1', props: ['prop.round-table@1', 'prop.studio-chair@1', 'prop.desk-microphone@1', 'prop.on-air-sign@1', 'prop.floor-lamp@1', 'prop.potted-plant@1', 'prop.mug@1'] } }, families: ['flat', 'illustrated'], views: ['front'] } : undefined;
    case 'music':
    case 'cue':
    case 'amb': {
      // Synthesised music beds, cues and ambience loops (tools/content/music.ts), loudness-normalised per CAT-08.
      const seed = hashSeed(item.id);
      const raw = list.prefix === 'music' ? (MUSIC[s] ? renderMusic(MUSIC[s]!, seed) : undefined) : list.prefix === 'cue' ? renderCue(s, seed) : renderAmbience(s, seed);
      if (!raw) return undefined;
      const target = list.prefix === 'music' ? { lufs: -16, peakDb: -1 } : list.prefix === 'amb' ? { lufs: -30, peakDb: -6 } : { peakDb: -3 };
      return mediaSound(normalise(raw, target), list.prefix !== 'cue', list.prefix === 'music' ? 'music' : list.prefix === 'amb' ? 'ambience' : 'cue', target);
    }
    case 'sfx': {
      // Synthesised foley (tools/content/sounds.ts); media is content-addressed under content/media.
      const snd = (() => { try { return renderSound(s, hashSeed(item.id)); } catch { return undefined; } })();
      if (!snd) return undefined;
      const hash = `sha256-${createHash('sha256').update(snd.wav).digest('hex')}`;
      const file = path.join(repo, 'content/media', `${hash}.wav`);
      if (!fs.existsSync(file)) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, snd.wav);
        written++;
      }
      return {
        data: { sound: { media: { hash, mime: 'audio/wav', ext: 'wav', bytes: snd.wav.length, durationS: snd.seconds, sampleRate: SR, channels: 1 }, peakDbfs: -3, loop: false } },
        tags: ['sound'],
        provenance: { method: 'authored', author: 'Frame content pipeline (procedural synthesis in tools/content/sounds.ts)', date: DATE, notes: 'Synthesised from noise, resonators and envelopes; no recordings or third-party samples. Placeholder foley awaiting listening review (CAT-06/CAT-08).' },
      };
    }
    case 'cam':
      if (FRAMINGS[s]) return { data: { framing: FRAMINGS[s] }, tags: ['camera', 'framing'] };
      if (SHOT_RECIPES[s]) return { data: { recipe: SHOT_RECIPES[s] }, tags: ['camera', 'shot recipe'] };
      if (MOVES[s]) return { data: { move: MOVES[s] }, tags: ['camera', 'move'], parameters: [{ key: 'intensity', type: 'number', default: 1, range: [0, 2], label: 'Intensity' }] };
      return undefined;
    case 'rcp': return RECIPES[s] ? { data: { recipe: RECIPES[s] }, tags: ['recipe'] } : undefined;
    case 'atmo': return ATMOSPHERE[s] ? { data: { atmosphere: ATMOSPHERE[s] }, tags: ['atmosphere'], parameters: [{ key: 'intensity', type: 'number', default: 1, range: [0, 2], label: 'Intensity' }, { key: 'color', type: 'color', default: ATMOSPHERE[s]!.color ?? '#FFFFFF', label: 'Colour' }] } : undefined;
    case 'fx': return EFFECTS[s] ? { data: { effect: EFFECTS[s] }, tags: ['effect'], parameters: [{ key: 'intensity', type: 'number', default: 1, range: [0, 2], label: 'Intensity' }] } : undefined;
    case 'tr': return TRANSITIONS[s] ? { data: { transition: TRANSITIONS[s] }, tags: ['transition'] } : undefined;
    case 'txt':
      if (CAPTION_STYLES[s]) return { data: { caption: CAPTION_STYLES[s] }, families: ['flat', 'illustrated'], tags: ['caption'] };
      if (BUBBLES[s]) return { data: { bubble: BUBBLES[s] }, tags: ['bubble'], parameters: [{ key: 'text', type: 'string', default: '', label: 'Text' }] };
      if (GRAPHICS[s]) return { data: { graphic: GRAPHICS[s] }, tags: ['graphic'], parameters: [{ key: 'text', type: 'string', default: '', label: 'Text' }, { key: 'subtitle', type: 'string', default: '', label: 'Second line' }] };
      if (WORLD_TEXT[s]) return { data: { world: WORLD_TEXT[s] }, tags: ['world text'], parameters: [{ key: 'text', type: 'string', default: '', label: 'Text' }] };
      return undefined;
    case 'out': return OUTPUT_PRESETS[s] ? { data: { output: OUTPUT_PRESETS[s] }, tags: ['export'] } : undefined;
    default: return undefined;
  }
}

/* ------------------------------------------------------------------ write */

function manifest(list: CatalogList, item: CatalogItem, b: Built): AssetManifest {
  const group = item.group ?? list.title;
  return {
    schemaVersion: 1,
    id: item.id,
    version: 1,
    kind: b.kind ?? list.prefix,
    name: item.name,
    category: list.title,
    group,
    tags: [...new Set([list.title.toLowerCase(), group.toLowerCase(), ...(b.tags ?? [])])],
    synonyms: synonyms(item),
    families: b.families ?? [],
    views: b.views ?? [],
    viewExemptions: b.viewExemptions ?? {},
    anchors: b.anchors ?? {},
    capabilities: b.capabilities ?? [],
    parameters: b.parameters ?? [],
    dependencies: b.dependencies ?? [],
    layering: {},
    previews: {},
    license: LICENSE,
    provenance: b.provenance ?? PROVENANCE,
    review: { status: 'pending' },
    data: b.data,
  } as AssetManifest;
}

function synonyms(item: CatalogItem): string[] {
  const words = new Set<string>();
  for (const v of Object.values(item)) for (const w of String(v).toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) words.add(w);
  return [...words].filter((w) => !item.id.includes(w)).slice(0, 12);
}

function write(file: string, value: unknown): boolean {
  const text = stableCompact(value);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}

const cat = loadCatalog(path.join(repo, 'catalog'));
let written = 0;
let built = 0;
const only = process.argv[2];
for (const list of cat.lists) {
  if (only && list.prefix !== only) continue;
  for (const item of list.items) {
    const b = build(list, item);
    if (!b) continue;
    built++;
    if (write(path.join(outDir, list.prefix, `${item.id}.json`), manifest(list, item, b))) written++;
  }
}
// Infrastructure assets (not catalog items): the family base body and the hand set.
const infra: [string, string, PartData][] = [['base.body', 'Base body', bodyPart()], ['base.hands', 'Hand set', handsPart()]];
for (const [id, name, data] of infra) {
  const fake = { list: 'base', order: 0, part: '', title: 'Base', prefix: 'base', columns: ['ID', 'Name', 'Notes'], detailKey: 'notes', intro: '', items: [] } as unknown as CatalogList;
  if (write(path.join(outDir, 'base', `${id}.json`), manifest(fake, { id, name }, partBuilt(data)))) written++;
  built++;
}
console.log(`built ${built} assets, ${written} written`);
