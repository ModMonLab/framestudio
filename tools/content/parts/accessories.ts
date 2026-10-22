/**
 * Accessories (C1), skin details (A13) and makeup (A14). Accessories attach to the rig's fit spaces — eyes and face
 * (glasses, masks, piercings), head (hats, headphones), ears, neck and torso (ties, scarves, bags), wrists and hands —
 * so they follow every view, pose and expression. Skin details and makeup are face/body overlays in skin-derived colours.
 */
import type { StyleFamily, View } from '../../../packages/schema/src/index.js';
import type { PartData, ShapeDef } from '../../../packages/rig/src/types.js';
import { Art, type PS } from '../dsl.js';

const FAMS: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS: View[] = ['front', 'three', 'side', 'back'];
/** Garment front centre u per view (as wardrobe). */
const C: Record<View, number> = { front: 0, three: 0.4, side: 0.82, back: 0 };

type Ctx = { a: Art; fam: StyleFamily; view: View; ill: boolean; line: (slot: string) => Partial<ShapeDef> };
type Draw = (x: Ctx) => void;

interface AccSpec {
  slot?: string;
  colors: Record<string, string>;
  draw: Draw;
  /** Views where the item is hidden, with the reason (Catalog §0 rule 2). */
  exempt?: Partial<Record<View, string>>;
  hides?: string[];
  options?: Record<string, string[]>;
}

const ell = (a: Art, cx: number, cy: number, rx: number, ry: number, fill: string, extra: Partial<ShapeDef> = {}): ShapeDef => ({ ellipse: { c: a.pt([cx, cy]), rx, ry }, fill, ...extra });
const ring = (a: Art, cx: number, cy: number, rx: number, ry: number, c: string, w: number): ShapeDef => ({ ellipse: { c: a.pt([cx, cy]), rx, ry }, stroke: { c, w } });
const poly = (a: Art, pts: PS[], fill: string, smooth = 0.4, extra: Partial<ShapeDef> = {}): ShapeDef => ({ path: smooth ? a.smooth(pts, true, smooth) : a.path([['M', pts[0]!], ...pts.slice(1).map((p) => ['L', p] as ['L', PS]), ['Z']]), fill, ...extra });
const line = (a: Art, pts: PS[], c: string, w: number, smooth = false): ShapeDef => ({ path: smooth ? a.smooth(pts, false, 0.8) : a.path([['M', pts[0]!], ...pts.slice(1).map((p) => ['L', p] as ['L', PS])]), stroke: { c, w } });

/* ------------------------------------------------------------------ face: glasses and the like (eye spaces) */

function glasses(o: { shape: 'round' | 'rect' | 'cat'; frame: string; lens?: string; lensOpacity?: number; low?: boolean; one?: boolean; w?: number }): Draw {
  return ({ a, view }) => {
    if (view === 'back') {
      // Temple arms run back to the ears.
      a.layer('acc.face', 'head', [line(a, [[-0.98, 0.06], [-0.9, 0.14]], 'acc', 3), line(a, [[0.98, 0.06], [0.9, 0.14]], 'acc', 3)]);
      return;
    }
    const dy = o.low ? 0.9 : 0;
    const rx = o.shape === 'rect' ? 1.85 : 1.75;
    const ry = o.shape === 'rect' ? 1.25 : o.low ? 0.9 : 1.5;
    const rim: ShapeDef[] = [];
    if (o.lens) rim.push(o.shape === 'round' ? ell(a, 0.15, dy, rx, ry, 'lens', { opacity: o.lensOpacity ?? 0.85 }) : poly(a, lensPts(o.shape, rx, ry, dy), 'lens', o.shape === 'rect' ? 0.15 : 0.3, { opacity: o.lensOpacity ?? 0.85 }));
    rim.push(o.shape === 'round' ? ring(a, 0.15, dy, rx, ry, 'acc', o.w ?? 2.4) : { ...poly(a, lensPts(o.shape, rx, ry, dy), 'acc', o.shape === 'rect' ? 0.15 : 0.3), fill: undefined, stroke: { c: 'acc', w: o.w ?? 2.4 } } as ShapeDef);
    // Half the bridge from each eye toward the nose; the far eye in three-quarter view meets it.
    if (!o.one) rim.push(line(a, [[0.15 - rx, dy - 0.2], [-2.0, dy - 0.35]], 'acc', o.w ?? 2.4));
    // In side view the temple arm runs back to the ear.
    if (view === 'side') rim.push(line(a, [[0.15 + rx, dy - 0.3], [3.4, dy - 0.1]], 'acc', o.w ?? 2.4));
    a.layer('acc.face', 'eye', rim, { sides: o.one ? ['L'] : ['L', 'R'] });
  };
}
function lensPts(shape: 'rect' | 'cat' | 'round', rx: number, ry: number, dy: number): PS[] {
  const cx = 0.15;
  if (shape === 'cat') return [[cx - rx, dy - ry * 0.4], [cx + rx * 1.15, dy - ry * 1.05], [cx + rx, dy + ry * 0.6], [cx - rx * 0.6, dy + ry * 0.9]];
  return [[cx - rx, dy - ry], [cx + rx, dy - ry], [cx + rx, dy + ry], [cx - rx, dy + ry]];
}

/* ------------------------------------------------------------------ head: hats, bands, audio */

