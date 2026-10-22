import { Clip, Episode, issues, Project, Scene, Take, type Problem, type Scene as SceneT, type Clip as ClipT, type Take as TakeT } from '@frame/schema';
import type { ProjectState } from './state.js';
import { takeMatchesRevision } from './commands/timeline.js';
import { formatTimecode } from './time.js';
import { clipChannels, postureAt, type ActionData } from './perform/data.js';
import { characterVariant } from './perform/character.js';

export type TakeState = 'Missing' | 'Queued' | 'Generating' | 'Ready' | 'Failed' | 'Outdated' | 'Muted';

/** Take state of a line as shown in the timeline, Script view and properties (FR-DLG-04). */
export function lineTakeState(state: ProjectState, clip: ClipT): TakeState {
  const line = clip.line;
  if (!line) return 'Missing';
  if (line.muted) return 'Muted';
  const takes = Object.values(state.takes).filter((t) => t.line === clip.id);
  const chosen = line.take ? state.takes[line.take] : undefined;
  if (chosen) {
    if (!takeMatchesRevision(chosen, line.revision)) return 'Outdated';
    if (chosen.status === 'ready') return 'Ready';
    if (chosen.status === 'failed') return 'Failed';
  }
  const current = takes.filter((t) => takeMatchesRevision(t, line.revision));
  if (current.some((t) => t.status === 'generating')) return 'Generating';
  if (current.some((t) => t.status === 'queued')) return 'Queued';
  if (current.some((t) => t.status === 'ready')) return chosen ? 'Ready' : 'Missing';
  if (current.some((t) => t.status === 'failed')) return 'Failed';
  if (takes.length > 0) return 'Outdated';
  return 'Missing';
}

export interface ChannelInfo {
  channels: string[];
  additive: boolean;
}

export interface ValidationContext {
  /** Does this asset reference resolve in the library or project? */
  assetExists?: (ref: string) => boolean;
  /** Is this media hash present in the project's media store (and does its hash verify)? */
  mediaExists?: (hash: string) => boolean;
  /** Channels an action/expression asset drives (from its manifest). Defaults to reading `manifest`. */
  channelsOf?: (ref: string) => ChannelInfo | undefined;
  /** Manifest lookup, for action channels, additive blending and allowed postures (FR-ACT-02/03). */
  manifest?: (ref: string) => { data?: unknown } | undefined;
  /** Current content hash of a library asset, to compare with the project's locks (FR-DAT-06). */
  assetHash?: (ref: string) => string | undefined;
}

const exclusiveDefaults: Record<string, string[]> = { face: ['expression'], gaze: ['gaze'], acting: ['gesture'] };

/** Exclusive-channel conflicts per character (FR-CAM-07, FR-ACT-02, FR-EXP-04). */
export function channelConflicts(scene: SceneT, ctx: ValidationContext = {}): { a: ClipT; b: ClipT; channel: string; owner: string }[] {
  const out: { a: ClipT; b: ClipT; channel: string; owner: string }[] = [];
  const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
  const byOwner = new Map<string, { clip: ClipT; channels: string[]; additive: boolean }[]>();
  for (const c of scene.clips) {
    if (!c.enabled) continue;
    const t = tracks.get(c.track);
    if (!t || t.owner === 'scene') continue;
    const base = exclusiveDefaults[t.kind];
    if (!base) continue;
    // Blink clips add or remove blinks; they layer over expressions (FR-EXP-03).
    if (t.kind === 'face' && c.params.blink !== undefined) continue;
    // Turn clips change facing only; they combine with any action (FR-ACT-04).
    if (t.kind === 'acting' && (typeof c.params.turn === 'string' || (!c.asset && typeof c.params.view === 'string'))) continue;
    const info = c.asset ? ctx.channelsOf?.(c.asset) ?? channelInfo(ctx, c.asset, c.params) : undefined;
    const channels = info?.channels ?? base;
    const list = byOwner.get(t.owner) ?? [];
    list.push({ clip: c, channels, additive: info?.additive ?? false });
    byOwner.set(t.owner, list);
  }
  for (const [owner, list] of byOwner) {
    list.sort((x, y) => x.clip.start - y.clip.start);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const x = list[i]!;
        const y = list[j]!;
        if (y.clip.start >= x.clip.end) break;
        if (x.additive || y.additive) continue;
        // Blend regions may overlap (cross-fade); the cores may not.
        const overlap = Math.min(x.clip.end, y.clip.end) - y.clip.start;
        const allowed = Math.max(x.clip.blendOut, y.clip.blendIn);
        if (overlap <= allowed) continue;
        const shared = x.channels.find((ch) => y.channels.includes(ch));
        if (shared) out.push({ a: x.clip, b: y.clip, channel: shared, owner });
      }
    }
  }
  return out;
}

