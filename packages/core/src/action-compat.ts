/**
 * Action compatibility (FR-AST-08, CAT-03): whether an action works with a character-attached item. A pair is
 * incompatible when their rigs differ, or when performing the action on a character wearing the item raises
 * composition problems (missing points, views or clips) that the item does not have at rest — checked in both style
 * families, the three-quarter and side views and every posture the action supports.
 */
import type { AssetManifest, StyleFamily, View } from '@frame/schema';
import { evaluateFrame, type EvalOptions } from './perform/evaluate.js';
import { previewSetup } from './preview.js';
import { ProjectSession } from './session.js';
import { trackFor } from './lookup.js';

export interface CompatCheckOptions {
  lookup: (ref: string) => AssetManifest | undefined;
  styles: EvalOptions['styles'];
  previewCharacter: { ref: string; manifest: AssetManifest };
  families?: StyleFamily[];
  views?: View[];
  /** Fractions of the action's length to sample. */
  times?: number[];
}

/** Character-attached kinds covered by the matrix. */
export const ATTACHED_KINDS = ['head', 'eyes', 'brow', 'nose', 'mouth', 'ears', 'hair', 'fringe', 'facial-hair', 'body', 'feet', 'top', 'bottom', 'dress', 'outer', 'shoe', 'acc', 'skin-detail', 'makeup', 'identity'];

/** Reasons the action does not work with the item (empty when compatible). */
export function actionCompatIssues(part: { ref: string; manifest: AssetManifest }, action: { ref: string; manifest: AssetManifest }, o: CompatCheckOptions): string[] {
  const reasons: string[] = [];
  const rigs = (m: AssetManifest) => m.capabilities.filter((c) => c.startsWith('rig.'));
  const pr = rigs(part.manifest);
  const ar = rigs(action.manifest);
  if (pr.length && ar.length && !pr.some((r) => ar.includes(r))) reasons.push(`rig: the action needs ${ar.join(' or ')}, the item is for ${pr.join(' or ')}`);
  const setup = previewSetup(part.ref, part.manifest, o.previewCharacter, o.lookup);
  if (!setup?.subject) return reasons;
  const data = action.manifest.data as { action?: { duration?: number; postures?: string[] } };
  const dur = Math.round(Math.max(0.5, data.action?.duration ?? 2) * 48000);
  const postures = data.action?.postures?.length ? data.action.postures : ['standing'];
  const assets = (st: { assets: Record<string, AssetManifest> }) => ({ manifest: (r: string) => st.assets[r] ?? o.lookup(r) });
  const seen = new Set<string>();
  for (const posture of postures) {
    for (const view of o.views ?? ['three', 'side']) {
      const s = new ProjectSession(setup.state, 0);
      s.apply({ commands: [{ name: 'instance.update', params: { scene: setup.scene, id: setup.subject, set: { character: { ...s.state.scenes[setup.scene]!.instances.find((i) => i.id === setup.subject)!.character!, view, posture } } } }] });
      const rest = s.state;
      const track = trackFor(s.state.scenes[setup.scene]!, setup.subject, 'acting');
      if (!track) continue;
      s.apply({ commands: [{ name: 'clip.add', params: { scene: setup.scene, track: track.id, start: 0, end: dur, asset: action.ref, blendIn: 0, blendOut: 0 } }] });
      for (const family of o.families ?? ['flat', 'illustrated']) {
        const base = new Set(evaluateFrame(rest, setup.scene, 0, { assets: assets(rest), styles: o.styles, width: 64, height: 36, family }).issues);
        for (const f of o.times ?? [0.5, 0.85]) {
          for (const i of evaluateFrame(s.state, setup.scene, Math.round(dur * f), { assets: assets(s.state), styles: o.styles, width: 64, height: 36, family }).issues) {
            if (base.has(i)) continue;
            const r = `${posture}, ${view}, ${family}: ${i}`;
            if (!seen.has(i)) reasons.push(r);
            seen.add(i);
          }
        }
      }
    }
  }
  return reasons;
}
