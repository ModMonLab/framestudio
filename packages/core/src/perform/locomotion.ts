/**
 * Locomotion and facing (FR-ACT-04, FR-ACT-05, FR-STG-04): where a character is and which way it faces at any time.
 * A locomotion clip (an action with `locomotion`) moves the character along `params.path` (stage points, optionally
 * curved) or to `params.mark`; the character turns to face its direction of travel and keeps the end position and
 * facing until its next movement. A turn clip (`params.turn`: left, right or an instance id) changes facing in place.
 * Everything is a pure function of the clips, so seeking anywhere gives the same answer (no drift).
 */
import type { Clip, Instance, Scene, View } from '@frame/schema';
import { TICKS_PER_SECOND } from '../time.js';
import type { ActionData, ActionLookup } from './data.js';

export interface Motion {
  x: number;
  y: number;
  flip: boolean;
  /** Distance travelled along the current path (stage px) while moving; drives the gait. */
  distance: number;
  moving: boolean;
  /** View to draw at t: the instance's view, turned by turn clips and walking (FR-CHR-04). */
  view?: View;
  /** Gait settings of the moving action. */
  gait?: { stride: number; lift: number };
}

type Pt = [number, number];

function catmull(pts: Pt[], steps = 16): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** A path as a dense polyline with cumulative lengths. */
export interface PathShape { pts: Pt[]; cum: number[]; length: number }

export function pathShape(points: Pt[], curved: boolean): PathShape {
  const pts = curved ? catmull(points) : points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  return { pts, cum, length: cum[cum.length - 1]! };
}

/** Point and horizontal direction at arc length s. */
export function pointAt(p: PathShape, s: number): { p: Pt; dx: number } {
  if (p.pts.length === 1 || p.length === 0) return { p: p.pts[0]!, dx: 0 };
  const d = Math.max(0, Math.min(p.length, s));
  let i = 1;
  while (i < p.cum.length - 1 && p.cum[i]! < d) i++;
  const a = p.pts[i - 1]!;
  const b = p.pts[i]!;
  const seg = p.cum[i]! - p.cum[i - 1]!;
  const u = seg > 0 ? (d - p.cum[i - 1]!) / seg : 0;
  return { p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], dx: b[0] - a[0] };
}

/** Distance covered after `t` seconds of a move lasting `dur` seconds: accelerate, cruise, decelerate. */
export function travelled(t: number, dur: number, length: number): number {
  if (dur <= 0) return length;
  const a = Math.min(dur * 0.25, 0.4);
  const v = length / (dur - a); // cruise speed so the area under the trapezoid equals the length
  const x = Math.max(0, Math.min(dur, t));
  if (x < a) return (v * x * x) / (2 * a);
  if (x <= dur - a) return v * a / 2 + v * (x - a);
  const r = dur - x;
  return length - (v * r * r) / (2 * a);
}

const S = TICKS_PER_SECOND;

/** Destination points of a locomotion clip, from its params (path points or a stage mark). */
function targetPoints(scene: Scene, c: Clip): Pt[] | undefined {
  // Waypoints from `path`, then the mark (if any) as the destination.
  const path = c.params.path as Pt[] | undefined;
  const mark = c.params.mark as string | undefined;
  const pts: Pt[] = Array.isArray(path) ? path.map((p) => [Number(p[0]), Number(p[1])] as Pt) : [];
  if (mark) {
    const m = scene.stage.marks.find((x) => x.id === mark || x.name === mark);
    if (m) pts.push([m.x, m.y]);
  }
  return pts.length ? pts : undefined;
}

export interface MotionClip { clip: Clip; action?: ActionData; shape?: PathShape; turn?: string }

