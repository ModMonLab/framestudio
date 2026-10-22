/**
 * Camera framing (FR-CAM-01/06): framing presets (Catalog M1: wide, full, medium, close-up …) computed from the
 * selected subjects' boxes on the stage at a time. A preset gives the view height as a multiple of the subject's
 * height and how much headroom to keep; several subjects are framed together (two-shot, three-shot).
 */
import type { StyleFamily } from '@frame/schema';
import type { FamilyStyle } from '@frame/rig';
import type { ProjectState } from './state.js';
import { evaluateFrame } from './perform/evaluate.js';
import type { AssetResolver } from './perform/character.js';

export interface FramingData {
  /** View height as a multiple of the tallest subject's height (close-up ≈ 0.3, full ≈ 1.25). */
  size: number;
  /** Space above the top of the subjects as a fraction of the view height. */
  headroom: number;
  /** Optional camera roll in degrees (dutch tilt) and vertical bias (low/high angle) as a fraction of the view. */
  roll?: number;
  bias?: number;
  /** Frames the whole stage regardless of subjects (extreme wide). */
  stage?: boolean;
}

export interface Box { x: number; y: number; w: number; h: number }

/** Stage-space boxes of instances at time t (characters as drawn, including pose and position). */
export function subjectBoxes(state: ProjectState, sceneId: string, ids: string[], t: number, o: { assets: AssetResolver; styles: Record<StyleFamily, FamilyStyle> }): Record<string, Box> {
  const out = state.project.output;
  const ev = evaluateFrame(state, sceneId, t, { assets: o.assets, styles: o.styles, width: out.width, height: out.height });
  const [a, b, c, d, e, f] = ev.view;
  const det = a * d - b * c;
  const inv = (x: number, y: number): [number, number] => [(d * (x - e) - c * (y - f)) / det, (-b * (x - e) + a * (y - f)) / det];
  const boxes: Record<string, Box> = {};
  for (const id of ids) {
    const s = ev.boxes[id];
    if (!s) continue;
    const p0 = inv(s.x, s.y);
    const p1 = inv(s.x + s.w, s.y + s.h);
    boxes[id] = { x: Math.min(p0[0], p1[0]), y: Math.min(p0[1], p1[1]), w: Math.abs(p1[0] - p0[0]), h: Math.abs(p1[1] - p0[1]) };
  }
  return boxes;
}

/** Camera centre, width and roll for a framing of the given subject boxes (stage units). */
export function frameBoxes(boxes: Box[], framing: FramingData, aspect: number, stage: { width: number; height: number }): { center: { x: number; y: number }; width: number; rotation: number } {
  if (framing.stage || !boxes.length) return { center: { x: stage.width / 2, y: stage.height / 2 }, width: stage.width, rotation: framing.roll ?? 0 };
  const x0 = Math.min(...boxes.map((b) => b.x));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const top = Math.min(...boxes.map((b) => b.y));
  const H = Math.max(...boxes.map((b) => b.h));
  let V = framing.size * H;
  // Several subjects: wide enough for all of them with margins.
  V = Math.max(V, ((x1 - x0) * 1.25) / aspect);
  const viewTop = top - framing.headroom * V;
  const cy = viewTop + V / 2 + (framing.bias ?? 0) * V;
  return { center: { x: Math.round((x0 + x1) / 2), y: Math.round(cy) }, width: Math.round(V * aspect), rotation: framing.roll ?? 0 };
}
