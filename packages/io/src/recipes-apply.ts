/**
 * Applying recipes and framing cameras with the library (FR-RCP-01/02, FR-CAM-01/04): resolves recipe data and
 * framing presets from manifests and frames shots from the subjects' boxes at the step's time.
 */
import { expandRecipe, frameBoxes, subjectBoxes, type ExpandedRecipe, type FramingData, type RecipeData, type ProjectState } from '@frame/core';
import type { Library } from '@frame/assets';
import type { FamilyStyle } from '@frame/rig';
import type { Command, StyleFamily } from '@frame/schema';
import { FrameError } from '@frame/schema';

export interface LibraryFrameOptions { lib: Library; styles: Record<StyleFamily, FamilyStyle> }

/** Camera parameters for a framing preset on subjects at time t. */
export function frameWithLibrary(state: ProjectState, sceneId: string, framingRef: string, subjects: string[], t: number, o: LibraryFrameOptions) {
  const framing = (o.lib.manifest(framingRef)?.data as { framing?: FramingData } | undefined)?.framing;
  if (!framing) return undefined;
  const scene = state.scenes[sceneId]!;
  const boxes = subjectBoxes(state, sceneId, subjects, Math.min(t, scene.duration - 1), { assets: { manifest: (r) => o.lib.manifest(r) }, styles: o.styles });
  const out = state.project.output;
  return frameBoxes(subjects.map((s) => boxes[s]).filter((b): b is NonNullable<typeof b> => !!b), framing, out.width / out.height, scene.stage);
}

export function recipeCommandsForLibrary(state: ProjectState, sceneId: string, ref: string, opts: { roles: Record<string, string>; at?: number; line?: string }, o: LibraryFrameOptions): ExpandedRecipe {
  const m = o.lib.manifest(ref);
  const data = (m?.data as { recipe?: RecipeData } | undefined)?.recipe;
  if (!data) throw new FrameError('NOT_FOUND', `${ref} is not a recipe`);
  try {
    return expandRecipe(state, sceneId, ref, data, {
      ...opts,
      exists: (r) => o.lib.has(r),
      frame: (framing, subjects, at) => frameWithLibrary(state, sceneId, framing, subjects, at, o),
    });
  } catch (e) {
    if (e instanceof FrameError) throw e;
    throw new FrameError('USAGE', (e as Error).message);
  }
}

/** A camera framed on subjects with a preset (FR-CAM-01). */
export function frameCameraCommand(state: ProjectState, sceneId: string, framingRef: string, subjects: string[], t: number, o: LibraryFrameOptions & { name?: string; camera?: string }): Command {
  const f = frameWithLibrary(state, sceneId, framingRef, subjects, t, o);
  if (!f) throw new FrameError('NOT_FOUND', `${framingRef} is not a framing preset`);
  if (o.camera) return { name: 'camera.update', params: { scene: sceneId, id: o.camera, set: { center: f.center, width: f.width, rotation: f.rotation, preset: framingRef, subjects } } };
  const scene = state.scenes[sceneId]!;
  const name = o.name ?? `${o.lib.manifest(framingRef)?.name ?? 'Camera'} · ${subjects.map((s) => scene.instances.find((i) => i.id === s)?.name ?? s).join(' & ') || 'stage'}`;
  return { name: 'camera.add', params: { scene: sceneId, name, center: f.center, width: f.width, rotation: f.rotation, preset: framingRef, subjects } };
}