/** Locomotion and turn clips of an instance in time order, with their resolved paths (positions chain clip to clip). */
export function motionClips(scene: Scene, inst: Instance, actionOf: ActionLookup): MotionClip[] {
  const tracks = new Set(scene.tracks.filter((tr) => tr.owner === inst.id && tr.kind === 'acting' && !tr.mute).map((tr) => tr.id));
  const list = scene.clips.filter((c) => c.enabled && tracks.has(c.track)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const out: MotionClip[] = [];
  let pos: Pt = [inst.transform.x, inst.transform.y];
  for (const c of list) {
    if (typeof c.params.turn === 'string' || (!c.asset && typeof c.params.view === 'string')) {
      out.push({ clip: c, turn: typeof c.params.turn === 'string' ? c.params.turn : '' });
      continue;
    }
    const a = c.asset ? actionOf(c.asset) : undefined;
    if (!a?.locomotion) continue;
    const pts = targetPoints(scene, c);
    if (!pts) continue;
    const shape = pathShape([pos, ...pts], !!c.params.curve);
    out.push({ clip: c, action: a, shape });
    pos = shape.pts[shape.pts.length - 1]!;
  }
  return out;
}

const VIEWS: View[] = ['front', 'three', 'side', 'back'];

/**
 * View during a turn from `a` to `b` at progress u (0…1): adjacent views in order, so a jump such as front → back
 * passes through three-quarter and side (FR-CHR-04).
 */
export function turnView(a: View, b: View, u: number): View {
  const i = VIEWS.indexOf(a);
  const j = VIEWS.indexOf(b);
  if (i === j || u >= 1) return b;
  if (u <= 0) return a;
  const step = j > i ? 1 : -1;
  const n = Math.abs(j - i);
  return VIEWS[i + step * Math.min(n, Math.floor(u * (n + 1)))]!;
}

/** Seconds a walk takes to turn into its walking view at the start, and back at the end. */
const WALK_TURN = 0.24;

/**
 * Position, facing and gait of an instance at time t. `others` resolves another instance's position at t so "turn
 * to face" and gaze can follow moving characters.
 */
export function motionAt(scene: Scene, inst: Instance, t: number, actionOf: ActionLookup, others?: (id: string) => Pt | undefined): Motion {
  let x = inst.transform.x;
  let y = inst.transform.y;
  let flip = inst.transform.flipX;
  let view: View = inst.character?.view ?? 'front';
  for (const m of motionClips(scene, inst, actionOf)) {
    const c = m.clip;
    if (t < c.start) break;
    if (m.turn !== undefined) {
      if (m.turn === 'left') flip = true;
      else if (m.turn === 'right') flip = false;
      else if (m.turn) {
        const o = others?.(m.turn) ?? (() => { const i = scene.instances.find((z) => z.id === m.turn); return i ? [i.transform.x, i.transform.y] as Pt : undefined; })();
        if (o && Math.abs(o[0] - x) > 1) flip = o[0] < x;
      }
      // A turn clip may also change the view, passing through the views in between over the clip.
      const to = c.params.view as View | undefined;
      if (to && VIEWS.includes(to)) {
        const from = view;
        view = t >= c.end ? to : turnView(from, to, (t - c.start) / Math.max(1, c.end - c.start));
        if (t < c.end) return { x, y, flip, distance: 0, moving: false, view };
      }
      continue;
    }
    const shape = m.shape!;
    const dur = (c.end - c.start) / S;
    const s = t >= c.end ? shape.length : travelled((t - c.start) / S, dur, shape.length);
    const at = pointAt(shape, s);
    x = at.p[0];
    y = at.p[1];
    if (Math.abs(at.dx) > 1e-6) flip = at.dx < 0;
    if (t < c.end) {
      const loco = m.action!.locomotion!;
      // Turn into the walking view at the start and back to the standing view at the end.
      const walkView = (c.params.view as View | undefined) ?? 'side';
      const turn = Math.min(WALK_TURN, dur / 4) * S;
      const v = t < c.start + turn ? turnView(view, walkView, (t - c.start) / turn) : t > c.end - turn ? turnView(walkView, view, (t - (c.end - turn)) / turn) : walkView;
      return { x, y, flip, distance: s, moving: true, view: v, gait: { stride: loco.stride, lift: (m.action as { locomotion: { lift?: number } }).locomotion.lift ?? 0.12 } };
    }
  }
  return { x, y, flip, distance: 0, moving: false, view };
}
