/**
 * The part contract (frozen at the end of M1; see docs/rig/part-contract.md).
 *
 * A part is pure data: per style family and per view it has named control points (base position plus linear
 * morph deltas per parameter) and layers of shapes. Points are expressed in a normalised *fit space*
 * (head, face, torso, pelvis, neck, hand, foot) so the same part fits every body and head shape; limbs are drawn
 * with the limb primitive so they bend cleanly in any pose (SRS §2.3 deformation).
 */
import type { StyleFamily, View } from '@frame/schema';

/** Palette slot (`skin`, `skin.shade`, `hair.light`, `garment`, `garment.shade`, `line`, `eye`, `lip`, …) or a literal #hex. */
export type ColorRef = string;

/** Control point: base [u, v] plus morph deltas per parameter (delta applied per unit of parameter offset). */
export interface MPoint {
  p: [number, number];
  d?: Record<string, [number, number]>;
}

export type Seg = ['M', string] | ['L', string] | ['Q', string, string] | ['C', string, string, string] | ['Z'];

export type FillDef =
  | ColorRef
  | { lin: { from: string; to: string; stops: [number, ColorRef][] } }
  | { rad: { c: string; r: number; stops: [number, ColorRef][] } };

/** Conditions on render state: `{ mouth: 'A' }`, `{ eyeClosed: 'true' }`, `{ option.hood: 'up' }`. */
export type When = Record<string, string | string[]>;

/**
 * Placed artwork (imported drawings, FR-IMP-03; additive contract change, decision 0019): a raster image or vector
 * paths whose source rectangle is drawn into a box of the layer's fit space, following the space as it moves.
 */
export interface PlacedArt {
  /** Target box in fit-space units [u0, v0, u1, v1]. */
  box: [number, number, number, number];
  /** Source rectangle in artwork units [x, y, w, h]. */
  src: [number, number, number, number];
  /** Raster artwork: content-addressed media hash (sha256-…), the image covers `src`. */
  image?: string;
  /** Vector artwork in artwork units. */
  paths?: { d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; evenOdd?: boolean; tf?: [number, number, number, number, number, number] }[];
}

export interface ShapeDef {
  id?: string;
  /** Imported artwork placed in the fit space (instead of a path or ellipse). */
  art?: PlacedArt;
  path?: Seg[];
  ellipse?: { c: string; rx: number; ry: number; drx?: Record<string, number>; dry?: Record<string, number> };
  fill?: FillDef;
  stroke?: { c: ColorRef; w: number; cap?: 'round' | 'butt' };
  opacity?: number;
  /** Clip to another shape of the same layer (e.g. iris inside the eye white). */
  clip?: string;
  /** Opacity multiplied by a parameter value (overlays such as blush intensity). */
  opacityParam?: string;
  when?: When;
  blend?: 'multiply' | 'screen' | 'overlay' | 'soft-light';
  evenOdd?: boolean;
}

export type FitSpace =
  | 'head' | 'face' | 'torso' | 'pelvis' | 'neck'
  | 'handL' | 'handR' | 'hand' | 'footL' | 'footR' | 'foot'
  | 'eye' | 'eyeL' | 'eyeR' | 'brow' | 'browL' | 'browR' | 'mouth' | 'nose' | 'ear' | 'earL' | 'earR' | 'stage'
  /** Limb segments (additive, decision 0019): origin at the proximal joint, v 0→1 to the distal joint, u across in limb half-widths. */
  | 'upperArmL' | 'upperArmR' | 'foreArmL' | 'foreArmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR'
  /** Seat frame (FR-CHR-11): origin at the pelvis, units of leg length (thigh + shin), u toward the character's screen facing, v down. */
  | 'seat';

export type Limb = 'armL' | 'armR' | 'legL' | 'legR' | 'neck';