/** Crown outline in head space for a view (u ≥ 0 faces forward in side/three views). */
function crown(view: View, top: number, bottom: number, w = 1.1): PS[] {
  const sh = view === 'side' ? 0.08 : view === 'three' ? 0.04 : 0;
  return [[-w + sh, bottom], [-w * 0.95 + sh, (top + bottom) / 2], [sh, top], [w * 0.95 + sh, (top + bottom) / 2], [w + sh, bottom]];
}

function hat(kind: 'cap' | 'beanie' | 'fedora' | 'sun' | 'hard' | 'band' | 'bandana'): Draw {
  return ({ a, view, line: ln }) => {
    const shapes: ShapeDef[] = [];
    const fwd = view === 'side' ? 1 : view === 'three' ? 0.6 : 0;
    switch (kind) {
      case 'cap': {
        shapes.push(poly(a, crown(view, -1.32, -0.5), 'acc', 0.5, ln('acc')));
        if (view === 'back') shapes.push(ell(a, 0, -0.6, 0.28, 0.08, 'acc.deep'));
        else if (view === 'front') shapes.push(poly(a, [[-0.95, -0.52], [0.95, -0.52], [0.7, -0.38], [-0.7, -0.38]], 'acc.shade', 0.3));
        else shapes.push(poly(a, [[0.4, -0.55], [1.05 + fwd * 0.55, -0.5], [1.0 + fwd * 0.5, -0.4], [0.4, -0.45]], 'acc.shade', 0.3));
        shapes.push(ell(a, view === 'side' ? 0.08 : 0, -1.3, 0.09, 0.05, 'acc.deep'));
        break;
      }
      case 'beanie':
        shapes.push(poly(a, crown(view, -1.42, -0.42, 1.14), 'acc', 0.6, ln('acc')));
        shapes.push(poly(a, [[-1.16, -0.62], [1.16, -0.62], [1.16, -0.4], [-1.16, -0.4]], 'acc.shade', 0.2));
        for (let i = -4; i <= 4; i++) shapes.push(line(a, [[i * 0.24, -0.6], [i * 0.24, -0.42]], 'acc.deep', 1));
        break;
      case 'fedora':
        shapes.push(poly(a, [[-1.65, -0.5], [1.65, -0.5], [1.5, -0.4], [-1.5, -0.4]], 'acc.shade', 0.4, ln('acc')));
        shapes.push(poly(a, [[-0.95, -0.5], [-0.9, -1.15], [0, -1.05], [0.9, -1.15], [0.95, -0.5]], 'acc', 0.35, ln('acc')));
        shapes.push(poly(a, [[-0.96, -0.66], [0.96, -0.66], [0.96, -0.52], [-0.96, -0.52]], 'band', 0.1));
        break;
      case 'sun':
        shapes.push(ell(a, 0, -0.5, 2.0, 0.22, 'acc.shade', ln('acc')));
        shapes.push(poly(a, crown(view, -1.25, -0.5, 1.0), 'acc', 0.5, ln('acc')));
        shapes.push(poly(a, [[-1.0, -0.68], [1.0, -0.68], [1.0, -0.54], [-1.0, -0.54]], 'band', 0.1));
        break;
      case 'hard':
        shapes.push(poly(a, crown(view, -1.4, -0.48, 1.15), 'acc', 0.55, ln('acc')));
        shapes.push(poly(a, [[-1.3, -0.52], [1.3 + fwd * 0.3, -0.52], [1.3 + fwd * 0.3, -0.42], [-1.3, -0.42]], 'acc.shade', 0.2));
        shapes.push(line(a, [[-0.1, -1.36], [-0.1, -0.55]], 'acc.light', 4));
        break;
      case 'band':
        shapes.push(poly(a, [[-1.08, -0.62], [-0.6, -0.86], [0.6, -0.86], [1.08, -0.62], [1.06, -0.5], [0.6, -0.72], [-0.6, -0.72], [-1.06, -0.5]], 'acc', 0.4, ln('acc')));
        break;
      case 'bandana':
        shapes.push(poly(a, crown(view, -1.25, -0.55, 1.1), 'acc', 0.5, ln('acc')));
        for (const [u, v] of [[-0.5, -0.9], [0.2, -1.05], [0.6, -0.75], [-0.1, -0.7]] as const) shapes.push(ell(a, u, v, 0.07, 0.07, 'acc.light'));
        if (view === 'back' || view === 'side') shapes.push(poly(a, [[-0.2 - (view === 'side' ? 0.9 : 0), -0.55], [0.2 - (view === 'side' ? 0.9 : 0), -0.55], [0.1 - (view === 'side' ? 0.9 : 0), -0.2], [-0.1 - (view === 'side' ? 0.9 : 0), -0.25]], 'acc.shade', 0.3));
        break;
    }
    a.layer('acc.head', 'head', shapes);
  };
}

/** Ear positions per view in head space (both / one visible). */
const EARS: Record<View, [number, number][]> = { front: [[-1.0, 0.12], [1.0, 0.12]], three: [[-0.6, 0.12]], side: [[-0.12, 0.12]], back: [[-1.0, 0.12], [1.0, 0.12]] };

