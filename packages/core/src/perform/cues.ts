/**
 * Sound cues (FR-SND-04): actions and prop states emit sounds at their events (a mug set down, a door reaching its
 * closed state). Cues are generated as ordinary, editable SFX clips marked `auto` with `params.cue`; regenerating
 * replaces only those clips, so edited (baked) cues and hand-placed sounds stay. Pure: returns commands.
 */
import type { Command } from '@frame/schema';
import type { ProjectState } from '../state.js';
import { TICKS_PER_SECOND } from '../time.js';
import type { ActionData } from './data.js';

interface Resolver { manifest(ref: string): { data?: unknown; name?: string } | undefined }

export interface SoundCue { at: number; sound: string; key: string; label: string }

/** Every cue in a scene: action events (with the sound the action or the used prop declares) and prop state changes. */
export function sceneCues(state: ProjectState, sceneId: string, assets: Resolver): SoundCue[] {
  const scene = state.scenes[sceneId];
  if (!scene) return [];
  const tracks = new Map(scene.tracks.map((t) => [t.id, t]));
  const propSounds = (id: unknown) => {
    const inst = typeof id === 'string' ? scene.instances.find((i) => i.id === id) : undefined;
    return inst?.asset ? (assets.manifest(inst.asset)?.data as { sounds?: Record<string, string> } | undefined)?.sounds ?? {} : {};
  };
  const cues: SoundCue[] = [];
  for (const c of scene.clips) {
    const tr = tracks.get(c.track);
    if (!c.enabled || !tr || tr.mute) continue;
    if (tr.kind === 'acting' && c.asset) {
      const a = (assets.manifest(c.asset)?.data as { action?: ActionData } | undefined)?.action;
      const sounds = propSounds(c.params.prop);
      (a?.events ?? []).forEach((ev, i) => {
        const sound = ev.sound ?? sounds[ev.name] ?? (ev.propState ? sounds[`state:${ev.propState}`] : undefined);
        if (sound) cues.push({ at: Math.round(c.start + ev.t * (c.end - c.start)), sound, key: `${c.id}:${i}`, label: ev.name });
      });
    }
    // State changes placed directly on a prop's own track.
    if (tr.owner !== 'scene' && typeof c.params.setState === 'string') {
      const sound = propSounds(tr.owner)[`state:${c.params.setState}`];
      if (sound) cues.push({ at: c.end, sound, key: `${c.id}:state`, label: c.params.setState });
    }
  }
  return cues.sort((x, y) => x.at - y.at || x.key.localeCompare(y.key));
}

export function soundCueCommands(state: ProjectState, sceneId: string, assets: Resolver): Command[] {
  const scene = state.scenes[sceneId];
  const sfx = scene?.tracks.find((t) => t.owner === 'scene' && t.kind === 'sfx');
  if (!scene || !sfx) return [];
  const cmds: Command[] = [];
  const old = scene.clips.filter((c) => c.track === sfx.id && c.source === 'auto' && typeof c.params.cue === 'string').map((c) => c.id);
  if (old.length) cmds.push({ name: 'clip.remove', params: { scene: sceneId, ids: old } });
  // Cues already baked into manual clips are not added again.
  const baked = new Set(scene.clips.filter((c) => c.track === sfx.id && c.source !== 'auto' && typeof c.params.cue === 'string').map((c) => c.params.cue as string));
  for (const cue of sceneCues(state, sceneId, assets)) {
    if (baked.has(cue.key) || cue.at >= scene.duration) continue;
    const dur = (assets.manifest(cue.sound)?.data as { sound?: { media?: { durationS?: number } } } | undefined)?.sound?.media?.durationS ?? 1;
    const end = Math.min(scene.duration, cue.at + Math.round(dur * TICKS_PER_SECOND));
    cmds.push({ name: 'clip.add', params: { scene: sceneId, track: sfx.id, start: cue.at, end, asset: cue.sound, name: `${cue.label} (cue)`, params: { cue: cue.key }, auto: true } });
  }
  return cmds;
}
