/**
 * Performance recipes (FR-RCP-01..04, Catalog G1): data that expands into ordinary, editable clips on the right
 * tracks — acting, face, gaze, camera, effects and sound — all sharing one recipe group id, so the result can be
 * moved as one, ungrouped, or edited clip by clip (P6). Roles (speaker, listener, object…) are assigned when the
 * recipe is applied. Steps are timed from the recipe start, or from an anchor line's words ("on the last word").
 * Pure: expansion returns commands; camera framing for shots is computed by the caller-supplied `frame` function.
 */
import type { Command, Scene } from '@frame/schema';
import type { ProjectState } from './state.js';
import { TICKS_PER_SECOND } from './time.js';
import { hash32 } from './ids.js';

export type RecipeTrack = 'acting' | 'face' | 'gaze' | 'shot' | 'camera-move' | 'sfx' | 'effect' | 'music';

/** A time inside the recipe: seconds from the start, a fraction of the anchor line, or a word of the anchor line. */
export type TimeRef = number | { line: 'start' | 'end'; offset?: number } | { frac: number; offset?: number } | { word: 'first' | 'last' | number; edge?: 'start' | 'end'; offset?: number };

export interface RecipeStep {
  /** Role whose track gets the clip; omit for scene tracks (shot, camera-move, sfx, effect, music). */
  role?: string;
  track: RecipeTrack;
  asset?: string;
  /** Clip parameters; strings like `$listener` are replaced by the instance assigned to that role. */
  params?: Record<string, unknown>;
  at: TimeRef;
  /** End time, or a duration in seconds. */
  end?: TimeRef;
  dur?: number;
  blendIn?: number;
  blendOut?: number;
  /** Shot steps: framing preset and the roles to frame. */
  shot?: { framing: string; subjects: string[] };
}

export interface RecipeRole { key: string; label: string; kind: 'character' | 'prop'; optional?: boolean }

export interface RecipeData {
  roles: RecipeRole[];
  /** When set, the recipe is anchored to a line spoken by this role (FR-RCP-03). */
  anchor?: { role: string };
  /** Length in seconds when not anchored to a line. */
  duration: number;
  steps: RecipeStep[];
}

export interface ApplyRecipeOptions {
  /** Role key → instance id. */
  roles: Record<string, string>;
  /** Start time in ticks (time-anchored recipes). */
  at?: number;
  /** The anchor line's clip id (line-anchored recipes). */
  line?: string;
  /** Asset lookup (step assets must exist; missing ones are skipped with a warning). */
  exists?: (ref: string) => boolean;
  /** Camera framing for shot steps: returns camera.add params (centre, width, rotation). */
  frame?: (framing: string, subjects: string[], at: number) => { center: { x: number; y: number }; width: number; rotation: number } | undefined;
  newGroupId?: () => string;
}

export interface ExpandedRecipe { commands: Command[]; warnings: string[]; group: string; start: number; end: number }

const S = TICKS_PER_SECOND;

/** Word timings of a line in seconds from the line's start: aligned words when a ready take has them, else estimated. */
export function lineWords(state: ProjectState, scene: Scene, lineId: string): { start: number; end: number }[] {
  const c = scene.clips.find((x) => x.id === lineId);
  if (!c?.line) return [];
  const take = c.line.take ? state.takes[c.line.take] : undefined;
  const words = take?.alignment?.words;
  if (words?.length) return words.map((w) => ({ start: w.start, end: w.end }));
  const tokens = c.line.text.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean);
  const dur = (c.end - c.start) / S;
  const per = dur / Math.max(1, tokens.length);
  return tokens.map((_w, i) => ({ start: i * per, end: (i + 1) * per - per * 0.1 }));
}