function audio(kind: 'phones' | 'headset'): Draw {
  return ({ a, view, line: ln }) => {
    const shapes: ShapeDef[] = [];
    const sh = view === 'side' ? -0.1 : view === 'three' ? -0.05 : 0;
    shapes.push({ path: a.smooth([[-1.04 + sh, 0.0], [-0.95 + sh, -0.95], [sh, -1.28], [0.95 + sh, -0.95], [1.04 + sh, 0.0]], false, 0.8), stroke: { c: 'acc', w: 6 } });
    for (const [u, v] of EARS[view]) shapes.push(ell(a, u, v, view === 'side' ? 0.3 : 0.2, 0.32, 'acc.shade', ln('acc')));
    if (kind === 'headset' && view !== 'back') {
      // Boom microphone from the near ear cup toward the mouth.
      const [u, v] = EARS[view][EARS[view].length - 1]!;
      const tip: PS = view === 'front' ? [0.3, 0.72] : view === 'three' ? [0.55, 0.72] : [0.7, 0.7];
      shapes.push(line(a, [[u, v + 0.2], [(u + tip[0]) / 2, v + 0.62], tip], 'acc', 3, true));
      shapes.push(ell(a, tip[0], tip[1], 0.08, 0.07, 'mic'));
    }
    a.layer('acc.head', 'head', shapes);
  };
}

/* ------------------------------------------------------------------ ears */

function earrings(kind: 'stud' | 'hoop' | 'drop' | 'bud'): Draw {
  return ({ a, view }) => {
    const shapes: ShapeDef[] = [];
    if (kind === 'stud') shapes.push(ell(a, 0.18, 0.82, 0.13, 0.13, 'metal'));
    if (kind === 'hoop') shapes.push(ring(a, 0.2, 1.2, 0.36, 0.42, 'metal', 2.6));
    if (kind === 'drop') shapes.push(line(a, [[0.18, 0.82], [0.18, 1.12]], 'metal', 1.2), ell(a, 0.18, 1.22, 0.12, 0.16, 'gem'));
    if (kind === 'bud') shapes.push(ell(a, 0.08, 0.15, 0.2, 0.2, 'acc'), line(a, [[0.1, 0.3], [0.12, 0.75]], 'acc', 2.2));
    a.layer('acc.ears', 'ear', shapes, { sides: view === 'front' || view === 'back' ? ['L', 'R'] : ['R'] });
  };
}

/* ------------------------------------------------------------------ neck and torso */

function neckwear(kind: 'tie' | 'bow' | 'scarf' | 'chain' | 'pendant' | 'lanyard'): Draw {
  return ({ a, view, line: ln }) => {
    const c = C[view];
    const back = view === 'back';
    const shapes: ShapeDef[] = [];
    switch (kind) {
      case 'tie':
        shapes.push(poly(a, [[c - 0.08, -0.08], [c + 0.08, -0.08], [c + 0.05, 0.02], [c - 0.05, 0.02]], 'acc.shade', 0.2));
        shapes.push(poly(a, [[c - 0.05, 0.02], [c + 0.05, 0.02], [c + 0.11, 0.52], [c, 0.62], [c - 0.11, 0.52]], 'acc', 0, ln('acc')));
        shapes.push(line(a, [[c - 0.06, 0.18], [c + 0.08, 0.12]], 'acc.deep', 2));
        break;
      case 'bow':
        shapes.push(poly(a, [[c, -0.04], [c - 0.2, -0.12], [c - 0.2, 0.06]], 'acc', 0.2, ln('acc')), poly(a, [[c, -0.04], [c + 0.2, -0.12], [c + 0.2, 0.06]], 'acc', 0.2, ln('acc')), ell(a, c, -0.03, 0.05, 0.05, 'acc.deep'));
        break;
      case 'scarf':
        shapes.push(poly(a, [[-0.62, -0.2], [0.62, -0.2], [0.66, 0.02], [-0.66, 0.02]], 'acc', 0.6, ln('acc')));
        if (!back) shapes.push(poly(a, [[c + 0.06, 0.0], [c + 0.28, 0.0], [c + 0.3, 0.55], [c + 0.08, 0.55]], 'acc.shade', 0.2, ln('acc')));
        for (const u of [-0.3, 0, 0.3]) shapes.push(line(a, [[u, -0.18], [u + 0.05, 0.0]], 'acc.deep', 1.4));
        break;
      case 'chain':
      case 'pendant':
        shapes.push({ path: a.smooth([[c - 0.32, -0.16], [c, kind === 'pendant' ? 0.18 : 0.1], [c + 0.32, -0.16]], false, 0.8), stroke: { c: 'metal', w: 1.4 } });
        if (kind === 'pendant' && !back) shapes.push(ell(a, c, 0.22, 0.05, 0.06, 'gem'));
        break;
      case 'lanyard':
        shapes.push({ path: a.smooth([[c - 0.3, -0.16], [c - 0.06, 0.4], [c + 0.06, 0.4], [c + 0.3, -0.16]], false, 0.6), stroke: { c: 'acc', w: 2.4 } });
        if (!back) shapes.push(poly(a, [[c - 0.13, 0.4], [c + 0.13, 0.4], [c + 0.13, 0.68], [c - 0.13, 0.68]], 'card', 0.1, ln('card')), line(a, [[c - 0.08, 0.6], [c + 0.08, 0.6]], 'acc', 1.2));
        break;
    }
    a.layer('acc.neck', 'torso', shapes);
  };
}

