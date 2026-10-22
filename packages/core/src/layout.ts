/**
 * Placement helpers (FR-STG-03): smart-guide snapping and align/distribute. Pure geometry on boxes in one coordinate
 * space (the canvas uses screen pixels while dragging and stage units for commands).
 */
import type { Command, Scene } from '@frame/schema';
import type { Box } from './camera-framing.js';
export interface Guide { axis: 'x' | 'y'; at: number; kind: 'object' | 'centre' | 'ground' | 'mark' }

/**
 * Snaps a moving box: its left/centre/right edges to target x lines and its top/middle/bottom to y lines, within
 * `threshold`. Returns the adjusted delta and the guides that matched (for drawing).
 */
export function snapDelta(moving: Box, dx: number, dy: number, targets: { x: { at: number; kind: Guide['kind'] }[]; y: { at: number; kind: Guide['kind'] }[] }, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const best = (edges: number[], lines: { at: number; kind: Guide['kind'] }[]) => {
    let pick: { d: number; at: number; kind: Guide['kind'] } | undefined;
    for (const e of edges) for (const l of lines) {
      const d = l.at - e;
      if (Math.abs(d) <= threshold && (!pick || Math.abs(d) < Math.abs(pick.d))) pick = { d, at: l.at, kind: l.kind };
    }
    return pick;
  };
  const x0 = moving.x + dx, y0 = moving.y + dy;
  const sx = best([x0, x0 + moving.w / 2, x0 + moving.w], targets.x);
  const sy = best([y0, y0 + moving.h / 2, y0 + moving.h], targets.y);
  if (sx) guides.push({ axis: 'x', at: sx.at, kind: sx.kind });
  if (sy) guides.push({ axis: 'y', at: sy.at, kind: sy.kind });
  return { dx: dx + (sx?.d ?? 0), dy: dy + (sy?.d ?? 0), guides };
}

/** Snap lines from other objects' edges and centres. */
export function boxLines(boxes: Box[]): { x: { at: number; kind: 'object' }[]; y: { at: number; kind: 'object' }[] } {
  return {
    x: boxes.flatMap((b) => [b.x, b.x + b.w / 2, b.x + b.w].map((at) => ({ at, kind: 'object' as const }))),
    y: boxes.flatMap((b) => [b.y, b.y + b.h / 2, b.y + b.h].map((at) => ({ at, kind: 'object' as const }))),
  };
}

export type AlignMode = 'left' | 'centre' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-h' | 'distribute-v';

/** Moves for aligning or distributing boxes (stage units); one command per object that moves. */
export function alignCommands(scene: Scene, items: { id: string; box: Box }[], mode: AlignMode): Command[] {
  if (items.length < 2 || (mode.startsWith('distribute') && items.length < 3)) return [];
  const moves = new Map<string, [number, number]>();
  const xs = items.map((i) => i.box);
  const minX = Math.min(...xs.map((b) => b.x)), maxX = Math.max(...xs.map((b) => b.x + b.w));
  const minY = Math.min(...xs.map((b) => b.y)), maxY = Math.max(...xs.map((b) => b.y + b.h));
  for (const it of items) {
    const b = it.box;
    if (mode === 'left') moves.set(it.id, [minX - b.x, 0]);
    if (mode === 'right') moves.set(it.id, [maxX - (b.x + b.w), 0]);
    if (mode === 'centre') moves.set(it.id, [(minX + maxX) / 2 - (b.x + b.w / 2), 0]);
    if (mode === 'top') moves.set(it.id, [0, minY - b.y]);
    if (mode === 'bottom') moves.set(it.id, [0, maxY - (b.y + b.h)]);
    if (mode === 'middle') moves.set(it.id, [0, (minY + maxY) / 2 - (b.y + b.h / 2)]);
  }
  if (mode === 'distribute-h' || mode === 'distribute-v') {
    const h = mode === 'distribute-h';
    const sorted = [...items].sort((a, b) => (h ? a.box.x + a.box.w / 2 - (b.box.x + b.box.w / 2) : a.box.y + a.box.h / 2 - (b.box.y + b.box.h / 2)));
    const c = (b: Box) => (h ? b.x + b.w / 2 : b.y + b.h / 2);
    const first = c(sorted[0]!.box), last = c(sorted[sorted.length - 1]!.box);
    sorted.forEach((it, i) => {
      const target = first + ((last - first) * i) / (sorted.length - 1);
      moves.set(it.id, h ? [target - c(it.box), 0] : [0, target - c(it.box)]);
    });
  }
  const out: Command[] = [];
  for (const [id, [dx, dy]] of moves) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    const inst = scene.instances.find((i) => i.id === id);
    if (!inst || inst.locked) continue;
    out.push({ name: 'instance.update', params: { scene: scene.id, id, set: { transform: { ...inst.transform, x: Math.round(inst.transform.x + dx), y: Math.round(inst.transform.y + dy) } } } });
  }
  return out;
}
