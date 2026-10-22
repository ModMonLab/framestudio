/**
 * Asset compatibility with the current selection (FR-AST-04, P11): an asset is offered as incompatible — visible,
 * with the reason, but not applicable — when it lacks the project's style family, is not drawn for the selected
 * character's view (and does not declare that view exempt), needs a rig the character does not have, or does not
 * support the character's posture.
 */
import type { AssetManifest, Posture, StyleFamily, View } from '@frame/schema';

export interface CompatTarget {
  family: StyleFamily;
  /** The selected character, if any. */
  character?: { manifest: AssetManifest; view: View; posture: Posture };
}

const VIEW_NAME: Record<View, string> = { front: 'front', three: 'three-quarter', side: 'side', back: 'back' };

/** `true` when compatible, otherwise the reason. */
export function compatibility(m: AssetManifest, t: CompatTarget): true | string {
  if (m.families.length && !m.families.includes(t.family)) return `No ${t.family} artwork`;
  const c = t.character;
  if (!c) return true;
  const rigs = m.capabilities.filter((x) => x.startsWith('rig.'));
  if (rigs.length && !rigs.some((r) => c.manifest.capabilities.includes(r))) return `Needs ${rigs.join(' or ')}; ${c.manifest.name} uses ${c.manifest.capabilities.find((x) => x.startsWith('rig.')) ?? 'no rig'}`;
  if (rigs.length && m.views.length && !m.views.includes(c.view) && !m.viewExemptions[c.view]) return `Not drawn for the ${VIEW_NAME[c.view]} view`;
  const postures = (m.data as { action?: { postures?: string[] } } | undefined)?.action?.postures;
  if (postures?.length && !postures.includes(c.posture)) return `Not for ${c.posture} characters (${postures.join(', ')})`;
  return true;
}