function bag(kind: 'backpack' | 'messenger' | 'tote' | 'belt'): Draw {
  return ({ a, view, line: ln }) => {
    const back = view === 'back';
    const side = view === 'side';
    if (kind === 'belt') {
      a.layer('acc.waist', 'torso', [poly(a, [[-1.1, 0.92], [1.1, 0.92], [1.1, 1.0], [-1.1, 1.0]], 'acc', 0.1, { clip: undefined }), ...(back ? [] : [poly(a, [[C[view] - 0.07, 0.9], [C[view] + 0.07, 0.9], [C[view] + 0.07, 1.02], [C[view] - 0.07, 1.02]], 'metal', 0.1)])]);
      return;
    }
    if (kind === 'backpack') {
      const body = poly(a, side ? [[-1.5, -0.05], [-0.85, -0.05], [-0.8, 0.75], [-1.5, 0.75]] : [[-0.62, -0.02], [0.62, -0.02], [0.66, 0.78], [-0.66, 0.78]], 'acc', 0.35, ln('acc'));
      const pocket = poly(a, side ? [[-1.6, 0.35], [-1.45, 0.35], [-1.45, 0.7], [-1.6, 0.7]] : [[-0.42, 0.42], [0.42, 0.42], [0.42, 0.72], [-0.42, 0.72]], 'acc.shade', 0.2);
      if (back) a.layer('acc.waist', 'torso', [body, pocket]);
      else {
        a.layer('acc.back', 'torso', [body]);
        a.layer('acc.waist', 'torso', view === 'front' ? [line(a, [[-0.5, -0.14], [-0.48, 0.6]], 'acc.deep', 4), line(a, [[0.5, -0.14], [0.48, 0.6]], 'acc.deep', 4)] : [line(a, [[0.2, -0.16], [0.25, 0.6]], 'acc.deep', 4)]);
      }
      return;
    }
    // Shoulder bags: strap across the body, bag at the hip.
    const strap = kind === 'messenger' ? line(a, [[-0.55, -0.16], [0.7, 0.95]], 'acc.deep', 3.4) : line(a, [[0.55, -0.16], [0.75, 0.75]], 'acc.deep', 3);
    const bagShape = kind === 'messenger'
      ? poly(a, [[0.45, 0.85], [1.15, 0.85], [1.15, 1.3], [0.45, 1.3]], 'acc', 0.2, ln('acc'))
      : poly(a, [[0.55, 0.7], [1.2, 0.7], [1.28, 1.35], [0.48, 1.35]], 'acc', 0.15, ln('acc'));
    a.layer('acc.waist', 'torso', [strap, bagShape, ...(kind === 'messenger' ? [poly(a, [[0.45, 0.85], [1.15, 0.85], [1.15, 1.05], [0.45, 1.05]], 'acc.shade', 0.2)] : [])]);
  };
}

/* ------------------------------------------------------------------ wrists and hands */

function wrist(kind: 'watch' | 'smart' | 'bracelet'): Draw {
  return ({ a }) => {
    const shapes: ShapeDef[] = kind === 'bracelet'
      ? [poly(a, [[-0.44, -0.16], [0.44, -0.16], [0.44, -0.08], [-0.44, -0.08]], 'metal', 0.3)]
      : [poly(a, [[-0.44, -0.2], [0.44, -0.2], [0.44, -0.06], [-0.44, -0.06]], 'acc', 0.2), kind === 'smart' ? poly(a, [[-0.2, -0.26], [0.2, -0.26], [0.2, 0.0], [-0.2, 0.0]], 'screen', 0.2) : ell(a, 0, -0.13, 0.17, 0.15, 'metal')];
    a.layer('acc.hand.*', 'handL', shapes);
  };
}

function handwear(kind: 'rings' | 'gloves' | 'handbag'): Draw {
  return ({ a }) => {
    if (kind === 'rings') {
      a.layer('acc.hand.*', 'hand', [poly(a, [[-0.3, 0.62], [-0.05, 0.62], [-0.05, 0.7], [-0.3, 0.7]], 'metal', 0.2)], { sides: ['L', 'R'] });
      return;
    }
    if (kind === 'gloves') {
      a.layer('acc.hand.*', 'hand', [poly(a, [[-0.5, -0.06], [0.42, -0.06], [0.5, 0.55], [0.1, 1.05], [-0.62, 0.9], [-0.7, 0.35]], 'acc', 0.55)], { sides: ['L', 'R'] });
      return;
    }
    a.layer('acc.hand.*', 'handR', [line(a, [[-0.2, 0.55], [-0.35, 1.0]], 'acc.deep', 2.4), line(a, [[0.2, 0.55], [0.35, 1.0]], 'acc.deep', 2.4), poly(a, [[-0.75, 1.0], [0.75, 1.0], [0.85, 1.85], [-0.85, 1.85]], 'acc', 0.25)]);
  };
}

/* ------------------------------------------------------------------ face piercings and mask */