const actionData = (ctx: ValidationContext, ref: string) => (ctx.manifest?.(ref)?.data as { action?: ActionData } | undefined)?.action;

function channelInfo(ctx: ValidationContext, ref: string, params: Record<string, unknown>): ChannelInfo | undefined {
  const data = ctx.manifest?.(ref)?.data as { action?: ActionData; expression?: unknown } | undefined;
  if (data?.action) return { channels: clipChannels(data.action, params), additive: !!data.action.additive };
  if (data?.expression) return { channels: ['expression'], additive: false };
  return undefined;
}

/** Acting clips whose action does not allow the character's posture at the clip's start (FR-ACT-03). */
export function postureProblems(scene: SceneT, ctx: ValidationContext): { clip: ClipT; owner: string; posture: string; allowed: string[] }[] {
  if (!ctx.manifest) return [];
  const out: { clip: ClipT; owner: string; posture: string; allowed: string[] }[] = [];
  const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
  for (const c of scene.clips) {
    const tr = tracks.get(c.track);
    if (!c.enabled || !c.asset || tr?.kind !== 'acting' || tr.owner === 'scene') continue;
    const a = actionData(ctx, c.asset);
    const inst = scene.instances.find((i) => i.id === tr.owner);
    if (!a?.postures?.length || !inst?.character) continue;
    // Identity options hold a posture; rolling variants take any locomotion clip as rolling (FR-CHR-11).
    const man = inst.asset ? ctx.manifest(inst.asset) : undefined;
    const variant = man ? characterVariant(man as never, inst.character.look, { manifest: ctx.manifest as never }) : {};
    const posture = variant.posture ?? postureAt(scene, inst.id, inst.character.posture, c.start, (r) => actionData(ctx, r));
    if (variant.rolling && a.locomotion) continue;
    if (!a.postures.includes(posture)) out.push({ clip: c, owner: inst.id, posture, allowed: a.postures });
  }
  return out;
}

function overlapsOnTracks(scene: SceneT, kinds: string[], keyOf: (c: ClipT) => string | undefined) {
  const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
  const groups = new Map<string, ClipT[]>();
  for (const c of scene.clips) {
    if (!c.enabled) continue;
    const t = tracks.get(c.track);
    if (!t || !kinds.includes(t.kind)) continue;
    const k = keyOf(c);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: [ClipT, ClipT][] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) {
      for (let j = i - 1; j >= 0; j--) if (list[j]!.end > list[i]!.start) out.push([list[j]!, list[i]!]);
    }
  }
  return out;
}

/**
 * Full project validation: schemas, references, timing and conflict rules.
 * Produces Problems panel entries (FR-PER-06) and export blockers (FR-RND-08, FR-DLG-04, FR-CAM-07).
 */
