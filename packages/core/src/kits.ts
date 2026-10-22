/**
 * Kit palettes and time of day (FR-ENV-02): a palette recolours every piece of a kit in a scene consistently (colour
 * slots shared across pieces change together); a time-of-day preset shifts those colours toward a tint, darkens them,
 * and sets the matching lighting atmosphere over the scene.
 */
import type { Command } from '@frame/schema';
import type { ProjectState } from './state.js';

export interface KitPalette { id: string; name: string; colors: Record<string, string> }
export interface TimeOfDay { id: string; name: string; tint: string; amount: number; darken: number; atmosphere?: string }
interface KitData { parts: Record<string, { art: { colors?: Record<string, string> } }>; palettes?: KitPalette[] }

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const hex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

export function shiftColor(c: string, tod: Pick<TimeOfDay, 'tint' | 'amount' | 'darken'>): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  const a = rgb(c), t = rgb(tod.tint);
  return hex(a.map((v, i) => (v + (t[i]! - v) * tod.amount) * (1 - tod.darken)));
}

export function kitLookCommands(state: ProjectState, sceneId: string, kitRef: string, kit: KitData, o: { palette?: string; timeOfDay?: TimeOfDay; presets?: TimeOfDay[] }): Command[] {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const pieces = scene.instances.filter((i) => i.asset === kitRef && typeof i.params.part === 'string');
  if (!pieces.length) throw new Error('This scene has no pieces of that kit');
  const palette = o.palette ? kit.palettes?.find((p) => p.id === o.palette) : undefined;
  if (o.palette && !palette) throw new Error(`The kit has no palette ${o.palette}`);
  const cmds: Command[] = [];
  for (const inst of pieces) {
    const part = kit.parts[String(inst.params.part)];
    if (!part) continue;
    // Start from the chosen palette (or the one already applied), then the time of day.
    const paletteId = palette?.id ?? (typeof inst.params.palette === 'string' ? inst.params.palette : undefined);
    const from = kit.palettes?.find((p) => p.id === paletteId)?.colors ?? {};
    const tod = o.timeOfDay ?? (o.presets ?? []).find((p) => p.id === inst.params.timeOfDay);
    const colors: Record<string, string> = {};
    for (const [slot, base] of Object.entries(part.art.colors ?? {})) {
      const c = from[slot] ?? base;
      colors[slot] = tod ? shiftColor(c, tod) : c;
    }
    cmds.push({ name: 'instance.update', params: { scene: sceneId, id: inst.id, set: { params: { colors, ...(paletteId ? { palette: paletteId } : {}), ...(tod ? { timeOfDay: tod.id } : {}) } } } });
  }
  // One lighting atmosphere for the time of day, replacing another time of day's.
  if (o.timeOfDay) {
    const track = scene.tracks.find((t) => t.owner === 'scene' && t.kind === 'effect');
    const known = new Set((o.presets ?? []).map((p) => p.atmosphere).filter(Boolean));
    const old = scene.clips.filter((c) => c.track === track?.id && c.asset && known.has(c.asset)).map((c) => c.id);
    if (old.length) cmds.push({ name: 'clip.remove', params: { scene: sceneId, ids: old } });
    if (track && o.timeOfDay.atmosphere) cmds.push({ name: 'clip.add', params: { scene: sceneId, track: track.id, start: 0, end: scene.duration, asset: o.timeOfDay.atmosphere, name: o.timeOfDay.name } });
  }
  return cmds;
}