function faceBits(kind: 'mask' | 'nose-ring' | 'lip' | 'brow'): Draw {
  return ({ a, view }) => {
    if (kind === 'mask') {
      if (view === 'back') a.layer('acc.face', 'head', [line(a, [[-1.0, 0.1], [1.0, 0.1]], 'acc.deep', 2)]);
      else a.layer('acc.face', 'mouth', [poly(a, [[-3.4, -2.3], [3.4, -2.3], [3.0, 1.8], [0, 2.6], [-3.0, 1.8]], 'acc', 0.45), line(a, [[-2.6, -0.6], [2.6, -0.6]], 'acc.shade', 1.2), line(a, [[-2.4, 0.6], [2.4, 0.6]], 'acc.shade', 1.2)]);
      return;
    }
    if (view === 'back') return;
    if (kind === 'nose-ring') a.layer('acc.face', 'nose', [ring(a, 0.32, 0.42, 0.09, 0.09, 'metal', 1.2)]);
    if (kind === 'lip') a.layer('acc.face', 'mouth', [ell(a, 0.55, 0.62, 0.1, 0.1, 'metal')]);
    if (kind === 'brow') a.layer('acc.face', 'brow', [ell(a, 1.25, 0.18, 0.09, 0.09, 'metal'), ell(a, 1.3, -0.22, 0.09, 0.09, 'metal')], { sides: ['L'] });
  };
}

const FACE_ONLY = 'Worn on the face; hidden from behind.';
const FRONT_ONLY = 'Worn on the front of the body; hidden from behind.';

export const ACCESSORIES: Record<string, AccSpec> = {
  'round-glasses': { colors: { acc: '#3A2E28', lens: '#CFE3EE' }, draw: glasses({ shape: 'round', frame: 'acc', lens: 'lens', lensOpacity: 0.25 }) },
  'rectangular-glasses': { colors: { acc: '#202024', lens: '#CFE3EE' }, draw: glasses({ shape: 'rect', frame: 'acc', lens: 'lens', lensOpacity: 0.25 }) },
  'cat-eye-glasses': { colors: { acc: '#8C2F3A', lens: '#CFE3EE' }, draw: glasses({ shape: 'cat', frame: 'acc', lens: 'lens', lensOpacity: 0.25, w: 3 }) },
  sunglasses: { colors: { acc: '#141414', lens: '#23262D' }, draw: glasses({ shape: 'rect', frame: 'acc', lens: 'lens', lensOpacity: 0.92 }) },
  'reading-glasses-on-nose': { colors: { acc: '#6B5A4A', lens: '#CFE3EE' }, draw: glasses({ shape: 'rect', frame: 'acc', lens: 'lens', lensOpacity: 0.2, low: true, w: 1.8 }) },
  monocle: { colors: { acc: '#B9963A', lens: '#CFE3EE' }, draw: glasses({ shape: 'round', frame: 'acc', lens: 'lens', lensOpacity: 0.2, one: true }) },
  'baseball-cap': { colors: { acc: '#2F5E8C' }, draw: hat('cap'), hides: [] },
  beanie: { colors: { acc: '#B5553F' }, draw: hat('beanie') },
  fedora: { colors: { acc: '#4A4038', band: '#1E1A17' }, draw: hat('fedora') },
  'sun-hat': { colors: { acc: '#E5D3A8', band: '#B5553F' }, draw: hat('sun') },
  'hard-hat': { colors: { acc: '#F2C230' }, draw: hat('hard') },
  headband: { colors: { acc: '#C94F6D' }, draw: hat('band') },
  bandana: { colors: { acc: '#B8313B' }, draw: hat('bandana') },
  headphones: { colors: { acc: '#2A2A30' }, draw: audio('phones') },
  'headset-with-mic': { colors: { acc: '#26262C', mic: '#4A4A52' }, draw: audio('headset') },
  earbuds: { colors: { acc: '#F4F4F2' }, draw: earrings('bud') },
  'stud-earrings': { colors: { metal: '#D8B65A' }, draw: earrings('stud') },
  'hoop-earrings': { colors: { metal: '#D8B65A' }, draw: earrings('hoop') },
  'drop-earrings': { colors: { metal: '#C9CED6', gem: '#4F8FC9' }, draw: earrings('drop') },
  'necklace-chain': { colors: { metal: '#D8B65A' }, draw: neckwear('chain') },
  pendant: { colors: { metal: '#C9CED6', gem: '#8C3A6E' }, draw: neckwear('pendant') },
  scarf: { colors: { acc: '#6E8C5E' }, draw: neckwear('scarf') },
  tie: { colors: { acc: '#7A2E35' }, draw: neckwear('tie'), exempt: { back: FRONT_ONLY } },
  'bow-tie': { colors: { acc: '#1E1E24' }, draw: neckwear('bow'), exempt: { back: FRONT_ONLY } },
  'lanyard-badge': { colors: { acc: '#2F5E8C', card: '#F4F2EC' }, draw: neckwear('lanyard') },
  wristwatch: { colors: { acc: '#5A3E2B', metal: '#E8E4D8' }, draw: wrist('watch') },
  smartwatch: { colors: { acc: '#202024', screen: '#3A6EA8' }, draw: wrist('smart') },
  bracelet: { colors: { metal: '#D8B65A' }, draw: wrist('bracelet') },
  rings: { colors: { metal: '#D8B65A' }, draw: handwear('rings') },
  gloves: { colors: { acc: '#3A3A44' }, draw: handwear('gloves') },
  backpack: { colors: { acc: '#3F6E5A' }, draw: bag('backpack') },
  'messenger-bag': { colors: { acc: '#7A5236' }, draw: bag('messenger'), exempt: { back: FRONT_ONLY } },
  'tote-bag': { colors: { acc: '#E3D5B8' }, draw: bag('tote'), exempt: { back: FRONT_ONLY } },
  handbag: { colors: { acc: '#8C2F3A' }, draw: handwear('handbag') },
  belt: { colors: { acc: '#3E2B20', metal: '#C9A74A' }, draw: bag('belt') },
  'face-mask': { colors: { acc: '#9CC4D9' }, draw: faceBits('mask') },
  'nose-ring': { colors: { metal: '#C9CED6' }, draw: faceBits('nose-ring'), exempt: { back: FACE_ONLY } },
  'lip-piercing': { colors: { metal: '#C9CED6' }, draw: faceBits('lip'), exempt: { back: FACE_ONLY } },
  'eyebrow-piercing': { colors: { metal: '#C9CED6' }, draw: faceBits('brow'), exempt: { back: FACE_ONLY } },
  'hair-clip': { colors: { acc: '#E8C64A' }, draw: ({ a, view }) => { a.layer('acc.head', 'head', [poly(a, view === 'back' ? [[0.3, -0.6], [0.7, -0.66], [0.7, -0.58], [0.3, -0.52]] : [[0.4, -0.72], [0.82, -0.6], [0.8, -0.52], [0.38, -0.64]], 'acc', 0.2)]); } },
};

