/**
 * Automatic performance clips (FR-ACT-07/08): talking gestures during a character's lines and listening nods while
 * others speak, generated as ordinary, visible, editable clips marked `auto`. Regenerating replaces only `auto` clips;
 * baking a clip (clip.update `bake`) makes it manual so regeneration leaves it alone. Pure: returns commands.
 */
import type { Command, Scene } from '@frame/schema';
import type { ProjectState } from '../state.js';
import { hash32, prng } from '../ids.js';
import { TICKS_PER_SECOND } from '../time.js';
import { clipChannels, postureAt, type ActionData, type ActionLookup } from './data.js';

export interface AutoPerformanceOptions {
  /** Talking-gesture actions to choose from (resolved by the caller, e.g. library actions tagged "talking"). */
  talking: string[];
  /** Additive listening actions (nods, head tilts). */
  listening: string[];
  actionOf: ActionLookup;
  /** Character performance defaults (0–100): gesture size scales intensity, idle energy how often listeners react. */
  gestureSize?: number;
  idleEnergy?: number;
  kinds?: ('talking' | 'listening')[];
}

const S = TICKS_PER_SECOND;

export function autoPerformanceCommands(state: ProjectState, sceneId: string, instanceId: string, o: AutoPerformanceOptions): Command[] {
  const scene = state.scenes[sceneId];
  const inst = scene?.instances.find((i) => i.id === instanceId);
  if (!scene || !inst?.character) return [];
  const track = scene.tracks.find((t) => t.owner === inst.id && t.kind === 'acting');
  if (!track) return [];
  const kinds = new Set(o.kinds ?? ['talking', 'listening']);
  const cmds: Command[] = [];
  const old = scene.clips.filter((c) => c.track === track.id && c.source === 'auto').map((c) => c.id);
  if (old.length) cmds.push({ name: 'clip.remove', params: { scene: sceneId, ids: old } });

  // Manual clips stay: auto clips avoid their (non-additive) channels.
  const manual = scene.clips.filter((c) => c.track === track.id && c.source !== 'auto' && c.enabled && c.asset).map((c) => {
    const a = o.actionOf(c.asset!);
    return { start: c.start, end: c.end, channels: a ? clipChannels(a, c.params) : [], additive: !!a?.additive };
  });
  const free = (a: ActionData, start: number, end: number) => a.additive || !manual.some((m) => !m.additive && m.start < end && start < m.end && m.channels.some((ch) => a.channels.includes(ch)));
  const fits = (a: ActionData, at: number) => !a.postures.length || a.postures.includes(postureAt(scene as Scene, inst.id, inst.character!.posture, at, o.actionOf));
  const intensity = Math.round(((o.gestureSize ?? 50) / 100) * 0.8 * 100 + 20) / 100;
  const add = (ref: string, start: number, end: number, params: Record<string, unknown>, blend: number) =>
    cmds.push({ name: 'clip.add', params: { scene: sceneId, track: track.id, start: Math.round(start), end: Math.round(end), asset: ref, blendIn: blend, blendOut: blend, params, auto: true } });

  const dialogue = new Set(scene.tracks.filter((t) => t.kind === 'dialogue').map((t) => t.id));
  const lines = scene.clips.filter((c) => c.enabled && c.line && !c.line.muted && dialogue.has(c.track)).sort((a, b) => a.start - b.start);
  const own = lines.filter((c) => c.line!.speaker === inst.id);

  if (kinds.has('talking') && o.talking.length) {
    for (const line of own) {
      const rnd = prng(hash32(`${line.id}:${inst.id}`));
      let t = line.start + 0.15 * S;
      let last = '';
      while (t < line.end - 0.8 * S) {
        const choices = o.talking.filter((r) => r !== last && o.actionOf(r) && fits(o.actionOf(r)!, t));
        const ref = choices[Math.floor(rnd() * choices.length)];
        if (!ref) break;
        const a = o.actionOf(ref)!;
        const len = Math.min(line.end - 0.15 * S - t, Math.max(1.2, a.loop ? a.duration * (1 + Math.floor(rnd() * 2)) : a.duration) * S);
        if (len < 0.6 * S) break;
        if (free(a, t, t + len)) {
          add(ref, t, t + len, { intensity }, Math.round(0.3 * S));
          last = ref;
        }
        t += len + (0.3 + rnd() * 0.5) * S;
      }
    }
  }

  if (kinds.has('listening') && o.listening.length) {
    const every = (6 - ((o.idleEnergy ?? 50) / 100) * 3) * S;
    for (const line of lines.filter((c) => c.line!.speaker !== inst.id)) {
      const rnd = prng(hash32(`${line.id}:${inst.id}:listen`));
      for (let t = line.start + (0.8 + rnd() * 1.2) * S; t < line.end - 0.6 * S; t += every * (0.7 + rnd() * 0.6)) {
        const ref = o.listening[Math.floor(rnd() * o.listening.length)]!;
        const a = o.actionOf(ref);
        if (!a || !fits(a, t)) continue;
        const end = Math.min(line.end, t + a.duration * S);
        if (end - t < 0.4 * S || own.some((c) => c.start < end && t < c.end)) continue;
        add(ref, t, end, { intensity: Math.min(1, intensity) }, Math.round(0.15 * S));
      }
    }
  }
  return cmds;
}
