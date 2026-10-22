/**
 * Library-backed automatic performance (FR-ACT-07/08): picks the library's talking gestures (actions tagged
 * `talking`) and additive listening reactions (tagged `listening`) and the character's performance defaults, then
 * generates `auto` clips with the pure core function. Used by the server, the CLI and agents.
 */
import { autoPerformanceCommands, type ActionData, type CharacterData } from '@frame/core';
import type { Library } from '@frame/assets';
import type { Command } from '@frame/schema';
import type { ProjectState } from '@frame/core';

export function autoPerformanceForLibrary(state: ProjectState, sceneId: string, lib: Library, opts: { instances?: string[]; kinds?: ('talking' | 'listening')[] } = {}): Command[] {
  const scene = state.scenes[sceneId];
  if (!scene) return [];
  const acts = lib.byKind('act').map((e) => ({ ref: `${e.manifest.id}@${e.manifest.version}`, tags: e.manifest.tags, action: (e.manifest.data as { action?: ActionData }).action }));
  const talking = acts.filter((a) => a.action && a.tags.includes('talking')).map((a) => a.ref);
  const listening = acts.filter((a) => a.action?.additive && a.tags.includes('listening')).map((a) => a.ref);
  const actionOf = (r: string) => (lib.manifest(r)?.data as { action?: ActionData } | undefined)?.action;
  const cmds: Command[] = [];
  for (const inst of scene.instances) {
    if (inst.kind !== 'character' || !inst.character || !inst.asset) continue;
    if (opts.instances && !opts.instances.includes(inst.id)) continue;
    const perf = (lib.manifest(inst.asset)?.data as CharacterData | undefined)?.performance;
    const kinds = opts.kinds ?? [...(inst.character.auto.talkingGestures ? ['talking' as const] : []), ...(inst.character.auto.listening ? ['listening' as const] : [])];
    if (!kinds.length) continue;
    cmds.push(...autoPerformanceCommands(state, sceneId, inst.id, { talking, listening, actionOf, kinds, ...(perf ? { gestureSize: perf.gestureSize, idleEnergy: perf.idleEnergy } : {}) }));
  }
  return cmds;
}
