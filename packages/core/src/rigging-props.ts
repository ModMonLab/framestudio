/**
 * Rigging assistant for props and sets (FR-IMP-03): layered artwork becomes a prop with states (layers named
 * `state_on`, `state_off` … or grouped under such a folder, drawn only in that state) or a location kit whose layers
 * are set pieces on depth planes (sky and distant layers far back, floors on the ground, foreground in front). Every
 * layer becomes placed artwork, so the drawing is used as drawn. Pure: the caller stores media and manifests.
 */
import type { AssetManifest } from '@frame/schema';
import type { LayerDef, PartData, PlacedArt, ShapeDef } from '@frame/rig';
import type { RigLayer, RigProblem } from './rigging.js';

/** Prop layer targets: drawn in every state, only in one state (`state:<name>`), or not used. */
export type PropTarget = 'always' | 'ignore' | `state:${string}`;
/** Set layer targets: a depth plane or not used. */
export const SET_PLANES = ['far', 'back', 'ground', 'mid', 'front'] as const;
export type SetTarget = (typeof SET_PLANES)[number] | 'ignore';
export const SET_PLANE_LABELS: Record<SetTarget, string> = { far: 'Far (sky, distance)', back: 'Back (walls, backdrop)', ground: 'Ground (floor)', mid: 'Mid (furniture)', front: 'Front (foreground)', ignore: 'Not used' };

