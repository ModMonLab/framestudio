/**
 * Clipboard (FR-PER-07): copy instances, clips and recipe groups (clips across several characters) and paste them
 * into the same or another scene or project. Copies carry the project-local assets they use and the media hashes
 * they need; library assets are referenced by version.
 */
import type { AssetManifest, Clip, Command, Instance, TrackKind } from '@frame/schema';
import { characterTrackKinds } from './defaults.js';
import type { IdSource } from './ids.js';
import type { ProjectState } from './state.js';

export const CLIPBOARD_FORMAT = 'frame.clipboard/1';

export interface ClipboardData {
  format: typeof CLIPBOARD_FORMAT;
  project: string;
  scene: string;
  instances: Instance[];
  /** Clips with their track's kind and owner (instance id or "scene"); lines keep text and delivery. */
  clips: (Clip & { trackKind: TrackKind; trackOwner: string; ownerName?: string })[];
  /** Project-local assets (user.*) the copy uses. */
  assets: Record<string, AssetManifest>;
  /** Media hashes the copy uses (images, imported audio). */
  media: string[];
}

export function copySelection(state: ProjectState, sceneId: string, sel: { instances?: string[]; clips?: string[] }): ClipboardData {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  // Groups bring their members.
  const ids = new Set(sel.instances ?? []);
  for (let grew = true; grew;) {
    grew = false;
    for (const i of scene.instances) if (i.parent && ids.has(i.parent) && !ids.has(i.id)) { ids.add(i.id); grew = true; }
  }
  const instances = scene.instances.filter((i) => ids.has(i.id));
  const clipIds = new Set(sel.clips ?? []);
  const clips = scene.clips.filter((c) => clipIds.has(c.id)).map((c) => {
    const t = scene.tracks.find((x) => x.id === c.track)!;
    const owner = scene.instances.find((i) => i.id === t.owner);
    return { ...structuredClone(c), trackKind: t.kind, trackOwner: t.owner, ...(owner ? { ownerName: owner.name } : {}) };
  });
  const refs = new Set<string>();
  const media = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === 'string') {
      if (v.startsWith('user.') && state.assets[v]) refs.add(v);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  for (const i of instances) {
    visit(i);
    if (i.media) media.add(i.media);
  }
  for (const c of clips) {
    visit(c);
    if (c.media) media.add(c.media);
  }
  return { format: CLIPBOARD_FORMAT, project: state.project.id, scene: sceneId, instances: structuredClone(instances), clips, assets: Object.fromEntries([...refs].map((r) => [r, state.assets[r]!])), media: [...media] };
}

export interface PasteResult {
  commands: Command[];
  /** Instance and clip ids created, for selecting the pasted objects. */
  instances: string[];
  clips: string[];
  warnings: string[];
}

/**
 * Commands that paste clipboard data into a scene. Instances get new ids (and new tracks); clips land on the new
 * instances' tracks, on the same character in the target scene (same id, or same name in another scene), or on the
 * scene's own tracks. `at` moves the earliest clip to that time; same-scene pastes of instances are offset so the copy
 * is visible. Pasted lines need new takes.
 */