/* ------------------------------------------------------------------ skin details and makeup (overlays) */

/**
 * Overlays sit on the face (face space follows yaw). Positions are authored for the front view (u = ±offset from the
 * centre line) and mapped to each view through the eye anchors: front eyes at ±0.4, three-quarter at 0.02 (near) and
 * 0.648 (far), side at 0.62 (near only).
 */
function faceOverlay(slot: 'face.overlay' | 'makeup', draw: (a: Art, view: View, sideU: (u: number) => number[], cu: number) => ShapeDef[], backOk = false): AccSpec['draw'] {
  return ({ a, view }) => {
    if (view === 'back' && !backOk) return;
    const sideU = (u: number) => (view === 'front' ? [-u, u] : view === 'three' ? [0.334 - u * 0.785, 0.334 + u * 0.785] : view === 'side' ? [0.62 - (u - 0.4) * 1.2] : []);
    const cu = view === 'front' ? 0 : view === 'three' ? 0.334 : 0.7;
    const shapes = draw(a, view, sideU, cu);
    if (shapes.length) a.layer(slot, 'face', shapes);
  };
}

const dots = (a: Art, pts: [number, number][], r: number, fill: string, op = 0.7): ShapeDef[] => pts.map(([u, v]) => ell(a, u, v, r * 1.4, r * 1.2, fill, { opacity: Math.min(1, op + 0.15) }));