type Box = [number, number, number, number];
const union = (bs: Box[]): Box | undefined => {
  if (!bs.length) return undefined;
  const x0 = Math.min(...bs.map((b) => b[0]));
  const y0 = Math.min(...bs.map((b) => b[1]));
  const x1 = Math.max(...bs.map((b) => b[0] + b[2]));
  const y1 = Math.max(...bs.map((b) => b[1] + b[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};
const round = (n: number) => Math.round(n * 100) / 100;
const IGNORE = /^(background|bg|guide|guides|reference|ref|sketch)$/i;
const STATE = /(?:^|[\s_/-])state[\s_:-]+([a-z0-9][a-z0-9_-]*)$/i;
const BARE_STATE = /^(on|off|open|closed|lit|unlit|full|empty|up|down)$/i;

/** Suggested prop target from a layer name and group (`state_on`, `State: off`, a `state_open` folder). */
export function suggestPropTarget(l: { name: string; group?: string }): PropTarget {
  const name = l.name.trim();
  if (IGNORE.test(name)) return 'ignore';
  const m = name.match(STATE) ?? (l.group ?? '').split('/').reverse().map((g) => g.trim().match(STATE)).find(Boolean);
  if (m) return `state:${m[1]!.toLowerCase()}`;
  if (BARE_STATE.test(name)) return `state:${name.toLowerCase()}`;
  return 'always';
}

/** Suggested depth plane for a set layer. */
export function suggestPlane(l: { name: string; group?: string }): SetTarget {
  const n = `${l.group ?? ''} ${l.name}`.toLowerCase();
  if (IGNORE.test(l.name.trim()) || /guide|reference|sketch/.test(n)) return 'ignore';
  if (/sky|cloud|distant|horizon|mountain|far|skyline/.test(n)) return 'far';
  if (/foreground|front|overlay|frame/.test(n)) return 'front';
  if (/floor|ground|road|grass|rug|carpet|pavement|street/.test(n)) return 'ground';
  if (/table|desk|sofa|couch|chair|counter|shelf|bed|furniture|mid/.test(n)) return 'mid';
  return 'back';
}

interface Common {
  name: string;
  layers: (RigLayer & { group?: string })[];
  newId: () => string;
  author: string;
  date: string;
  sourceFile: string;
  rights: string;
}

export interface PropRequest extends Common {
  /** layer id → target (missing ids use the suggestion). */
  mapping: Record<string, string>;
  /** Height of the prop on stage in output pixels; defaults to the artwork's own height. */
  height?: number;
  /** Default state; defaults to the first state found. */
  defaultState?: string;
}

export interface PropResult {
  asset: AssetManifest;
  states: string[];
  problems: RigProblem[];
  mapping: Record<string, PropTarget>;
}

const licence = { id: 'LicenseRef-User-Owned', redistributable: true, commercialUse: true };
const provenance = (r: Common) => ({ method: 'imported' as const, author: r.author, date: r.date, sourceFile: r.sourceFile, rightsStatement: r.rights, notes: 'Rigged with the rigging assistant.' });
const exempt = { three: 'Props are drawn from the camera.', side: 'Props are drawn from the camera.', back: 'Props are drawn from the camera.' };
const placed = (l: RigLayer, box: Box): PlacedArt => ({ box, src: l.bounds, ...(l.media ? { image: l.media } : {}), ...(l.paths ? { paths: l.paths } : {}) });
const partData = (shapes: ShapeDef[], slot: string): PartData => {
  const layers: LayerDef[] = [{ slot, shapes }];
  const fam = { views: { front: { points: {}, layers } }, exempt };
  return { slot, families: { flat: fam, illustrated: fam } };
};

/**
 * Builds a prop from mapped artwork: origin at the bottom centre of the drawing (props stand on the floor), one
 * placed-art shape per layer in drawing order, state layers shown only in their state, and a `state` parameter
 * listing the states so scenes and acting clips can switch them (open/closed, on/off).
 */
export function rigProp(req: PropRequest): PropResult {
  const problems: RigProblem[] = [];
  const mapping: Record<string, PropTarget> = {};
  for (const l of req.layers) {
    const t = req.mapping[l.id] ?? suggestPropTarget(l);
    mapping[l.id] = t === 'always' || t === 'ignore' || /^state:[a-z0-9][a-z0-9_-]*$/i.test(t) ? (t as PropTarget) : 'always';
  }
  const used = req.layers.filter((l) => mapping[l.id] !== 'ignore' && (l.view ?? 'front') === 'front');
  if (req.layers.some((l) => l.view && l.view !== 'front')) problems.push({ severity: 'warning', message: 'Props are drawn from the camera; only the front view is used' });
  const states = [...new Set(used.map((l) => mapping[l.id]!).filter((t) => t.startsWith('state:')).map((t) => t.slice(6).toLowerCase()))];
  if (states.length === 1) problems.push({ severity: 'warning', message: `Only one state (${states[0]}) is drawn; add layers for the other states (for example state_off) or map the layer to "Every state"` });
  const all = union(used.map((l) => l.bounds));
  if (!all) problems.push({ severity: 'error', message: 'No layers are used: map at least one layer' });
  const def = req.defaultState && states.includes(req.defaultState) ? req.defaultState : states[0];
  const [x0, y0, w, h] = all ?? [0, 0, 1, 1];
  const k = req.height && req.height > 0 && h > 0 ? req.height / h : 1;
  const cx = x0 + w / 2;
  const by = y0 + h;
  const shapes: ShapeDef[] = used.map((l) => {
    const [x, y, lw, lh] = l.bounds;
    const shape: ShapeDef = { art: placed(l, [round((x - cx) * k), round((y - by) * k), round((x + lw - cx) * k), round((y + lh - by) * k)]) };
    const t = mapping[l.id]!;
    if (t.startsWith('state:')) {
      const s = t.slice(6).toLowerCase();
      // Instances with no state set draw the default state ('default' is the evaluator's unset value).
      shape.when = { state: s === def ? [s, 'default'] : [s] };
    }
    return shape;
  });
  const asset = {
    schemaVersion: 1, id: `user.${req.newId()}`, version: 1, kind: 'prop', name: req.name, category: 'Props', group: 'Imported props',
    tags: ['props', 'imported'], synonyms: states, families: ['flat', 'illustrated'], views: ['front'], viewExemptions: exempt,
    anchors: { bounds: [round(-w / 2 * k), round(-h * k), round(w * k), round(h * k)] }, capabilities: [],
    parameters: states.length ? [{ key: 'state', label: 'State', type: 'enum', options: states, default: def }] : [],
    dependencies: [], layering: {}, previews: {}, license: licence, provenance: provenance(req), data: partData(shapes, 'prop'),
  } as unknown as AssetManifest;
  return { asset, states, problems, mapping };
}

export interface SetRequest extends Common {
  mapping: Record<string, string>;
  /** Artwork size; the drawing is scaled to fill the output width. */
  width: number;
  height: number;
  output: { width: number; height: number };
}

export interface SetPiece { key: string; name: string; plane: SetTarget; at: [number, number] }
export interface SetResult {
  asset: AssetManifest;
  pieces: SetPiece[];
  problems: RigProblem[];
  mapping: Record<string, SetTarget>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'piece';

/**
 * Builds a location kit from mapped artwork: the drawing is scaled to the output width, and each used layer becomes
 * a set piece on its depth plane, anchored at the bottom centre of its own bounds so pieces can be moved on stage.
 */
export function rigSet(req: SetRequest): SetResult {
  const problems: RigProblem[] = [];
  const mapping: Record<string, SetTarget> = {};
  for (const l of req.layers) {
    const t = (req.mapping[l.id] ?? suggestPlane(l)) as SetTarget;
    mapping[l.id] = (SET_PLANES as readonly string[]).includes(t) || t === 'ignore' ? t : 'back';
  }
  const used = req.layers.filter((l) => mapping[l.id] !== 'ignore' && (l.view ?? 'front') === 'front');
  if (!used.length) problems.push({ severity: 'error', message: 'No layers are used: map at least one layer to a depth plane' });
  if (!(req.width > 0 && req.height > 0)) problems.push({ severity: 'error', message: 'The artwork has no size' });
  const k = req.width > 0 ? req.output.width / req.width : 1;
  const yOff = req.output.height - req.height * k; // bottom-aligned when the aspect ratios differ
  if (Math.abs(req.height * k - req.output.height) > 2) problems.push({ severity: 'warning', message: `The artwork is ${req.width}×${req.height}; it is scaled to the output width and aligned to the bottom of the frame` });
  const parts: Record<string, unknown> = {};
  const pieces: SetPiece[] = [];
  used.forEach((l, i) => {
    const [x, y, w, h] = l.bounds;
    const at: [number, number] = [round((x + w / 2) * k), round((y + h) * k + yOff)];
    let key = slug(l.name);
    while (parts[key]) key = `${key}-${i}`;
    const bounds: Box = [round(-w / 2 * k), round(-h * k), round(w * k), round(h * k)];
    const art = partData([{ art: placed(l, [bounds[0], bounds[1], bounds[0] + bounds[2], 0]) }], 'set');
    parts[key] = { name: l.name, art, at, bounds, plane: mapping[l.id], order: i };
    pieces.push({ key, name: l.name, plane: mapping[l.id]!, at });
  });
  const asset = {
    schemaVersion: 1, id: `user.${req.newId()}`, version: 1, kind: 'kit', name: req.name, category: 'Location kits', group: 'Imported sets',
    tags: ['location kits', 'imported'], synonyms: [], families: ['flat', 'illustrated'], views: ['front'], viewExemptions: {}, anchors: {},
    capabilities: [], parameters: [], dependencies: [], layering: {}, previews: {}, license: licence, provenance: provenance(req),
    data: { kit: { parts, marks: [], props: [] } },
  } as unknown as AssetManifest;
  return { asset, pieces, problems, mapping };
}
