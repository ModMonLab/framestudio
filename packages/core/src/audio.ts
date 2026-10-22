/**
 * Audio scheduling (SRS §6 step 6, FR-SND-01..03, FR-DLG-05). Pure: the Studio (Web Audio) and the offline mixer
 * (Node) both play this plan with the same gain automation, so preview and export mixes match.
 */
import type { Clip, Scene, Track } from '@frame/schema';
import type { ProjectState } from './state.js';
import { TICKS_PER_SECOND } from './time.js';
import { lineTakeState } from './validate.js';

export type Bus = 'dialogue' | 'music' | 'ambience' | 'sfx';

export type AudioSource = { kind: 'media'; hash: string; ext?: string } | { kind: 'asset'; ref: string };

export interface AudioEvent {
  id: string;
  bus: Bus;
  source: AudioSource;
  /** Seconds from the start of the plan. */
  start: number;
  /** Seconds into the source. */
  offset: number;
  duration: number;
  gainDb: number;
  /** −1 (left) … 1 (right). */
  pan: number;
  fadeIn: number;
  fadeOut: number;
  curve: 'linear' | 'equal-power';
  loop: boolean;
  /** Ducks under dialogue (music and ambience by default). */
  ducks: boolean;
  /** Fixture audio is never real speech (P7, NFR-18); reported in render reports. */
  fixture?: boolean;
}

export interface DuckSettings {
  db: number;
  attack: number;
  release: number;
}

export interface AudioPlan {
  duration: number;
  events: AudioEvent[];
  duck: DuckSettings;
  /** Merged dialogue activity spans in seconds (drive ducking). */
  speech: [number, number][];
  warnings: string[];
}

const BUS: Partial<Record<Track['kind'], Bus>> = { dialogue: 'dialogue', music: 'music', ambience: 'ambience', sfx: 'sfx' };

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Sound data of a library sound asset (Catalog N): its media and whether it loops. */
export interface SoundData { media: { hash: string; ext: string; durationS?: number }; loop?: boolean }

/** Builds the audio plan for a scene, optionally for the range [from, to) in ticks. `assets` resolves library sounds. */
export function scheduleSceneAudio(state: ProjectState, scene: Scene, range?: { from: number; to: number }, assets?: { manifest(ref: string): { data?: unknown } | undefined }): AudioPlan {
  const from = range?.from ?? 0;
  const to = Math.min(range?.to ?? scene.duration, scene.duration);
  const sec = (t: number) => t / TICKS_PER_SECOND;
  const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
  const anySolo = scene.tracks.some((t) => t.solo && BUS[t.kind]);
  const events: AudioEvent[] = [];
  const warnings: string[] = [];
  for (const c of scene.clips) {
    const tr = tracks.get(c.track);
    const bus = tr && BUS[tr.kind];
    if (!tr || !bus || !c.enabled || tr.mute || (anySolo && !tr.solo)) continue;
    if (c.end <= from || c.start >= to) continue;
    const p = c.params;
    if (p.mute === true) continue;
    let source: AudioSource | undefined;
    let fixture: boolean | undefined;
    let srcDur = Infinity;
    if (bus === 'dialogue') {
      if (!c.line || c.line.muted) continue;
      const state_ = lineTakeState(state, c);
      const take = c.line.take ? state.takes[c.line.take] : undefined;
      if (state_ !== 'Ready' || !take?.media) {
        if (state_ !== 'Ready') warnings.push(`Line "${c.line.text.slice(0, 40)}" has no ready take (${state_}); it is silent.`);
        continue;
      }
      source = { kind: 'media', hash: take.media.hash, ext: take.media.ext };
      fixture = take.fixture;
      srcDur = take.durationS ?? take.media.durationS ?? Infinity;
    } else if (c.media) {
      source = { kind: 'media', hash: c.media };
    } else if (c.asset) {
      // Library sounds play their content-addressed media (bundled content or the project store).
      const snd = (assets?.manifest(c.asset)?.data as { sound?: SoundData } | undefined)?.sound;
      if (snd) {
        source = { kind: 'media', hash: snd.media.hash, ext: snd.media.ext };
        if (snd.media.durationS && !snd.loop) srcDur = snd.media.durationS;
      } else source = { kind: 'asset', ref: c.asset };
    } else continue;
    const clipStart = Math.max(c.start, from);
    const clipEnd = Math.min(c.end, to);
    const offset = sec((c.sourceIn ?? 0) + (clipStart - c.start));
    const loop = p.loop === true || (bus !== 'dialogue' && p.loop !== false && (bus === 'ambience' || bus === 'music'));
    let duration = sec(clipEnd - clipStart);
    if (!loop && Number.isFinite(srcDur)) duration = Math.max(0, Math.min(duration, srcDur - offset));
    if (duration <= 0) continue;
    events.push({
      id: c.id,
      bus,
      source,
      start: sec(clipStart - from),
      offset,
      duration,
      gainDb: num(p.gainDb, 0) + tr.gainDb,
      pan: Math.max(-1, Math.min(1, num(p.pan, 0))),
      // Fades are defined on the clip; a range cut mid-fade keeps the clip-relative envelope.
      fadeIn: Math.max(0, num(p.fadeIn, bus === 'dialogue' ? 0.005 : 0) - sec(clipStart - c.start)),
      fadeOut: Math.max(0, num(p.fadeOut, bus === 'dialogue' ? 0.005 : 0) - sec(c.end - clipEnd)),
      curve: p.fadeCurve === 'equal-power' ? 'equal-power' : 'linear',
      loop,
      ducks: typeof p.duck === 'boolean' ? p.duck : bus === 'music' || bus === 'ambience',
      ...(fixture !== undefined ? { fixture } : {}),
    });
  }
  events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return {
    duration: sec(to - from),
    events,
    duck: { db: scene.audio.duckingDb, attack: scene.audio.duckAttack, release: scene.audio.duckRelease },
    speech: mergeSpans(events.filter((e) => e.bus === 'dialogue').map((e) => [e.start, e.start + e.duration])),
    warnings,
  };
}