/** Limb layer: a tapered stroke along a limb chain from `from` to `to` (0 = root, 0.5 = elbow/knee, 1 = wrist/ankle). */
export interface LimbLayerDef {
  limb: Limb | 'arms' | 'legs';
  from: number;
  to: number;
  /** Width multiplier relative to the body's limb width (garments > 1). */
  width: number;
  /** Extra width at the end (flares, wide sleeves). */
  flare?: number;
  fill: ColorRef;
  /** Illustrated shading along the far edge. */
  shade?: ColorRef;
  outline?: ColorRef;
  cap?: 'round' | 'butt';
  when?: When;
}

export interface LayerDef {
  /** Layering slot (FR-CHR-07). Near/far slots are resolved per pose. */
  slot: string;
  space?: FitSpace;
  shapes?: ShapeDef[];
  limb?: LimbLayerDef;
  when?: When;
  /** For hands/feet/eyes/brows/ears: which side(s) the layer is instanced for. */
  sides?: ('L' | 'R')[];
}

export interface ViewArt {
  points: Record<string, MPoint>;
  layers: LayerDef[];
  /** Anchors in the art's fit space (accessory and prop attachment, FR-CHR-06). */
  anchors?: Record<string, { space: FitSpace; at: [number, number] }>;
}

export interface FamilyArt {
  views: Partial<Record<View, ViewArt>>;
  /** Documented view exemptions (Catalog §0 rule 2). */
  exempt?: Partial<Record<View, string>>;
}

export interface PartParam {
  key: string;
  label: string;
  type: 'number' | 'enum' | 'color' | 'boolean';
  default: number | string | boolean;
  range?: [number, number];
  options?: string[];
  endLabels?: [string, string];
}

/** Category-specific data of a part asset (manifest `data`). */
export interface PartData {
  /** Rig category this part fills (head, eyes, brows, nose, mouth, ears, hair, fringe, facial-hair, top, outer, bottom, dress, shoe, acc, hand-set, body, skin-detail, makeup, overlay…). */
  slot: string;
  families: Partial<Record<StyleFamily, FamilyArt>>;
  /** Asymmetric details: 'mirror' flips with the character; 'keep' keeps screen orientation (e.g. a parting) (FR-CHR-03). */
  mirror?: 'mirror' | 'keep';
  params?: PartParam[];
  /** Garment/hair option states exposed to the builder (sleeves rolled, hood up). */
  options?: Record<string, string[]>;
  /** Palette slot the part's `garment` colours map to (top, bottom, outer, shoe, acc…). */
  colorSlot?: string;
  /** Default colours for this part's palette slots. */
  colors?: Record<string, string>;
  /** Parts this part hides (a hat hides `hair.top`; a dress replaces top and bottom). */
  hides?: string[];
  /** Pattern support (Catalog B6). */
  patternable?: boolean;
  /** Props: sound cues (FR-SND-04) by action event name (`contact`) or state (`state:open`) → sound asset ref. */
  sounds?: Record<string, string>;
  /** Rig variant carried by identity options (FR-CHR-11). */
  variant?: RigVariant;
}

/** Data-driven rig variant (FR-CHR-11): the engine reads these fields, never an option's name. */
export interface RigVariant {
  /** Posture the character keeps (a wheelchair user is seated; posture-changing actions do not stand them up). */
  posture?: 'seated';
  /** Locomotion rolls instead of walking: no leg cycle; `wheel.cos`/`wheel.sin` turn with distance (radius in leg lengths). */
  rolling?: { radius: number };
  /** Limbs that end early (0 = at the root, 0.5 = elbow/knee); hands/feet on those sides are not drawn. */
  truncate?: Partial<Record<'armL' | 'armR' | 'legL' | 'legR', number>>;
  /** Prosthetics: the natural limb's skin ends here and the variant's own part draws the rest; garments, hands and feet stay. */
  replace?: Partial<Record<'armL' | 'armR' | 'legL' | 'legR', number>>;
  /** Body slider overrides (0–100), e.g. belly for a visible pregnancy. */
  body?: Record<string, number>;
  /** Palette overrides that win over the character's own colours (e.g. an albinism palette). */
  palette?: Record<string, string>;
}

export const MOUTH_SHAPES = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type MouthLetter = (typeof MOUTH_SHAPES)[number];
