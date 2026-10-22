/**
 * Ready-made sets (Catalog I2, FR-ENV-01): an editable arrangement of a kit — which pieces, a palette and time of day,
 * extra props, character marks and camera compositions. Applying one places ordinary instances, marks and cameras;
 * any scene's set can be saved as a set of your own.
 */
import type { Command } from '@frame/schema';
import type { IdSource } from './ids.js';
import type { ProjectState } from './state.js';

export interface SetData {
  kit: string;
  /** Kit pieces to place (default: all). */
  parts?: string[];
  palette?: string;
  timeOfDay?: string;
  props: { ref: string; name?: string; x: number; y: number; plane?: string; flip?: boolean; scale?: number }[];
  marks: { name: string; x: number; y: number; facing?: 'left' | 'right' | 'front' }[];
  cameras: { name: string; x: number; y: number; width: number }[];
}

interface KitInfo { parts: Record<string, { name?: string; plane?: string; order?: number; at?: [number, number] }> }

export function setCommands(state: ProjectState, sceneId: string, set: SetData, kit: KitInfo, o: { newId: IdSource; propName?: (ref: string) => string | undefined }): { commands: Command[]; pieces: string[] } {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const commands: Command[] = [];
  const pieces: string[] = [];
  const lowest = (plane: string) => Math.min(0, ...scene.instances.filter((i) => i.depthPlane === plane).map((i) => i.order));
  const parts = Object.entries(kit.parts).filter(([k]) => !set.parts || set.parts.includes(k)).sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));
  for (const [part, p] of parts) {
    const id = o.newId('ins');
    pieces.push(id);
    const plane = p.plane ?? 'back';
    commands.push({ name: 'instance.add', params: { scene: sceneId, id, kind: 'set-piece', asset: set.kit, name: p.name ?? part, transform: { x: p.at?.[0] ?? 960, y: p.at?.[1] ?? 1080 }, depthPlane: plane, order: lowest(plane) - 100 + (p.order ?? 0), params: { part } } });
  }
  for (const pr of set.props) {
    commands.push({ name: 'instance.add', params: { scene: sceneId, id: o.newId('ins'), kind: 'prop', asset: pr.ref, name: pr.name ?? o.propName?.(pr.ref) ?? pr.ref.split('@')[0]!, transform: { x: pr.x, y: pr.y, ...(pr.flip ? { flipX: true } : {}), ...(pr.scale ? { scale: pr.scale } : {}) }, depthPlane: pr.plane ?? 'mid' } });
  }
  for (const m of set.marks) commands.push({ name: 'stage.addMark', params: { scene: sceneId, name: m.name, x: m.x, y: m.y, ...(m.facing ? { facing: m.facing } : {}) } });
  for (const c of set.cameras) commands.push({ name: 'camera.add', params: { scene: sceneId, id: o.newId('cam'), name: c.name, center: { x: c.x, y: c.y }, width: c.width } });
  return { commands, pieces };
}

/** The set of a scene (FR-ENV-01 “save your own”): its kit pieces, props, marks and cameras. */
export function setFromScene(state: ProjectState, sceneId: string): SetData {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const pieces = scene.instances.filter((i) => i.kind === 'set-piece' && i.asset && typeof i.params.part === 'string');
  if (!pieces.length) throw new Error('This scene has no kit pieces to save as a set');
  // The kit with the most pieces in the scene.
  const counts = new Map<string, number>();
  for (const i of pieces) counts.set(i.asset!, (counts.get(i.asset!) ?? 0) + 1);
  const kit = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const mine = pieces.filter((i) => i.asset === kit);
  const first = mine[0]!;
  return {
    kit,
    parts: mine.map((i) => String(i.params.part)),
    ...(typeof first.params.palette === 'string' ? { palette: first.params.palette } : {}),
    ...(typeof first.params.timeOfDay === 'string' ? { timeOfDay: first.params.timeOfDay } : {}),
    props: scene.instances.filter((i) => i.kind === 'prop' && i.asset).map((i) => ({ ref: i.asset!, name: i.name, x: Math.round(i.transform.x), y: Math.round(i.transform.y), plane: i.depthPlane, ...(i.transform.flipX ? { flip: true } : {}), ...(i.transform.scale !== 1 ? { scale: i.transform.scale } : {}) })),
    marks: scene.stage.marks.map((m) => ({ name: m.name, x: Math.round(m.x), y: Math.round(m.y), ...(m.facing ? { facing: m.facing } : {}) })),
    cameras: scene.cameras.map((c) => ({ name: c.name, x: Math.round(c.center.x), y: Math.round(c.center.y), width: Math.round(c.width) })),
  };
}
