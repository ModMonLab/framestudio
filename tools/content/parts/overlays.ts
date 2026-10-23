/**
 * Expression overlays (Catalog E2): blush, tears, sweat, stress marks, eye effects and face tints. They sit on the
 * face (face and eye spaces follow head turns) and fade with `opacityParam: overlay.<id>`, so an expression or a face
 * clip sets how strongly they show.
 */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, type PS } from '../dsl.js';
import { headOutline } from './head.js';

const FAMS: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS3: View[] = ['front', 'three', 'side'];

/** Front-view face offsets (u from the centre line) mapped into each view, as the skin overlays do. */
const sideU = (view: View, u: number): number[] => (view === 'front' ? [-u, u] : view === 'three' ? [0.334 - u * 0.785, 0.334 + u * 0.785] : view === 'side' ? [0.62 - (u - 0.4) * 1.2] : []);
export const centre = (view: View) => (view === 'front' ? 0 : view === 'three' ? 0.334 : 0.7);

interface Ctx { a: Art; view: View; ill: boolean; op: string }
type Draw = (c: Ctx) => { face?: ShapeDef[]; eye?: ShapeDef[]; head?: ShapeDef[] };

const ell = (a: Art, u: number, v: number, rx: number, ry: number, fill: string, extra: Partial<ShapeDef> = {}): ShapeDef => ({ ellipse: { c: a.pt([u, v]), rx, ry }, fill, ...extra });
const poly = (a: Art, pts: PS[], fill: string, extra: Partial<ShapeDef> = {}): ShapeDef => ({ path: a.smooth(pts, true, 0.6), fill, ...extra });
const stroke = (a: Art, pts: PS[], c: string, w: number, extra: Partial<ShapeDef> = {}): ShapeDef => ({ path: a.smooth(pts, false, 0.8), stroke: { c, w }, ...extra });
const drop = (a: Art, u: number, v: number, s: number, fill: string, extra: Partial<ShapeDef> = {}): ShapeDef => poly(a, [[u, v - s * 1.6], [u + s * 0.8, v], [u, v + s * 0.75], [u - s * 0.8, v]], fill, extra);
/** The face below the hairline, inside the head outline (oval head; face morphs move it with the head). */
const faceFill = (a: Art, view: View, fill: string, extra: Partial<ShapeDef>, top = -0.55): ShapeDef => ({ path: a.smooth(headOutline('oval', view).map((p) => [p[0] * 0.97, Math.max(top, p[1]) * 0.98, ...(p[2] ? [p[2]] : [])] as PS), true, 0.9), fill, ...extra });
const star4 = (a: Art, u: number, v: number, r: number): ShapeDef => ({ path: a.path([['M', [u, v - r]], ['Q', [u, v], [u + r, v]], ['Q', [u, v], [u, v + r]], ['Q', [u, v], [u - r, v]], ['Q', [u, v], [u, v - r]], ['Z']]), fill: '#FFFFFF' });

