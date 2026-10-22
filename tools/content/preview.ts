/** Renders a turnaround/expression sheet for a test character straight from the generators (authoring aid). */
import fs from 'node:fs';
import path from 'node:path';
import { composeCharacter, NEUTRAL_FACE, REST_POSE, DEFAULT_BODY, type CharacterSpec, type FamilyStyle, type ResolvedPart, type FaceState, type Pose } from '../../packages/rig/src/index.js';
import { createNodeRenderer } from '../../packages/render/src/node.js';
import type { Item } from '../../packages/render/src/index.js';
import { headPart } from './parts/head.js';
import { eyesPart, browPart, nosePart, mouthPart, earsPart } from './parts/features.js';
import { bodyPart, handsPart, feetPart } from './parts/body.js';
import { hairPart } from './parts/hair.js';
import { topPart, bottomPart, shoePart } from './parts/wardrobe.js';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.argv[2] ?? '/tmp/sheet.png';
const style = (f: string) => JSON.parse(fs.readFileSync(path.join(repo, 'content/families', `${f}.json`), 'utf8')) as FamilyStyle;

const parts: ResolvedPart[] = [
  { ref: 'body', data: bodyPart() },
  { ref: 'head', data: headPart('oval') },
  { ref: 'eyes', data: eyesPart('almond') },
  { ref: 'brows', data: browPart('soft-arch') },
  { ref: 'nose', data: nosePart('button') },
  { ref: 'mouth', data: mouthPart('full') },
  { ref: 'ears', data: earsPart('average') },
  { ref: 'hands', data: handsPart() },
  { ref: 'feet', data: feetPart('flat') },
  { ref: 'hair', data: hairPart(process.env.HAIR ?? 'high-bun') },
  { ref: 'top', data: topPart({ sleeve: 0.95, neck: 'crew', hem: 1.05, fit: 1.07, ribs: true, cuff: true, color: '#C8653F' }) },
  { ref: 'bottom', data: bottomPart({ leg: 0.97, width: 1.2, color: '#3E5953', seams: true }) },
  { ref: 'shoe', data: shoePart({ base: 'sneaker', color: '#EFE6D6', sole: '#B8AE9C', laces: true }) },
];
const colors = { skin: '#B9805C', hair: '#2F221C', eye: '#4B3426', top: '#C8653F', bottom: '#3E5953', shoe: '#EFE6D6' };

const faces: Record<string, Partial<FaceState>> = {
  neutral: {},
  smile: { eyeOpenL: 0.8, eyeOpenR: 0.8, eyeLower: 0.3, mouthCurve: 1, restMouth: 'B', cheek: 0.6, browInnerL: 0.15, browInnerR: 0.15 },
  surprise: { eyeOpenL: 1.3, eyeOpenR: 1.3, browInnerL: 0.9, browInnerR: 0.9, browOuterL: 0.8, browOuterR: 0.8, restMouth: 'E' },
  sad: { eyeOpenL: 0.85, eyeOpenR: 0.85, browInnerL: 0.8, browInnerR: 0.8, browOuterL: -0.3, browOuterR: -0.3, mouthCurve: -0.9 },
  angry: { eyeOpenL: 0.75, eyeOpenR: 0.75, browInnerL: -0.8, browInnerR: -0.8, browFurrow: 1, mouthCurve: -0.5, restMouth: 'A' },
  closedHappy: { eyeOpenL: 0, eyeOpenR: 0, eyeHappy: 1, mouthCurve: 1, restMouth: 'C', cheek: 1 },
};

const r = await createNodeRenderer({ fontsDir: path.join(repo, 'content/fonts') });
const cellW = 260;
const cellH = 420;
const items: Item[] = [];
let x = 0;
const issues = new Set<string>();
for (const fam of ['flat', 'illustrated'] as const) {
  const st = style(fam);
  const spec: CharacterSpec = { family: fam, style: st, body: { ...DEFAULT_BODY, headRatio: st.headRatio, height: 360 }, params: {}, colors, parts };
  const rows: [string, Partial<FaceState>, Partial<Pose>, 'front' | 'three' | 'side' | 'back', boolean, string | null][] = [
    ['front', {}, {}, 'front', false, null],
    ['three', faces.smile!, { armR: { t: [0.5, 0.1, 0.5] }, handR: 'open-palm' }, 'three', false, null],
    ['side', {}, {}, 'side', false, 'D'],
    ['back', {}, {}, 'back', false, null],
  ];
  for (const [, face, pose, view, flip, mouth] of rows) {
    const c = composeCharacter(spec, { view, flip, pose: { ...REST_POSE, ...pose }, face: { ...NEUTRAL_FACE, ...face }, mouth: mouth as never, gaze: [0.3, 0], overlays: {} });
    c.issues.forEach((i) => issues.add(`${fam}/${view}: ${i}`));
    items.push({ k: 'group', tf: [1, 0, 0, 1, x + cellW / 2, cellH - 20], items: [c.item] });
    x += cellW;
  }
}
// Expression row (face close-ups) for both families.
let ex = 0;
for (const fam of ['flat', 'illustrated'] as const) {
  const st = style(fam);
  const spec: CharacterSpec = { family: fam, style: st, body: { ...DEFAULT_BODY, headRatio: st.headRatio, height: fam === 'flat' ? 700 : 1300 }, params: {}, colors, parts };
  for (const [, face] of Object.entries(faces)) {
    const c = composeCharacter(spec, { view: 'front', flip: false, pose: REST_POSE, face: { ...NEUTRAL_FACE, ...face }, mouth: null, gaze: [0, 0], overlays: {} });
    const head = c.joints.head.p;
    items.push({ k: 'group', clip: `M ${ex} ${cellH} h ${cellW * 8 / 12} v 200 h ${-cellW * 8 / 12} Z`, items: [{ k: 'group', tf: [1, 0, 0, 1, ex + (cellW * 8) / 24 - head[0], cellH + 100 - head[1]], items: [c.item] }] });
    ex += (cellW * 8) / 12;
  }
}
const png = r.png({ width: cellW * 8, height: cellH + 210, background: '#E9E4DC', items });
fs.writeFileSync(out, png);
console.log('wrote', out, [...issues].slice(0, 20));