export function expandRecipe(state: ProjectState, sceneId: string, ref: string, data: RecipeData, o: ApplyRecipeOptions): ExpandedRecipe {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const warnings: string[] = [];
  for (const r of data.roles) {
    const id = o.roles[r.key];
    if (!id) {
      if (!r.optional) throw new Error(`Assign the ${r.label} role`);
      continue;
    }
    const inst = scene.instances.find((i) => i.id === id);
    if (!inst) throw new Error(`${r.label}: ${id} is not in the scene`);
    if (r.kind === 'character' && inst.kind !== 'character') throw new Error(`${r.label} must be a character`);
    if (r.kind === 'prop' && inst.kind !== 'prop') throw new Error(`${r.label} must be a prop`);
  }
  // Anchor: a line of the anchor role, or a start time.
  let base = o.at ?? 0;
  let lineDur = data.duration;
  let words: { start: number; end: number }[] = [];
  if (data.anchor) {
    const line = o.line ? scene.clips.find((c) => c.id === o.line && c.line) : undefined;
    if (!line) throw new Error('Choose the line this recipe goes with');
    if (line.line!.speaker !== o.roles[data.anchor.role]) throw new Error(`The line must be spoken by the ${data.roles.find((r) => r.key === data.anchor!.role)?.label ?? data.anchor.role}`);
    base = line.start;
    lineDur = (line.end - line.start) / S;
    words = lineWords(state, scene, line.id);
  }
  const time = (r: TimeRef): number => {
    if (typeof r === 'number') return base + r * S;
    if ('line' in r) return base + ((r.line === 'end' ? lineDur : 0) + (r.offset ?? 0)) * S;
    if ('frac' in r) return base + (r.frac * lineDur + (r.offset ?? 0)) * S;
    const i = r.word === 'first' ? 0 : r.word === 'last' ? words.length - 1 : Math.min(words.length - 1, r.word);
    const w = words[Math.max(0, i)];
    const t = w ? (r.edge === 'end' ? w.end : w.start) : 0;
    return base + (t + (r.offset ?? 0)) * S;
  };
  const group = o.newGroupId?.() ?? `grp_${(hash32(`${ref}:${base}:${JSON.stringify(o.roles)}`) >>> 0).toString(36).padStart(7, '0')}`;
  const sub = (v: unknown): unknown => {
    if (typeof v === 'string' && v.startsWith('$')) return o.roles[v.slice(1)] ?? v;
    if (Array.isArray(v)) return v.map(sub);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)]));
    return v;
  };
  const cmds: Command[] = [];
  let first = Infinity;
  let last = 0;
  data.steps.forEach((st, i) => {
    const owner = st.role ? o.roles[st.role] : 'scene';
    if (!owner) return; // optional role not assigned
    const track = scene.tracks.find((t) => t.owner === owner && t.kind === st.track);
    if (!track) {
      warnings.push(`Step ${i + 1}: no ${st.track} track for ${st.role ?? 'the scene'}`);
      return;
    }
    if (st.asset && o.exists && !o.exists(st.asset)) {
      warnings.push(`Step ${i + 1}: ${st.asset} is not in the library yet; skipped`);
      return;
    }
    const start = Math.max(0, Math.round(time(st.at)));
    const end = Math.min(scene.duration, Math.round(st.end !== undefined ? time(st.end) : start + (st.dur ?? 1) * S));
    if (end <= start) {
      warnings.push(`Step ${i + 1} falls outside the scene; skipped`);
      return;
    }
    const params = (sub(st.params ?? {}) as Record<string, unknown>);
    if (st.shot) {
      const subjects = st.shot.subjects.map((r) => o.roles[r]).filter((x): x is string => !!x);
      const f = o.frame?.(st.shot.framing, subjects, start);
      if (!f) {
        warnings.push(`Step ${i + 1}: could not frame ${st.shot.framing}`);
        return;
      }
      const cam = `cam_r${(hash32(`${group}:${i}`) >>> 0).toString(36).padStart(7, '0')}`;
      const name = `${st.shot.framing.split('.').pop()!.split('@')[0]!.replace(/-/g, ' ')} · ${subjects.map((id) => scene.instances.find((x) => x.id === id)?.name ?? id).join(' & ')}`;
      cmds.push({ name: 'camera.add', params: { scene: sceneId, id: cam, name, center: f.center, width: f.width, rotation: f.rotation, preset: st.shot.framing, subjects } });
      params.camera = cam;
    }
    cmds.push({ name: 'clip.add', params: { scene: sceneId, track: track.id, start, end, ...(st.asset ? { asset: st.asset } : {}), params, group, recipe: ref, ...(st.blendIn !== undefined ? { blendIn: Math.round(st.blendIn * S) } : {}), ...(st.blendOut !== undefined ? { blendOut: Math.round(st.blendOut * S) } : {}) } });
    first = Math.min(first, start);
    last = Math.max(last, end);
  });
  return { commands: cmds, warnings, group, start: first === Infinity ? base : first, end: last };
}

/**
 * Saves selected clips as a recipe (FR-RCP-04): each clip's owner becomes a role placeholder, times become offsets
 * from the earliest clip, and instance ids inside parameters become role references.
 */
export function recipeFromClips(state: ProjectState, sceneId: string, clipIds: string[]): RecipeData {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const clips = scene.clips.filter((c) => clipIds.includes(c.id) && !c.line);
  if (!clips.length) throw new Error('Select clips (not dialogue lines) to save as a recipe');
  const t0 = Math.min(...clips.map((c) => c.start));
  const roles: RecipeRole[] = [];
  const roleOf = new Map<string, string>();
  const role = (id: string) => {
    if (!roleOf.has(id)) {
      const inst = scene.instances.find((i) => i.id === id);
      const key = inst?.kind === 'prop' ? `object${roles.filter((r) => r.kind === 'prop').length + 1}` : `character${roles.filter((r) => r.kind === 'character').length + 1}`;
      roles.push({ key, label: inst ? `${inst.kind === 'prop' ? 'Object' : 'Character'} (was ${inst.name})` : key, kind: inst?.kind === 'prop' ? 'prop' : 'character' });
      roleOf.set(id, key);
    }
    return roleOf.get(id)!;
  };
  const ids = new Set(scene.instances.map((i) => i.id));
  const swap = (v: unknown): unknown => {
    if (typeof v === 'string' && ids.has(v)) return `$${role(v)}`;
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  const steps: RecipeStep[] = [];
  for (const c of clips.sort((a, b) => a.start - b.start)) {
    const tr = scene.tracks.find((t) => t.id === c.track)!;
    const kind = tr.kind as RecipeTrack;
    if (!['acting', 'face', 'gaze', 'camera-move', 'sfx', 'effect', 'music'].includes(kind)) continue;
    const r = tr.owner !== 'scene' ? role(tr.owner) : undefined;
    steps.push({ ...(r ? { role: r } : {}), track: kind, ...(c.asset ? { asset: c.asset } : {}), params: swap(c.params) as Record<string, unknown>, at: (c.start - t0) / S, dur: (c.end - c.start) / S, ...(c.blendIn ? { blendIn: c.blendIn / S } : {}), ...(c.blendOut ? { blendOut: c.blendOut / S } : {}) });
  }
  return { roles, duration: (Math.max(...clips.map((c) => c.end)) - t0) / S, steps };
}
