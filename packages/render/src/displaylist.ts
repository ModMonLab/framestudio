/**
 * Display list: the pure-data contract between scene evaluation and rasterisation (SRS §6 step 2).
 * The same list renders identically in the Studio preview, thumbnails, CLI renders and export (FR-RND-01, NFR-03).
 */

/** Affine matrix [a, b, c, d, e, f] as in SVG matrix(a b c d e f). */
export type Mat = [number, number, number, number, number, number];

export interface GradientStop {
  offset: number;
  color: string;
}

export type Paint =
  | { color: string }
  | { linear: { from: [number, number]; to: [number, number]; stops: GradientStop[] } }
  | { radial: { center: [number, number]; radius: number; stops: GradientStop[] } };

export interface Stroke {
  paint: Paint;
  width: number;
  join?: 'round' | 'miter' | 'bevel';
  cap?: 'round' | 'butt' | 'square';
}

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'color' | 'luminosity' | 'plus' | 'darken' | 'lighten';

interface Common {
  tf?: Mat;
  op?: number;
  blend?: BlendMode;
}

export interface PathItem extends Common {
  k: 'path';
  d: string;
  fill?: Paint;
  stroke?: Stroke;
  evenOdd?: boolean;
}

export interface RectItem extends Common {
  k: 'rect';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  fill?: Paint;
  stroke?: Stroke;
}

export interface EllipseItem extends Common {
  k: 'ellipse';
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill?: Paint;
  stroke?: Stroke;
}

export interface TextSpan {
  text: string;
  color?: string;
  weight?: number;
  scale?: number;
}

export interface TextItem extends Common {
  k: 'text';
  text: string;
  /** Anchor: x is left/center/right per align, y is the top of the text box. */
  x: number;
  y: number;
  size: number;
  family: string;
  weight?: number;
  italic?: boolean;
  color: string;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
  lineHeight?: number;
  outline?: { color: string; width: number };
  shadow?: { color: string; blur: number; dx: number; dy: number };
  spans?: TextSpan[];
  letterSpacing?: number;
  /** 'bottom': y is the bottom of the text box (captions stack upward from the safe area). */
  valign?: 'top' | 'bottom';
  /** Background box behind each laid-out line (boxed captions). */
  box?: { color: string; radius: number; padX: number; padY: number };
}

export interface ImageItem extends Common {
  k: 'image';
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 4×5 row-major colour matrix (for grades). */
export type ColorMatrix = number[];

export interface GroupItem extends Common {
  k: 'group';
  items: Item[];
  clip?: string;
  blur?: number;
  colorMatrix?: ColorMatrix;
  /** Debug/inspection label (instance id, part id). Not drawn. */
  id?: string;
}

export type Item = PathItem | RectItem | EllipseItem | TextItem | ImageItem | GroupItem;

export interface Frame {
  width: number;
  height: number;
  background: string;
  items: Item[];
}

/* ---------- matrix helpers (pure) ---------- */

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function translate(x: number, y: number): Mat {
  return [1, 0, 0, 1, x, y];
}

export function scale(sx: number, sy = sx): Mat {
  return [sx, 0, 0, sy, 0, 0];
}

export function rotate(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function compose(...ms: Mat[]): Mat {
  return ms.reduce((a, b) => mul(a, b), IDENTITY);
}

export function apply(m: Mat, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return IDENTITY;
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