export const SKIN_DETAILS: Record<string, AccSpec> = {
  'freckles-light': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.42).flatMap((u) => dots(a, [[u, 0.28], [u + 0.1, 0.34], [u - 0.08, 0.36], [u + 0.04, 0.24]], 0.025, 'skin.deep', 0.5))) },
  'freckles-heavy': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.4).flatMap((u) => dots(a, Array.from({ length: 10 }, (_, i) => [u + ((i * 37) % 9) / 30 - 0.15, 0.2 + ((i * 53) % 7) / 30] as [number, number]), 0.025, 'skin.deep', 0.6))) },
  moles: { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.5).flatMap((u) => dots(a, [[u, 0.5]], 0.035, 'skin.line', 0.8))) },
  'beauty-mark': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.32).slice(-1).flatMap((u) => dots(a, [[u, 0.55]], 0.03, 'skin.line', 0.9))) },
  'forehead-lines': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, _s, c) => { return [-0.42, -0.34].map((v) => ({ ...line(a, [[c - 0.32, v], [c, v - 0.03], [c + 0.32, v]], 'skin.shade', 1.6, true), opacity: 0.85 })); }) },
  'crows-feet': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.7).flatMap((u) => { const o = Math.sign(u) || 1; return [-0.05, 0.05, 0.14].map((dv) => ({ ...line(a, [[u, 0.1 + dv * 0.4], [u + o * 0.1, 0.06 + dv]], 'skin.shade', 1.5, false), opacity: 0.9 })); })) },
  'smile-lines': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.32).map((u) => { const o = Math.sign(u) || 1; return { ...line(a, [[u, 0.38], [u + o * 0.06, 0.5], [u + o * 0.04, 0.64]], 'skin.shade', 1.7, true), opacity: 0.9 }; })) },
  'under-eye-bags': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.4).map((u) => ({ ...line(a, [[u - 0.14, 0.24], [u, 0.28], [u + 0.14, 0.24]], 'skin.shade', 1.2, true), opacity: 0.6 }))) },
  'scar-straight': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.45).slice(-1).map((u) => ({ ...line(a, [[u - 0.05, -0.3], [u + 0.08, 0.05]], 'skin.light', 2.2), opacity: 0.85 }))) },
  'scar-curved': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.5).slice(-1).map((u) => ({ ...line(a, [[u - 0.15, 0.3], [u, 0.42], [u + 0.15, 0.3]], 'skin.light', 2.2, true), opacity: 0.85 }))) },
  'scar-cheek': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.55).slice(-1).flatMap((u) => [{ ...line(a, [[u - 0.1, 0.32], [u + 0.1, 0.48]], 'skin.light', 2), opacity: 0.85 }, ...[0.36, 0.42].map((v) => ({ ...line(a, [[u - 0.06, v + 0.04], [u + 0.04, v - 0.03]], 'skin.light', 1), opacity: 0.7 }))])) },
  'vitiligo-pattern': { colors: {}, options: { layout: ['cheek', 'forehead', 'chin'] }, draw: faceOverlay('face.overlay', (a, _v, s) => [
    ...s(0.45).map((u) => poly(a, [[u - 0.14, 0.18], [u + 0.1, 0.14], [u + 0.16, 0.36], [u - 0.06, 0.44]], 'skin.light', 0.6, { opacity: 0.85, when: { layout: ['cheek', ''] } })),
    poly(a, [[-0.25, -0.6], [0.2, -0.65], [0.3, -0.38], [-0.18, -0.34]], 'skin.light', 0.6, { opacity: 0.85, when: { layout: 'forehead' } }),
    poly(a, [[-0.15, 0.78], [0.18, 0.76], [0.14, 0.95], [-0.12, 0.94]], 'skin.light', 0.6, { opacity: 0.85, when: { layout: 'chin' } }),
  ]) },
  birthmark: { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.5).slice(-1).map((u) => poly(a, [[u - 0.1, 0.4], [u + 0.08, 0.36], [u + 0.12, 0.52], [u - 0.06, 0.56]], 'skin.deep', 0.6, { opacity: 0.55 }))) },
  acne: { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.45).flatMap((u) => dots(a, [[u, 0.4], [u + 0.08, 0.5], [u - 0.06, 0.55]], 0.025, 'skin.blush', 0.8))) },
  'rosy-cheeks': { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.45).map((u) => ell(a, u, 0.38, 0.17, 0.1, 'skin.blush', { opacity: 0.35 }))) },
  'tattoo-slot-face': { colors: { ink: '#2E3A4A' }, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.55).slice(-1).map((u) => ({ ...line(a, [[u, -0.2], [u + 0.06, -0.1], [u, 0.0]], 'ink', 1.4, true), opacity: 0.8 }))) },
  'tattoo-slot-neck': { colors: { ink: '#2E3A4A' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('collar', 'torso', [{ ...line(a, [[C[view] - 0.05, -0.3], [C[view] + 0.06, -0.22], [C[view] - 0.02, -0.14]], 'ink', 2, true), opacity: 0.8 }]); } },
  'tattoo-slot-arms': { colors: { ink: '#2E3A4A' }, draw: ({ a }) => { a.layer('sleeve.*', 'foreArmL', [{ ...line(a, [[-0.4, 0.2], [0.3, 0.35], [-0.2, 0.55]], 'ink', 2, true), opacity: 0.8 }]); } },
  'body-hair': { colors: {}, draw: ({ a }) => { a.layer('sleeve.*', 'foreArmL', Array.from({ length: 6 }, (_, i) => ({ ...line(a, [[-0.5 + i * 0.18, 0.3 + (i % 2) * 0.1], [-0.45 + i * 0.18, 0.4 + (i % 2) * 0.1]], 'hair', 0.8), opacity: 0.6 }))); a.layer('sleeve.*', 'foreArmR', Array.from({ length: 6 }, (_, i) => ({ ...line(a, [[-0.5 + i * 0.18, 0.3 + (i % 2) * 0.1], [-0.45 + i * 0.18, 0.4 + (i % 2) * 0.1]], 'hair', 0.8), opacity: 0.6 }))); } },
  dimples: { colors: {}, draw: faceOverlay('face.overlay', (a, _v, s) => s(0.38).map((u) => ({ ...line(a, [[u, 0.56], [u + 0.01, 0.62]], 'skin.shade', 1.4), opacity: 0.6 }))) },
};