const OVERLAYS: Record<string, { colors: Record<string, string>; draw: Draw }> = {
  blush: { colors: { blush: '#E2707A' }, draw: ({ a, view, op }) => ({ face: sideU(view, 0.46).map((u) => ell(a, u, 0.36, 0.2, 0.1, 'blush', { opacity: 0.55, opacityParam: op })) }) },
  'heavy-blush': { colors: { blush: '#D9455A' }, draw: ({ a, view, op }) => ({ face: [
    ...sideU(view, 0.42).map((u) => ell(a, u, 0.34, 0.3, 0.14, 'blush', { opacity: 0.75, opacityParam: op })),
    ...sideU(view, 0.42).flatMap((u) => [-0.12, 0, 0.12].map((d) => stroke(a, [[u + d - 0.04, 0.38], [u + d + 0.04, 0.3]], 'blush.deep', 1.6, { opacityParam: op }))),
  ] }) },
  tears: { colors: { tear: '#8FD3FF' }, draw: ({ a, op }) => ({ eye: [drop(a, 0.6, 0.85, 0.22, 'tear', { opacityParam: op }), ell(a, 0.56, 0.78, 0.06, 0.06, '#FFFFFF', { opacityParam: op })] }) },
  'tear-streams': { colors: { tear: '#7FC6F2' }, draw: ({ a, op }) => ({ eye: [poly(a, [[0.2, 0.55], [0.75, 0.55], [0.85, 2.6], [0.55, 3.4], [0.25, 2.6]], 'tear', { opacity: 0.85, opacityParam: op }), stroke(a, [[0.45, 0.7], [0.5, 2.6]], '#FFFFFF', 0.9, { opacity: 0.7, opacityParam: op })] }) },
  'sweat-drop': { colors: { sweat: '#9FDCFF' }, draw: ({ a, view, op }) => ({ face: [view === 'front' ? 0.74 : view === 'three' ? -0.5 : 0.25].flatMap((u) => [drop(a, u, -0.28, 0.16, 'sweat', { opacityParam: op, stroke: { c: 'sweat.deep', w: 1.2 } }), ell(a, u - 0.04, -0.33, 0.035, 0.05, '#FFFFFF', { opacityParam: op })]) }) },
  'stress-lines': { colors: { mark: '#3A2E44' }, draw: ({ a, view, op }) => {
    const c = centre(view);
    return { face: [-0.16, 0, 0.16].map((d) => stroke(a, [[c + d, -0.42], [c + d * 1.1, -0.22]], 'mark', 2, { opacity: 0.85, opacityParam: op })) };
  } },
  'anger-vein': { colors: { vein: '#D9303A' }, draw: ({ a, view, op }) => {
    const u = sideU(view, 0.38).slice(-1)[0]!;
    const v0 = -0.34;
    const arc = (dx: number, dy: number): PS[] => [[u + dx * 0.05, v0 + dy * 0.05], [u + dx * 0.17, v0 + dy * 0.07], [u + dx * 0.18, v0 + dy * 0.19]];
    return { face: [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([x, y]) => stroke(a, arc(x!, y!), 'vein', 3, { opacityParam: op })) };
  } },
  'shadowed-eyes': { colors: { gloom: '#241C38' }, draw: ({ a, view, op }) => {
    // Gloom over the upper face: the face shape, cut off below the eyes.
    return { head: [{ ...faceFill(a, view, 'gloom', { opacity: 0.6, opacityParam: op, blend: 'multiply' }), path: a.smooth(headOutline('oval', view).map((p) => [p[0] * 0.97, Math.min(0.28, Math.max(-0.55, p[1])), ...(p[2] ? [p[2]] : [])] as PS), true, 0.9) }] };
  } },
  'sparkle-eyes': { colors: { sparkle: '#FFF3A8' }, draw: ({ a, op }) => ({ eye: [{ ...star4(a, 0.2, -0.1, 0.62), fill: 'sparkle', stroke: { c: 'sparkle.deep', w: 0.8 }, opacityParam: op }, { ...star4(a, -0.35, 0.3, 0.28), opacityParam: op }, { ...star4(a, 1.25, -0.7, 0.3), fill: 'sparkle', opacityParam: op }] }) },
  'heart-eyes': { colors: { heart: '#E23A5A' }, draw: ({ a, op }) => ({ eye: [{ path: a.path([['M', [0, 0.55]], ['C', [-1.1, -0.1], [-0.6, -0.95], [0, -0.35]], ['C', [0.6, -0.95], [1.1, -0.1], [0, 0.55]], ['Z']]), fill: 'heart', opacityParam: op }] }) },
  'dizzy-eyes': { colors: { spiral: '#2A2230' }, draw: ({ a, op }) => {
    const pts: PS[] = Array.from({ length: 22 }, (_, i) => {
      const t = i / 21;
      const r = 0.05 + t * 0.65;
      const ang = t * Math.PI * 4.5;
      return [Math.cos(ang) * r, Math.sin(ang) * r * 0.85];
    });
    return { eye: [ell(a, 0, 0, 0.75, 0.62, '#FFFFFF', { opacityParam: op }), stroke(a, pts, 'spiral', 1.6, { opacityParam: op })] };
  } },
  'sick-green': { colors: { sick: '#7BBF4A' }, draw: ({ a, view, op }) => ({ head: [faceFill(a, view, 'sick', { opacity: 0.45, opacityParam: op, blend: 'multiply' })] }) },
  pale: { colors: { pale: '#F2EEEA' }, draw: ({ a, view, op }) => ({ head: [faceFill(a, view, 'pale', { opacity: 0.45, opacityParam: op, blend: 'screen' })] }) },
  'steam-from-ears': { colors: { steam: '#F4F4F4' }, draw: ({ a, view, op }) => {
    const sides = view === 'front' ? [-1, 1] : view === 'three' ? [-1] : [-1];
    const ear = (s: number) => (view === 'front' ? s * 1.12 : view === 'three' ? -0.75 : -0.3);
    return { head: sides.flatMap((s) => [0, 1, 2].map((i) => ell(a, ear(s) + s * i * 0.18, 0.05 - i * 0.22, 0.13 + i * 0.05, 0.11 + i * 0.04, 'steam', { opacity: 0.95 - i * 0.2, opacityParam: op, stroke: { c: 'steam.line', w: 1.2 } }))) };
  } },
};

function overlayArt(id: string, fam: StyleFamily, view: View) {
  const a = new Art('o');
  const d = OVERLAYS[id]!.draw({ a, view, ill: fam === 'illustrated', op: `overlay.overlay.${id}` });
  if (d.face?.length) a.layer('face.overlay', 'face', d.face);
  if (d.eye?.length) a.layer('face.overlay', 'eye', d.eye, { sides: ['L', 'R'] });
  if (d.head?.length) a.layer('face.overlay', 'head', d.head);
  return a.build();
}

export function overlayPart(id: string): PartData {
  const spec = OVERLAYS[id]!;
  const families: PartData['families'] = {};
  const back = id === 'steam-from-ears';
  for (const fam of FAMS) {
    const views = Object.fromEntries([...VIEWS3, ...(back ? (['back'] as View[]) : [])].map((v) => [v, overlayArt(id, fam, v)]));
    families[fam] = { views, ...(back ? {} : { exempt: { back: 'Face overlays are not visible from behind.' } }) };
  }
  const main = Object.keys(spec.colors)[0];
  return { slot: 'face.overlay', families, ...(main ? { colorSlot: main } : {}), colors: spec.colors };
}

export const OVERLAY_IDS = Object.keys(OVERLAYS);