export function pasteCommands(state: ProjectState, sceneId: string, data: ClipboardData, o: { newId: IdSource; at?: number }): PasteResult {
  if (data.format !== CLIPBOARD_FORMAT) throw new Error('Not Frame clipboard data');
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const warnings: string[] = [];
  const commands: Command[] = [];
  for (const [ref, m] of Object.entries(data.assets)) if (!state.assets[ref]) commands.push({ name: 'asset.addLocal', params: { manifest: m } });
  const sameScene = data.project === state.project.id && data.scene === sceneId;
  const idMap = new Map<string, string>();
  const trackMap = new Map<string, Record<string, string>>();
  for (const i of data.instances) idMap.set(i.id, o.newId('ins'));
  const remap = <T>(v: T): T => {
    if (typeof v === 'string') return (idMap.get(v) ?? v) as T;
    if (Array.isArray(v)) return v.map(remap) as T;
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)])) as T;
    return v;
  };
  const names = new Set(scene.instances.map((i) => i.name));
  for (const i of data.instances) {
    const id = idMap.get(i.id)!;
    const trackIds = i.kind === 'character' ? characterTrackKinds.map(() => o.newId('trk')) : undefined;
    if (trackIds) trackMap.set(id, Object.fromEntries(characterTrackKinds.map((k, n) => [k, trackIds[n]!])));
    const name = names.has(i.name) ? `${i.name} copy` : i.name;
    names.add(name);
    const parent = i.parent && idMap.get(i.parent);
    commands.push({ name: 'instance.add', params: {
      scene: sceneId, id, kind: i.kind, name, ...(i.asset ? { asset: i.asset } : {}), ...(i.media ? { media: i.media } : {}),
      transform: sameScene && !parent ? { ...i.transform, x: i.transform.x + 40, y: i.transform.y + 20 } : i.transform,
      ...(scene.stage.depthPlanes.some((d) => d.id === i.depthPlane) ? { depthPlane: i.depthPlane } : {}),
      parallax: i.parallax, ...(parent ? { parent } : {}), ...(i.character ? { character: remap(i.character) } : {}),
      ...(i.propState ? { propState: i.propState } : {}), params: remap(i.params), ...(trackIds ? { trackIds } : {}),
    } });
  }
  const t0 = data.clips.length ? Math.min(...data.clips.map((c) => c.start)) : 0;
  const shift = o.at !== undefined ? o.at - t0 : 0;
  const clipIds: string[] = [];
  for (const c of data.clips) {
    let track: string | undefined;
    let owner: string | undefined;
    const newOwner = idMap.get(c.trackOwner);
    if (newOwner) {
      owner = newOwner;
      track = trackMap.get(newOwner)?.[c.trackKind];
    } else if (c.trackOwner === 'scene') {
      track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === c.trackKind)?.id;
    } else {
      const target = scene.instances.find((i) => i.id === c.trackOwner) ?? scene.instances.find((i) => i.kind === 'character' && i.name === c.ownerName);
      owner = target?.id;
      track = target ? scene.tracks.find((t) => t.owner === target.id && t.kind === c.trackKind)?.id : undefined;
    }
    if (!track) {
      warnings.push(c.ownerName ? `No ${c.ownerName} in this scene for a ${c.trackKind} clip` : `No ${c.trackKind} track in this scene`);
      continue;
    }
    const id = o.newId('clp');
    clipIds.push(id);
    const start = Math.max(0, c.start + shift);
    if (c.line) {
      if (!owner) continue;
      commands.push({ name: 'line.add', params: { scene: sceneId, id, speaker: owner, text: c.line.text, start, durationS: (c.end - c.start) / 48000, delivery: c.line.delivery } });
      continue;
    }
    commands.push({ name: 'clip.add', params: {
      scene: sceneId, id, track, start, end: start + (c.end - c.start), ...(c.asset ? { asset: c.asset } : {}), params: remap(c.params),
      blendIn: c.blendIn, blendOut: c.blendOut, enabled: c.enabled, ...(c.media ? { media: c.media } : {}), ...(c.sourceIn !== undefined ? { sourceIn: c.sourceIn } : {}), ...(c.name ? { name: c.name } : {}),
    } });
  }
  if (data.clips.some((c) => c.line)) warnings.push('Pasted lines need new takes');
  const end = Math.max(0, ...commands.map((c) => (c.name === 'clip.add' ? Number(c.params.end) : c.name === 'line.add' ? Number(c.params.start) + Number(c.params.durationS) * 48000 : 0)));
  if (end > scene.duration) commands.unshift({ name: 'scene.setDuration', params: { id: sceneId, durationS: Math.ceil(end / 48000) } });
  return { commands, instances: [...idMap.values()], clips: clipIds, warnings };
}