export function mergeSpans(spans: [number, number][]): [number, number][] {
  const s = [...spans].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);
export const gainToDb = (g: number) => (g <= 0 ? -Infinity : 20 * Math.log10(g));

/** Fade envelope for an event at plan time t (0…1). */
export function fadeAt(e: AudioEvent, t: number): number {
  const local = t - e.start;
  if (local < 0 || local > e.duration) return 0;
  let g = 1;
  if (e.fadeIn > 0 && local < e.fadeIn) g = Math.min(g, local / e.fadeIn);
  const rem = e.duration - local;
  if (e.fadeOut > 0 && rem < e.fadeOut) g = Math.min(g, rem / e.fadeOut);
  return e.curve === 'equal-power' ? Math.sin((g * Math.PI) / 2) : g;
}

/**
 * Ducking gain (dB, ≤ 0) at plan time t. The duck reaches full depth when speech starts (attack before it) and
 * releases after it ends; overlapping ramps take the deepest value.
 */
export function duckDbAt(plan: Pick<AudioPlan, 'speech' | 'duck'>, t: number): number {
  const { db, attack, release } = plan.duck;
  if (db >= 0) return 0;
  let depth = 0;
  for (const [a, b] of plan.speech) {
    let f = 0;
    if (t >= a && t <= b) f = 1;
    else if (t < a && t >= a - attack) f = attack > 0 ? 1 - (a - t) / attack : 1;
    else if (t > b && t <= b + release) f = release > 0 ? 1 - (t - b) / release : 0;
    depth = Math.max(depth, f < 1e-9 ? 0 : f);
    if (depth === 1) break;
  }
  return depth === 0 ? 0 : db * depth;
}

/** Linear gain of an event at plan time t, including clip gain, fades and ducking. */
export function eventGainAt(plan: AudioPlan, e: AudioEvent, t: number): number {
  const duck = e.ducks ? duckDbAt(plan, t) : 0;
  return dbToGain(e.gainDb + duck) * fadeAt(e, t);
}

/** Constant-power pan law → [left, right] gains. */
export function panGains(pan: number): [number, number] {
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a) * Math.SQRT2, Math.sin(a) * Math.SQRT2];
}

/** Ducking automation as breakpoints (seconds, dB) for display and Web Audio scheduling (FR-SND-03). */
export function duckCurve(plan: Pick<AudioPlan, 'speech' | 'duck'>): [number, number][] {
  const pts: [number, number][] = [[0, duckDbAt(plan, 0)]];
  for (const [a, b] of plan.speech) {
    for (const t of [a - plan.duck.attack, a, b, b + plan.duck.release]) if (t > 0) pts.push([t, duckDbAt(plan, t)]);
  }
  pts.sort((x, y) => x[0] - y[0]);
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0]);
}

export function isAudioClip(scene: Scene, c: Clip): boolean {
  const k = scene.tracks.find((t) => t.id === c.track)?.kind;
  return k !== undefined && BUS[k] !== undefined;
}