export const MAKEUP: Record<string, AccSpec> = {
  eyeliner: { colors: { liner: '#1A1414' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('makeup', 'eye', [line(a, [[-1.3, -0.45], [0.2, -0.62], [1.6, -0.4]], 'liner', 1.6, true)], { sides: ['L', 'R'] }); }, exempt: { back: FACE_ONLY } },
  'winged-liner': { colors: { liner: '#1A1414' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('makeup', 'eye', [line(a, [[-1.3, -0.45], [0.2, -0.62], [1.6, -0.4], [2.2, -0.75]], 'liner', 1.8, true)], { sides: ['L', 'R'] }); }, exempt: { back: FACE_ONLY } },
  eyeshadow: { colors: { shadow: '#8C6AA8' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('makeup', 'eye', [ell(a, 0.2, -0.8, 1.6, 0.55, 'shadow', { opacity: 0.45 })], { sides: ['L', 'R'] }); }, exempt: { back: FACE_ONLY } },
  mascara: { colors: { liner: '#141010' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('makeup', 'eye', [0.6, 1.0, 1.4].map((u) => line(a, [[u, -0.5], [u + 0.2, -0.85]], 'liner', 1.2)), { sides: ['L', 'R'] }); }, exempt: { back: FACE_ONLY } },
  lipstick: { colors: { lipcolor: '#B8313B' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('makeup', 'mouth', [ell(a, 0.1, 0.1, 1.4, 0.45, 'lipcolor', { opacity: 0.55 })]); }, exempt: { back: FACE_ONLY } },
  'lip-gloss': { colors: { gloss: '#F4D2D6' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('makeup', 'mouth', [ell(a, 0.2, 0.25, 0.6, 0.12, 'gloss', { opacity: 0.5 })]); }, exempt: { back: FACE_ONLY } },
  blush: { colors: { blushcolor: '#E2707A' }, draw: faceOverlay('makeup', (a, _v, s) => s(0.48).map((u) => ell(a, u, 0.36, 0.2, 0.11, 'blushcolor', { opacity: 0.3 }))) },
  contour: { colors: {}, draw: faceOverlay('makeup', (a, _v, s) => s(0.62).map((u) => poly(a, [[u - 0.08, 0.2], [u + 0.08, 0.16], [u + 0.04, 0.5], [u - 0.1, 0.46]], 'skin.shade', 0.6, { opacity: 0.35 }))) },
  'bold-brows': { colors: { browink: '#2A1C14' }, draw: ({ a, view }) => { if (view !== 'back') a.layer('makeup', 'brow', [poly(a, [[-1.0, 0.05], [0.4, -0.22], [1.45, -0.05], [1.4, 0.08], [0.3, -0.06], [-1.0, 0.16]], 'browink', 0.3, { opacity: 0.55 })], { sides: ['L', 'R'] }); }, exempt: { back: FACE_ONLY } },
  glitter: { colors: { sparkle: '#F2E6A6' }, draw: faceOverlay('makeup', (a, _v, s) => s(0.5).flatMap((u) => dots(a, [[u, 0.15], [u + 0.08, 0.2], [u - 0.06, 0.24], [u + 0.04, 0.3]], 0.02, 'sparkle', 0.9))) },
  'stage-makeup': { colors: { stage: '#D9455A', liner: '#1A1414' }, draw: faceOverlay('makeup', (a, _v, s) => [...s(0.46).map((u) => ell(a, u, 0.38, 0.17, 0.12, 'stage', { opacity: 0.6 })), ...s(0.4).map((u) => line(a, [[u - 0.14, 0.02], [u + 0.14, 0.02]], 'liner', 2))]) },
  'face-paint': { colors: { paint: '#3A8FC9' }, options: { pattern: ['stripes', 'star', 'whiskers'] }, draw: faceOverlay('makeup', (a, _v, s) => [
    ...s(0.5).flatMap((u) => [0.3, 0.42].map((v) => ({ ...line(a, [[u - 0.15, v], [u + 0.15, v - 0.03]], 'paint', 3), when: { pattern: ['stripes', ''] } }))),
    ...s(0.5).slice(-1).map((u) => poly(a, [[u, 0.2], [u + 0.05, 0.32], [u + 0.15, 0.33], [u + 0.07, 0.4], [u + 0.1, 0.52], [u, 0.45], [u - 0.1, 0.52], [u - 0.07, 0.4], [u - 0.15, 0.33], [u - 0.05, 0.32]], 'paint', 0, { when: { pattern: 'star' } })),
    ...s(0.35).flatMap((u) => [0.44, 0.5, 0.56].map((v) => ({ ...line(a, [[u, v], [u + Math.sign(u || 1) * 0.3, v + (v - 0.5) * 1.5]], 'paint', 1.2), when: { pattern: 'whiskers' } }))),
  ]) },
};

function partOf(spec: AccSpec, slot: string): PartData {
  const families: PartData['families'] = {};
  const exempt: Partial<Record<View, string>> = { ...(spec.exempt ?? {}) };
  for (const fam of FAMS) {
    const views: Record<string, ReturnType<Art['build']>> = {};
    for (const view of VIEWS) {
      if (spec.exempt?.[view]) continue;
      const a = new Art('a');
      const ill = fam === 'illustrated';
      spec.draw({ a, fam, view, ill, line: (s) => (ill ? { stroke: { c: `${s}.line`, w: 1.1 } } : {}) });
      // A view the item draws nothing in is a documented exemption, not missing art.
      if (!a.layers.length) exempt[view] = view === 'back' ? FACE_ONLY : 'Not visible in this view.';
      else views[view] = a.build();
    }
    families[fam] = { views, ...(Object.keys(exempt).length ? { exempt } : {}) };
  }
  const main = Object.keys(spec.colors)[0];
  return {
    slot,
    families,
    ...(main ? { colorSlot: main } : {}),
    colors: spec.colors,
    ...(spec.hides?.length ? { hides: spec.hides } : {}),
    ...(spec.options ? { options: spec.options } : {}),
  };
}

export const accessoryPart = (name: string) => partOf(ACCESSORIES[name]!, 'acc');
export const skinDetailPart = (name: string) => partOf(SKIN_DETAILS[name]!, 'skin-detail');
export const makeupPart = (name: string) => partOf(MAKEUP[name]!, 'makeup');

/** Props a character wears (H1 items used in looks): drawn on the rig like accessories. */
export const WORN_PROPS: Record<string, AccSpec> = {
  stethoscope: { colors: { tube: '#2E323A', metal: '#C9CED6' }, draw: ({ a, view }) => {
    const c = C[view];
    const back = view === 'back';
    a.layer('acc.neck', 'torso', [
      { path: a.smooth([[c - 0.36, -0.18], [c - 0.3, 0.2], [c - 0.12, 0.42]], false, 0.8), stroke: { c: 'tube', w: 2.6 } },
      { path: a.smooth([[c + 0.36, -0.18], [c + 0.32, 0.22], [c + 0.18, 0.5]], false, 0.8), stroke: { c: 'tube', w: 2.6 } },
      ...(back ? [] : [ell(a, c + 0.18, 0.56, 0.08, 0.08, 'metal'), ell(a, c - 0.12, 0.46, 0.04, 0.04, 'metal')]),
    ]);
  } },
};
export const wornPropPart = (name: string) => partOf(WORN_PROPS[name]!, 'acc');
