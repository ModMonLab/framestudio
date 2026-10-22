/**
 * Authoring helpers that emit part data in the part contract format (packages/rig/src/types.ts).
 * Generators written with this DSL are content-authoring tools (like drafting in the part editor);
 * runtime code only ever reads the emitted JSON (CAT-07, FR-ARC-06).
 */
import type { FillDef, FitSpace, LayerDef, LimbLayerDef, MPoint, Seg, ShapeDef, ViewArt, When } from '../../packages/rig/src/types.js';

export type D = Record<string, [number, number]>;
/** A point spec: [u, v] or [u, v, deltas]. */
export type PS = [number, number] | [number, number, D];

export class Art {
  points: Record<string, MPoint> = {};
  layers: LayerDef[] = [];
  anchors: NonNullable<ViewArt['anchors']> = {};
  private n = 0;

  constructor(private prefix = 'p') {}

  pt(spec: PS, name?: string): string {
    const id = name ?? `${this.prefix}${this.n++}`;
    const [u, v, d] = spec;
    const mp: MPoint = { p: [round(u), round(v)] };
    if (d && Object.keys(d).length) mp.d = Object.fromEntries(Object.entries(d).map(([k, x]) => [k, [round(x[0]), round(x[1])]]));
    this.points[id] = mp;
    return id;
  }

  /** Path from point specs: ['M', p], ['L', p], ['Q', c, p], ['C', c1, c2, p], ['Z']. */
  path(cmds: (['M', PS] | ['L', PS] | ['Q', PS, PS] | ['C', PS, PS, PS] | ['Z'])[]): Seg[] {
    return cmds.map((c) => {
      switch (c[0]) {
        case 'M': return ['M', this.pt(c[1])];
        case 'L': return ['L', this.pt(c[1])];
        case 'Q': return ['Q', this.pt(c[1]), this.pt(c[2])];
        case 'C': return ['C', this.pt(c[1]), this.pt(c[2]), this.pt(c[3])];
        default: return ['Z'];
      }
    }) as Seg[];
  }

  /** Smooth closed shape through points (Catmull-Rom → cubic Béziers). Deltas interpolate to control points. */
  smooth(pts: PS[], closed = true, tension = 1): Seg[] {
    const n = pts.length;
    const get = (i: number) => (closed ? pts[(i + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
    const cmds: (['M', PS] | ['C', PS, PS, PS] | ['Z'])[] = [['M', pts[0]!]];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);
      const k = tension / 6;
      cmds.push(['C', ctrl(p1, p0, p2, k, 1), ctrl(p2, p3, p1, k, -1), p2]);
    }
    if (closed) cmds.push(['Z']);
    return this.path(cmds);
  }

  layer(slot: string, space: FitSpace, shapes: ShapeDef[], extra: Partial<LayerDef> = {}): this {
    this.layers.push({ slot, space, shapes, ...extra });
    return this;
  }

  limb(slot: string, limb: LimbLayerDef, when?: When): this {
    this.layers.push({ slot, limb: { ...limb, ...(when ? { when } : {}) } });
    return this;
  }

  anchor(name: string, space: FitSpace, at: [number, number], scale?: { sx?: number; sy?: number }): this {
    (this.anchors as Record<string, unknown>)[name] = { space, at: [round(at[0]), round(at[1])], ...(scale ?? {}) };
    return this;
  }

  build(): ViewArt {
    return { points: this.points, layers: this.layers, ...(Object.keys(this.anchors).length ? { anchors: this.anchors } : {}) };
  }
}

function ctrl(p: PS, a: PS, b: PS, k: number, dir: number): PS {
  const u = p[0] + dir * (b[0] - a[0]) * k;
  const v = p[1] + dir * (b[1] - a[1]) * k;
  const dp = (p[2] ?? {}) as D;
  const da = (a[2] ?? {}) as D;
  const db = (b[2] ?? {}) as D;
  const keys = new Set([...Object.keys(dp), ...Object.keys(da), ...Object.keys(db)]);
  const d: D = {};
  for (const key of keys) {
    const x = dp[key] ?? [0, 0];
    const y = da[key] ?? [0, 0];
    const z = db[key] ?? [0, 0];
    d[key] = [x[0] + dir * (z[0] - y[0]) * k, x[1] + dir * (z[1] - y[1]) * k];
  }
  return keys.size ? [u, v, d] : [u, v];
}

export function round(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/** Mirror a point spec horizontally (u → −u), including deltas. */
export function mx(p: PS): PS {
  const d = p[2] as D | undefined;
  return d ? [-p[0], p[1], Object.fromEntries(Object.entries(d).map(([k, v]) => [k, [-v[0], v[1]]]))] : [-p[0], p[1]];
}

export function addD(p: PS, d: D): PS {
  const cur = (p[2] ?? {}) as D;
  const out: D = { ...cur };
  for (const [k, v] of Object.entries(d)) out[k] = [(cur[k]?.[0] ?? 0) + v[0], (cur[k]?.[1] ?? 0) + v[1]];
  return [p[0], p[1], out];
}

export const lin = (from: string, to: string, stops: [number, string][]): FillDef => ({ lin: { from, to, stops } });

export type { ShapeDef, FillDef };
