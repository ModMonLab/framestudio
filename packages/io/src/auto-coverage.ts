/**
 * Automatic coverage (FR-CAM-05): a shot list from the dialogue — a wide establishing shot, the speaker's
 * medium close-up for each line, a reaction cut to the listener during long lines, a two-shot for quick exchanges,
 * and the wide again at the end. Shots and their cameras are ordinary and editable; shots are marked `auto` so
 * regenerating replaces only them, and gaps between hand-placed shots are all it fills.
 */
import type { Command } from '@frame/schema';
import { TICKS_PER_SECOND, type ProjectState } from '@frame/core';
import { frameWithLibrary, type LibraryFrameOptions } from './recipes-apply.js';

const S = TICKS_PER_SECOND;

/** Framing presets used for coverage come from the content library's defaults (FR-ARC-06). */
export interface CoverageFramings { wide: string; single: string; two: string }

export function autoCoverageForLibrary(state: ProjectState, sceneId: string, o: LibraryFrameOptions & { framings: CoverageFramings }): Command[] {
  const scene = state.scenes[sceneId];
  if (!scene) return [];
  const shotTrack = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'shot');
  if (!shotTrack) return [];
  const { wide: wideRef, single: singleRef, two: twoRef } = o.framings;
  const cmds: Command[] = [];
  const shots = scene.clips.filter((c) => c.track === shotTrack.id);
  const auto = shots.filter((c) => c.source === 'auto').map((c) => c.id);
  if (auto.length) cmds.push({ name: 'clip.remove', params: { scene: sceneId, ids: auto } });
  const manual = shots.filter((c) => c.source !== 'auto' && c.enabled).sort((a, b) => a.start - b.start);

  const chars = scene.instances.filter((i) => i.kind === 'character');
  const dialogue = new Set(scene.tracks.filter((t) => t.kind === 'dialogue').map((t) => t.id));
  const lines = scene.clips.filter((c) => c.enabled && c.line && !c.line.muted && dialogue.has(c.track)).sort((a, b) => a.start - b.start);
  if (!lines.length) return cmds;

  // Cameras: reuse the ones made by an earlier run (by name), reframing them; otherwise add them.
  const camFor = new Map<string, string>();
  const camera = (key: string, name: string, ref: string, subjects: string[], at: number) => {
    if (camFor.has(key)) return camFor.get(key)!;
    const f = frameWithLibrary(state, sceneId, ref, subjects, at, o);
    if (!f) return undefined;
    const existing = scene.cameras.find((c) => c.name === name);
    const id = existing?.id ?? `cam_a${key.replace(/[^A-Za-z0-9]/g, '').slice(-20).padStart(7, '0')}`;
    if (existing) cmds.push({ name: 'camera.update', params: { scene: sceneId, id, set: { center: f.center, width: f.width, rotation: f.rotation, preset: ref, subjects } } });
    else cmds.push({ name: 'camera.add', params: { scene: sceneId, id, name, center: f.center, width: f.width, rotation: f.rotation, preset: ref, subjects } });
    camFor.set(key, id);
    return id;
  };
  const nameOf = (id: string) => scene.instances.find((i) => i.id === id)?.name ?? id;
  const wide = camera('wide', 'Wide (auto)', wideRef, chars.map((c) => c.id), lines[0]!.start);

  // Shot plan before fitting around hand-placed shots.
  const plan: { start: number; end: number; cam: string | undefined }[] = [];
  const push = (start: number, end: number, cam: string | undefined) => {
    if (end - start < 0.4 * S) return;
    const prev = plan[plan.length - 1];
    if (prev && prev.cam === cam && Math.abs(prev.end - start) < 2) prev.end = end;
    else plan.push({ start, end, cam });
  };
  const establishEnd = Math.max(2 * S, lines[0]!.start + 1 * S);
  push(0, Math.min(scene.duration, establishEnd), wide);
  lines.forEach((ln, i) => {
    const speaker = ln.line!.speaker;
    const next = lines[i + 1];
    const start = Math.max(establishEnd, ln.start - Math.round(0.2 * S));
    const end = Math.min(scene.duration, next ? Math.max(start + 1, next.start - Math.round(0.2 * S)) : ln.end + Math.round(0.6 * S));
    if (end <= start) return;
    const listener = chars.filter((c) => c.id !== speaker).sort((a, b) => Math.abs(a.transform.x - (scene.instances.find((x) => x.id === speaker)?.transform.x ?? 0)) - Math.abs(b.transform.x - (scene.instances.find((x) => x.id === speaker)?.transform.x ?? 0)))[0];
    // Quick exchanges read better as a two-shot than as fast cuts.
    const quick = next && next.start - ln.end < 0.3 * S && (ln.end - ln.start) < 1.8 * S;
    if (quick && listener) {
      push(start, end, camera(`two${speaker}${listener.id}`, `Two-shot ${nameOf(speaker)} & ${nameOf(listener.id)} (auto)`, twoRef, [speaker, listener.id], ln.start));
      return;
    }
    const single = camera(`one${speaker}`, `${nameOf(speaker)} (auto)`, singleRef, [speaker], ln.start);
    if (listener && ln.end - ln.start > 6 * S) {
      // A reaction cut in the middle of long lines.
      const mid = ln.start + Math.round((ln.end - ln.start) * 0.55);
      const reaction = camera(`one${listener.id}`, `${nameOf(listener.id)} (auto)`, singleRef, [listener.id], mid);
      push(start, mid, single);
      push(mid, Math.min(end, mid + Math.round(1.6 * S)), reaction);
      push(Math.min(end, mid + Math.round(1.6 * S)), end, single);
    } else push(start, end, single);
  });
  const lastEnd = plan[plan.length - 1]?.end ?? 0;
  if (scene.duration - lastEnd > 0.4 * S) push(lastEnd, scene.duration, wide);

  // Fit into the gaps between hand-placed shots.
  for (const p of plan) {
    let segs: [number, number][] = [[p.start, p.end]];
    for (const m of manual) segs = segs.flatMap(([a, b]) => (m.end <= a || m.start >= b ? [[a, b] as [number, number]] : [[a, m.start] as [number, number], [m.end, b] as [number, number]].filter(([x, y]) => y - x > 0.4 * S)));
    for (const [a, b] of segs) if (p.cam) cmds.push({ name: 'clip.add', params: { scene: sceneId, track: shotTrack.id, start: a, end: b, params: { camera: p.cam }, auto: true } });
  }
  return cmds;
}