export function validateProject(state: ProjectState, ctx: ValidationContext = {}): Problem[] {
  const problems: Problem[] = [];
  const add = (p: Problem) => problems.push(p);

  for (const i of issues(Project, state.project)) add({ severity: 'error', code: 'SCHEMA', message: `project.json ${i.path}: ${i.message}`, blocksExport: true });
  for (const ep of Object.values(state.episodes)) for (const i of issues(Episode, ep)) add({ severity: 'error', code: 'SCHEMA', message: `Episode ${ep.name} ${i.path}: ${i.message}`, blocksExport: true });
  for (const t of Object.values(state.takes)) for (const i of issues(Take, t)) add({ severity: 'error', code: 'SCHEMA', message: `Take ${t.id} ${i.path}: ${i.message}`, blocksExport: true });

  for (const epId of state.project.episodes) if (!state.episodes[epId]) add({ severity: 'error', code: 'MISSING_EPISODE', message: `Episode ${epId} is listed but missing`, blocksExport: true });

  for (const scene of Object.values(state.scenes)) {
    const where = { scene: scene.id };
    for (const i of issues(Scene, scene)) add({ severity: 'error', code: 'SCHEMA', message: `Scene ${scene.name} ${i.path}: ${i.message}`, blocksExport: true, ...where });
    const instanceIds = new Set(scene.instances.map((i) => i.id));
    const trackIds = new Set(scene.tracks.map((t) => t.id));
    const cameraIds = new Set(scene.cameras.map((c) => c.id));

    if (!cameraIds.has(scene.defaultCamera)) add({ severity: 'error', code: 'MISSING_CAMERA', message: `Scene ${scene.name} default camera is missing`, blocksExport: true, ...where });
    for (const t of scene.tracks) if (t.owner !== 'scene' && !instanceIds.has(t.owner)) add({ severity: 'error', code: 'ORPHAN_TRACK', message: `Track ${t.name} belongs to a missing object`, blocksExport: true, target: { kind: 'track', id: t.id }, ...where });

    for (const inst of scene.instances) {
      if (inst.asset && ctx.assetExists && !ctx.assetExists(inst.asset)) {
        add({ severity: 'error', code: 'MISSING_ASSET', message: `${inst.name} uses ${inst.asset}, which is not in the library`, blocksExport: true, target: { kind: 'instance', id: inst.id }, fix: { label: 'Relink asset' }, ...where });
      }
      if (inst.media && ctx.mediaExists && !ctx.mediaExists(inst.media)) {
        add({ severity: 'error', code: 'MISSING_MEDIA', message: `${inst.name} image media is missing or its hash does not match`, blocksExport: true, target: { kind: 'instance', id: inst.id }, fix: { label: 'Relink media' }, ...where });
      }
      if (inst.parent && !instanceIds.has(inst.parent)) add({ severity: 'error', code: 'MISSING_PARENT', message: `${inst.name} belongs to a missing group`, blocksExport: true, target: { kind: 'instance', id: inst.id }, ...where });
    }

    for (const c of scene.clips) {
      const target = { kind: 'clip', id: c.id };
      if (!trackIds.has(c.track)) add({ severity: 'error', code: 'ORPHAN_CLIP', message: `A clip refers to a missing track`, blocksExport: true, target, ...where });
      if (c.end <= c.start) add({ severity: 'error', code: 'EMPTY_CLIP', message: `A clip has no duration`, blocksExport: true, target, ...where });
      if (c.end > scene.duration) {
        add({ severity: 'error', code: 'PAST_SCENE_END', message: `${clipName(scene, c)} ends at ${formatTimecode(c.end)}, after the scene end (${formatTimecode(scene.duration)})`, blocksExport: true, target, fix: { label: 'Extend scene to fit' }, ...where });
      }
      if (c.asset && ctx.assetExists && !ctx.assetExists(c.asset)) add({ severity: 'error', code: 'MISSING_ASSET', message: `${clipName(scene, c)} uses ${c.asset}, which is not in the library`, blocksExport: true, target, ...where });
      if (c.media && ctx.mediaExists && !ctx.mediaExists(c.media)) add({ severity: 'error', code: 'MISSING_MEDIA', message: `${clipName(scene, c)} audio is missing or its hash does not match`, blocksExport: true, target, fix: { label: 'Relink media' }, ...where });
      if (c.params.camera !== undefined && !cameraIds.has(String(c.params.camera))) add({ severity: 'error', code: 'MISSING_CAMERA', message: `A shot uses a missing camera`, blocksExport: true, target, ...where });
      if (c.line) {
        if (!instanceIds.has(c.line.speaker)) add({ severity: 'error', code: 'MISSING_SPEAKER', message: `A line's speaker is missing`, blocksExport: true, target, ...where });
        const st = lineTakeState(state, c);
        const speaker = scene.instances.find((i) => i.id === c.line!.speaker)?.name ?? 'Someone';
        if (st === 'Missing' || st === 'Failed' || st === 'Outdated' || st === 'Queued' || st === 'Generating') {
          const msg: Record<string, string> = {
            Missing: `${speaker}'s line has no audio. Record, upload or generate a take.`,
            Failed: `${speaker}'s take failed. Retry generation or record a take.`,
            Outdated: `${speaker}'s take was made for previous text. Generate a new take or confirm a recording.`,
            Queued: `${speaker}'s take is still queued.`,
            Generating: `${speaker}'s take is still generating.`,
          };
          add({ severity: st === 'Missing' || st === 'Queued' || st === 'Generating' ? 'warning' : 'error', code: `TAKE_${st.toUpperCase()}`, message: msg[st]!, blocksExport: true, target, ...where });
        }
        const take = c.line.take ? state.takes[c.line.take] : undefined;
        if (take?.media && ctx.mediaExists && !ctx.mediaExists(take.media.hash)) add({ severity: 'error', code: 'MISSING_MEDIA', message: `${speaker}'s take audio is missing or its hash does not match`, blocksExport: true, target, fix: { label: 'Relink media' }, ...where });
        if (c.line.text.length > 220) add({ severity: 'warning', code: 'LONG_LINE', message: `${speaker}'s line is very long for captions (${c.line.text.length} characters)`, blocksExport: false, target, ...where });
      }
      for (const i of issues(Clip, c, 3)) add({ severity: 'error', code: 'SCHEMA', message: `Clip ${i.path}: ${i.message}`, blocksExport: true, target, ...where });
    }

    for (const [a, b] of overlapsOnTracks(scene, ['shot'], () => 'shots')) {
      add({ severity: 'error', code: 'SHOT_OVERLAP', message: `Shots overlap at ${formatTimecode(b.start)}`, blocksExport: true, target: { kind: 'clip', id: b.id }, details: [a.id, b.id], ...where } as Problem);
    }
    for (const [a, b] of overlapsOnTracks(scene, ['dialogue'], (c) => c.line?.speaker)) {
      const who = scene.instances.find((i) => i.id === a.line?.speaker)?.name ?? 'A speaker';
      add({ severity: 'error', code: 'SPEAKER_OVERLAP', message: `${who} has two lines overlapping at ${formatTimecode(b.start)}`, blocksExport: true, target: { kind: 'clip', id: b.id }, details: [a.id, b.id], ...where } as Problem);
    }
    for (const k of channelConflicts(scene, ctx)) {
      const who = scene.instances.find((i) => i.id === k.owner)?.name ?? 'A character';
      add({ severity: 'error', code: 'CHANNEL_CONFLICT', message: `${who} has two ${k.channel} clips at ${formatTimecode(k.b.start)}`, blocksExport: true, target: { kind: 'clip', id: k.b.id }, details: [k.a.id, k.b.id], ...where } as Problem);
    }
    for (const k of postureProblems(scene, ctx)) {
      const who = scene.instances.find((i) => i.id === k.owner)?.name ?? 'A character';
      add({ severity: 'warning', code: 'POSTURE_MISMATCH', message: `${who} is ${k.posture} at ${formatTimecode(k.clip.start)}, but ${clipName(scene, k.clip)} needs ${k.allowed.join(' or ')}; add a posture change before it`, blocksExport: false, target: { kind: 'clip', id: k.clip.id }, ...where });
    }
  }
  if (ctx.assetHash) {
    for (const [ref, lock] of Object.entries(state.locks.assets)) {
      const current = ctx.assetHash(ref);
      if (current && current !== lock.hash) {
        add({ severity: 'warning', code: 'LOCK_MISMATCH', message: `${ref} in the library differs from the version this project pinned; renders may change`, blocksExport: false, target: { kind: 'asset', id: ref } });
      }
    }
  }
  return problems.map((p) => {
    const { details: _d, ...rest } = p as Problem & { details?: unknown };
    return rest;
  });
}

/** Clip IDs currently in conflict (for hatched rendering in the timeline). */
export function conflictingClipIds(scene: SceneT, ctx: ValidationContext = {}): Set<string> {
  const ids = new Set<string>();
  for (const [a, b] of overlapsOnTracks(scene, ['shot'], () => 'shots')) ids.add(a.id).add(b.id);
  for (const [a, b] of overlapsOnTracks(scene, ['dialogue'], (c) => c.line?.speaker)) ids.add(a.id).add(b.id);
  for (const k of channelConflicts(scene, ctx)) ids.add(k.a.id).add(k.b.id);
  for (const c of scene.clips) if (c.end > scene.duration) ids.add(c.id);
  return ids;
}

function clipName(scene: SceneT, c: ClipT): string {
  if (c.line) return `${scene.instances.find((i) => i.id === c.line!.speaker)?.name ?? 'A'} line`;
  if (c.name) return c.name;
  if (c.asset) return c.asset.split('@')[0]!;
  return 'A clip';
}

export function takesForLine(state: ProjectState, clipId: string): TakeT[] {
  return Object.values(state.takes).filter((t) => t.line === clipId).sort((a, b) => a.number - b.number);
}
