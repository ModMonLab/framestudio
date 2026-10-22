/** Bundled cast (Catalog D1): identity, appearance and three looks each. Names are content only (FR-ARC-06). */
import type { CharacterData, LookData } from '../../packages/core/src/perform/character.js';

const L = (id: string, name: string, garments: string[], colors: Record<string, string> = {}, accessories: string[] = [], options?: LookData['options']): LookData => ({ id, name, garments: garments.map((g) => `${g}@1`), accessories: accessories.map((a) => `${a}@1`), colors, ...(options ? { options } : {}) });

interface CastSpec {
  stage: string;
  body: string;
  bodyAdjust?: CharacterData['body'];
  head: string;
  eyes: string;
  brows: string;
  nose: string;
  mouth: string;
  ears: string;
  hair: string;
  colors: Record<string, string>;
  controls?: Record<string, number | string>;
  looks: LookData[];
  voice: string;
  role: string;
  performance?: Partial<CharacterData['performance']>;
  rigVariant?: string;
  details?: string[];
}

export const CAST: Record<string, CastSpec> = {
  'maya-bennett': {
    stage: 'young-adult', body: 'average', head: 'oval', eyes: 'almond', brows: 'soft-arch', nose: 'button', mouth: 'full', ears: 'average', hair: 'high-bun',
    colors: { skin: '#B9805C', hair: '#2F221C', eye: '#4B3426', lip: '#A65B4F' },
    controls: { 'eye-ctl.eyelashes@1': 'defined', 'face-ctl.jaw-width@1': 45 },
    looks: [
      L('on-air', 'On-air', ['top.ribbed-sweater', 'bottom.trousers', 'shoe.canvas-sneakers'], { top: '#C8653F', bottom: '#3E5953' }),
      L('everyday', 'Everyday', ['top.t-shirt', 'bottom.jeans', 'shoe.canvas-sneakers'], { top: '#E8D9C2' }),
      L('evening', 'Evening', ['dress.wrap-dress', 'shoe.heels'], { dress: '#5A2E4A' }),
    ],
    voice: 'warm-host', role: 'Curious podcast host, late 20s', performance: { idleEnergy: 60, gestureSize: 60, expressionStrength: 70 },
  },
  'leo-park': {
    stage: 'adult', body: 'athletic', head: 'angular', eyes: 'monolid', brows: 'straight', nose: 'straight', mouth: 'thin', ears: 'average', hair: 'crop',
    colors: { skin: '#E7B38C', hair: '#2A1F1A', eye: '#3D2A20', lip: '#B46A5C' },
    controls: { 'face-ctl.jaw-width@1': 62 },
    looks: [
      L('everyday', 'Everyday', ['top.t-shirt', 'bottom.chinos', 'shoe.canvas-sneakers'], { top: '#4F8F87', bottom: '#2F3442' }),
      L('on-air', 'On-air', ['top.henley', 'outer.denim-jacket', 'bottom.jeans', 'shoe.oxfords'], { top: '#C9B48F' }),
      L('office', 'Office', ['top.button-up-shirt', 'bottom.trousers', 'shoe.loafers'], {}, [], { 'top.button-up-shirt@1': { sleeves: 'rolled' } }),
    ],
    voice: 'dry-wit', role: 'Dry-witted co-host, early 30s', performance: { idleEnergy: 40, gestureSize: 45, expressionStrength: 55 },
  },
  'sam-ortiz': {
    stage: 'adult', body: 'stocky', head: 'square', eyes: 'hooded', brows: 'thick', nose: 'roman', mouth: 'wide', ears: 'large', hair: 'side-part',
    colors: { skin: '#A87447', hair: '#3A2E2A', eye: '#3B2A1E', lip: '#8E5040' },
    looks: [L('presenter', 'Presenter', ['top.button-up-shirt', 'outer.blazer', 'bottom.chinos', 'shoe.oxfords'], { outer: '#3B4A5E' }), L('casual', 'Casual', ['top.polo', 'bottom.chinos', 'shoe.loafers']), L('weekend', 'Weekend', ['top.flannel-shirt', 'bottom.jeans', 'shoe.work-boots'])],
    voice: 'calm-presenter', role: 'Calm presenter for explainers, 40s',
  },
  'priya-nair': {
    stage: 'adult', body: 'petite', head: 'heart', eyes: 'round', brows: 'high-arch', nose: 'narrow', mouth: 'bow', ears: 'small', hair: 'braids',
    colors: { skin: '#8E5B34', hair: '#1E1612', eye: '#2E1F18', lip: '#8E3F44' },
    looks: [L('teacher', 'Teacher', ['top.cardigan', 'bottom.long-skirt', 'shoe.ballet-flats'], { top: '#D9A441' }), L('everyday', 'Everyday', ['top.blouse', 'bottom.jeans', 'shoe.canvas-sneakers']), L('festive', 'Festive', ['dress.kurta', 'bottom.leggings', 'shoe.sandals'], { dress: '#C2384A' })],
    voice: 'energetic-teacher', role: 'Energetic teacher, 30s',
  },
  'jonah-reed': {
    stage: 'teen', body: 'lanky', head: 'long', eyes: 'almond', brows: 'short', nose: 'snub', mouth: 'small', ears: 'protruding', hair: 'mop',
    colors: { skin: '#F2D7BF', hair: '#8A5A2B', eye: '#3E6A8C', lip: '#C47A6E' },
    looks: [L('student', 'Student', ['top.hoodie', 'bottom.jeans', 'shoe.running-shoes'], { top: '#5E7FA6' }), L('school', 'School', ['top.polo', 'bottom.chinos', 'shoe.canvas-sneakers']), L('weekend', 'Weekend', ['top.graphic-tee', 'bottom.shorts', 'shoe.canvas-sneakers'])],
    voice: 'teen', role: 'Teenage student, 16',
  },
  'grace-okafor': {
    stage: 'senior', body: 'elderly', head: 'round', eyes: 'deep-set', brows: 'thin', nose: 'wide', mouth: 'full', ears: 'average', hair: 'short-curls',
    colors: { skin: '#4A2E24', hair: '#D9D4CC', eye: '#2E1F18', lip: '#6E3A34' },
    controls: { 'hair-ctl.greying@1': 100 },
    looks: [L('cardigan', 'Cardigan', ['top.cardigan', 'bottom.trousers', 'shoe.loafers'], { top: '#7A8C6E' }), L('engineer', 'Engineer', ['top.button-up-shirt', 'outer.vest', 'bottom.trousers', 'shoe.oxfords']), L('sunday', 'Sunday best', ['dress.shirt-dress', 'shoe.heels'], { dress: '#2E5E8C' })],
    voice: 'wise-elder', role: 'Retired engineer, 70s', details: ['skin-detail.crows-feet@1', 'skin-detail.smile-lines@1'],
  },
  'theo-lambert': {
    stage: 'young-adult', body: 'slim', head: 'oval', eyes: 'upturned', brows: 'bushy', nose: 'long', mouth: 'gap-toothed', ears: 'average', hair: 'curtains',
    colors: { skin: '#EBC9A5', hair: '#6B4423', eye: '#5C7A4A', lip: '#B9705E' },
    looks: [L('barista', 'Barista', ['top.t-shirt', 'outer.apron', 'bottom.jeans', 'shoe.canvas-sneakers'], { top: '#2E2E33', outer: '#3A4F5C' }), L('comic', 'Stand-up', ['top.graphic-tee', 'outer.blazer', 'bottom.jeans', 'shoe.oxfords']), L('casual', 'Casual', ['top.flannel-shirt', 'bottom.chinos', 'shoe.canvas-sneakers'])],
    voice: 'comic', role: 'Barista and aspiring comic, 20s',
  },
  'aiko-tanaka': {
    stage: 'adult', body: 'average', head: 'diamond', eyes: 'narrow', brows: 'straight', nose: 'button', mouth: 'small', ears: 'small', hair: 'bob',
    colors: { skin: '#E6C4A6', hair: '#1E1612', eye: '#2E1F18', lip: '#B5636A' },
    looks: [L('studio', 'Studio', ['top.turtleneck', 'bottom.trousers', 'shoe.loafers'], { top: '#2F2F36' }), L('casual', 'Casual', ['top.crewneck-sweater', 'bottom.jeans', 'shoe.canvas-sneakers'], { top: '#D9C7A6' }), L('meeting', 'Meeting', ['top.blouse', 'outer.blazer', 'bottom.pencil-skirt', 'shoe.heels'])],
    voice: 'designer', role: 'Product designer, 30s',
  },
  'marcus-hale': {
    stage: 'adult', body: 'broad', head: 'rectangle', eyes: 'hooded', brows: 'angled', nose: 'aquiline', mouth: 'thin', ears: 'average', hair: 'slick-back',
    colors: { skin: '#C9A47E', hair: '#5A5A5A', eye: '#3B2A1E', lip: '#A0645A' },
    controls: { 'hair-ctl.greying@1': 60 },
    looks: [L('anchor', 'Anchor', ['top.button-up-shirt', 'outer.suit-jacket', 'bottom.suit-trousers', 'shoe.oxfords'], {}, ['acc.tie']), L('field', 'Field report', ['top.button-up-shirt', 'outer.trench-coat', 'bottom.trousers', 'shoe.oxfords']), L('off-air', 'Off-air', ['top.polo', 'bottom.chinos', 'shoe.loafers'])],
    voice: 'anchor', role: 'News anchor, 50s',
  },
  'luc-a-ferreira': {
    stage: 'adult', body: 'curvy', head: 'oval', eyes: 'almond', brows: 'soft-arch', nose: 'straight', mouth: 'full', ears: 'average', hair: 'wavy-medium',
    colors: { skin: '#C9A47E', hair: '#3A2418', eye: '#4B3426', lip: '#A65B4F' },
    looks: [L('doctor', 'Doctor', ['dress.hospital-scrubs', 'outer.lab-coat', 'shoe.running-shoes'], {}, ['prop.stethoscope']), L('everyday', 'Everyday', ['top.blouse', 'bottom.jeans', 'shoe.ankle-boots']), L('evening', 'Evening', ['dress.evening-gown', 'shoe.heels'])],
    voice: 'doctor', role: 'Doctor, 40s',
  },
  'ben-carter': {
    stage: 'child', body: 'average', head: 'round', eyes: 'large-cartoon', brows: 'rounded', nose: 'button', mouth: 'small', ears: 'round', hair: 'short-curls',
    colors: { skin: '#5C3A28', hair: '#1E1612', eye: '#2E1F18', lip: '#7A4038' },
    looks: [L('school', 'School', ['top.t-shirt', 'bottom.shorts', 'shoe.running-shoes'], { top: '#E8C342' }), L('rainy', 'Rainy day', ['outer.raincoat', 'bottom.jeans', 'shoe.knee-boots']), L('pyjamas', 'Pyjamas', ['dress.pyjamas', 'shoe.slippers'])],
    voice: 'child', role: 'Child, 9',
  },
  'nadia-haddad': {
    stage: 'adult', body: 'average', head: 'oval', eyes: 'almond', brows: 'high-arch', nose: 'roman', mouth: 'bow', ears: 'average', hair: 'hijab',
    colors: { skin: '#D9A877', hair: '#2A1F1A', eye: '#3B2A1E', lip: '#9E4F55', acc: '#3F6E73' },
    looks: [L('founder', 'Founder', ['top.blouse', 'outer.blazer', 'bottom.trousers', 'shoe.loafers'], { acc: '#3F6E73' }), L('pitch', 'Pitch day', ['dress.abaya', 'shoe.heels'], { acc: '#1F2A44', dress: '#1F2A44' }), L('weekend', 'Weekend', ['top.long-sleeve-tee', 'bottom.long-skirt', 'shoe.canvas-sneakers'], { acc: '#C4553A' })],
    voice: 'founder', role: 'Startup founder, 30s, wears hijab',
  },
  'ravi-shah': {
    stage: 'young-adult', body: 'average', head: 'oval', eyes: 'round', brows: 'thick', nose: 'wide', mouth: 'wide', ears: 'average', hair: 'undercut',
    colors: { skin: '#A56B3E', hair: '#1E1612', eye: '#2E1F18', lip: '#8E5040' },
    looks: [L('streamer', 'Streamer', ['top.hoodie', 'bottom.joggers', 'shoe.running-shoes'], { top: '#5E2E6E' }, ['acc.headset-with-mic']), L('casual', 'Casual', ['top.graphic-tee', 'bottom.jeans', 'shoe.canvas-sneakers']), L('event', 'Event', ['top.button-up-shirt', 'outer.bomber-jacket', 'bottom.chinos', 'shoe.oxfords'])],
    voice: 'streamer', role: 'Wheelchair user, game streamer, 20s', rigVariant: 'identity.wheelchair',
  },
  'elena-novak': {
    stage: 'adult', body: 'athletic', head: 'angular', eyes: 'downturned', brows: 'angled', nose: 'hooked', mouth: 'downturned', ears: 'attached-lobe', hair: 'lob',
    colors: { skin: '#F6DDD0', hair: '#B5552E', eye: '#5C7A4A', lip: '#A65B5B' },
    looks: [L('detective', 'Detective', ['top.turtleneck', 'outer.trench-coat', 'bottom.trousers', 'shoe.ankle-boots'], { top: '#2F2F36' }), L('office', 'Office', ['top.button-up-shirt', 'bottom.suit-trousers', 'shoe.oxfords']), L('off-duty', 'Off duty', ['outer.leather-jacket', 'top.t-shirt', 'bottom.jeans', 'shoe.ankle-boots'])],
    voice: 'detective', role: 'Detective, 40s',
  },
};

export function castData(spec: CastSpec): CharacterData {
  const ref = (p: string, id: string) => `${p}.${id}@1`;
  return {
    role: spec.role,
    lifeStage: ref('stage', spec.stage),
    bodyBase: ref('body', spec.body),
    body: spec.bodyAdjust ?? {},
    parts: {
      base: 'base.body@1', hands: 'base.hands@1', head: ref('head', spec.head), eyes: ref('eyes', spec.eyes), brows: ref('brow', spec.brows),
      nose: ref('nose', spec.nose), mouth: ref('mouth', spec.mouth), ears: ref('ears', spec.ears), hair: ref('hair', spec.hair), feet: 'feet.flat@1',
    },
    details: spec.details ?? [],
    controls: spec.controls ?? {},
    colors: spec.colors,
    looks: spec.looks,
    defaultLook: spec.looks[0]!.id,
    voice: `voice.${spec.voice}@1`,
    performance: { idleEnergy: 50, gestureSize: 50, expressionStrength: 60, signatureActions: [], ...(spec.performance ?? {}) },
    ...(spec.rigVariant ? { rigVariant: `${spec.rigVariant}@1` } : {}),
  };
}
