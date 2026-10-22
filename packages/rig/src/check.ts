/**
 * Rig check (FR-AST-08, Catalog §0 rule 3): static validation of a part against the part contract — families and
 * views (or documented exemptions), known layering slots, point references, clip targets, fit spaces and colour
 * references. Composition checks against a reference character run in the content tools on top of this.
 */
import type { StyleFamily, View } from '@frame/schema';
import { SLOT_ORDER } from './compose.js';
import type { FitSpace, LayerDef, PartData, Seg, ShapeDef, ViewArt } from './types.js';

export interface RigIssue {
  severity: 'error' | 'warning';
  family?: StyleFamily;
  view?: View;
  message: string;
}

const FAMILIES: StyleFamily[] = ['flat', 'illustrated'];
const VIEWS: View[] = ['front', 'three', 'side', 'back'];
const SLOTS = new Set<string>(SLOT_ORDER);
const SPACES = new Set<FitSpace>(['head', 'face', 'torso', 'pelvis', 'neck', 'handL', 'handR', 'hand', 'footL', 'footR', 'foot', 'eye', 'eyeL', 'eyeR', 'brow', 'browL', 'browR', 'mouth', 'nose', 'ear', 'earL', 'earR', 'stage']);
/** Palette roots produced by buildPalette and the family style (suffixes .shade/.deep/.light/.line are derived). */
const PALETTE = /^(#[0-9a-fA-F]{3,8}|white|black|mouth|teeth|tongue|line|eyewhite|lash|[a-z][a-zA-Z0-9-]*(\.(shade|deep|light|line|blush|[a-z0-9-]+))*)$/;

function slotOk(slot: string): boolean {
  return slot.includes('*') ? SLOTS.has(slot.replace('*', 'near')) && SLOTS.has(slot.replace('*', 'far')) : SLOTS.has(slot);
}

function segRefs(seg: Seg): string[] {
  return seg.slice(1) as string[];
}

function checkShape(sh: ShapeDef, v: ViewArt, layer: LayerDef, ids: Set<string>, push: (m: string, sev?: 'error' | 'warning') => void) {
  for (const seg of sh.path ?? []) for (const ref of segRefs(seg)) if (!v.points[ref]) push(`Layer ${layer.slot}: path uses unknown point "${ref}"`);
  if (sh.ellipse && !v.points[sh.ellipse.c]) push(`Layer ${layer.slot}: ellipse centre "${sh.ellipse.c}" is not a point`);
  if (!sh.path && !sh.ellipse) push(`Layer ${layer.slot}: a shape has neither a path nor an ellipse`);
  if (sh.clip && !ids.has(sh.clip)) push(`Layer ${layer.slot}: clips to unknown shape "${sh.clip}"`);
  const colours: string[] = [];
  if (typeof sh.fill === 'string') colours.push(sh.fill);
  else if (sh.fill && 'lin' in sh.fill) colours.push(...sh.fill.lin.stops.map((s) => s[1]));
  else if (sh.fill && 'rad' in sh.fill) colours.push(...sh.fill.rad.stops.map((s) => s[1]));
  if (sh.stroke) colours.push(sh.stroke.c);
  for (const c of colours) if (!PALETTE.test(c)) push(`Layer ${layer.slot}: colour "${c}" is neither a palette slot nor #hex`, 'warning');
}

/** Returns contract issues for a part; an empty list (or warnings only) passes. */
export function rigCheck(part: PartData, opts: { requireViews?: boolean } = {}): RigIssue[] {
  const out: RigIssue[] = [];
  if (!SLOTS.has(part.slot) && !/^(head|eyes|brows|nose|mouth|ears|hair|fringe|facial-hair|top|outer|bottom|dress|shoe|acc|hands|hand-set|body|feet|skin-detail|makeup|overlay|identity|prop)$/.test(part.slot)) {
    out.push({ severity: 'warning', message: `Rig category "${part.slot}" is not a known category` });
  }
  for (const family of FAMILIES) {
    const fam = part.families[family];
    if (!fam) {
      out.push({ severity: 'error', family, message: `No ${family} artwork (Catalog §0 rule 1)` });
      continue;
    }
    for (const view of VIEWS) {
      const v = fam.views[view];
      const push = (message: string, severity: 'error' | 'warning' = 'error') => out.push({ severity, family, view, message });
      if (!v) {
        if (opts.requireViews !== false && !fam.exempt?.[view]) push(`No ${view} view and no documented exemption (Catalog §0 rule 2)`);
        continue;
      }
      if (fam.exempt?.[view]) push(`View ${view} is both drawn and declared exempt`, 'warning');
      for (const [name, pt] of Object.entries(v.points)) {
        if (!Array.isArray(pt.p) || pt.p.length !== 2 || !pt.p.every(Number.isFinite)) push(`Point "${name}" has an invalid position`);
        for (const [k, d] of Object.entries(pt.d ?? {})) if (!Array.isArray(d) || d.length !== 2 || !d.every(Number.isFinite)) push(`Point "${name}" has an invalid morph delta for "${k}"`);
      }
      if (!v.layers.length) push('The view has no layers (allowed for intentionally empty parts such as bald)', 'warning');
      for (const layer of v.layers) {
        if (!slotOk(layer.slot)) push(`Unknown layering slot "${layer.slot}" (FR-CHR-07)`);
        if (layer.space && !SPACES.has(layer.space)) push(`Unknown fit space "${layer.space}"`);
        if (!layer.shapes?.length && !layer.limb) push(`Layer ${layer.slot} draws nothing`);
        const ids = new Set((layer.shapes ?? []).map((s) => s.id).filter((x): x is string => !!x));
        for (const sh of layer.shapes ?? []) checkShape(sh, v, layer, ids, push);
        if (layer.limb && !(layer.limb.from >= 0 && layer.limb.to <= 1 && layer.limb.from < layer.limb.to)) push(`Layer ${layer.slot}: limb range ${layer.limb.from}–${layer.limb.to} is invalid`);
      }
      for (const [name, a] of Object.entries(v.anchors ?? {})) if (!SPACES.has(a.space)) push(`Anchor "${name}" uses unknown fit space "${a.space}"`);
    }
  }
  for (const p of part.params ?? []) {
    if (p.type === 'number' && p.range && !(typeof p.default === 'number' && p.default >= p.range[0] && p.default <= p.range[1])) out.push({ severity: 'error', message: `Parameter ${p.key}: default outside its range` });
    if (p.type === 'enum' && !(p.options ?? []).includes(String(p.default))) out.push({ severity: 'error', message: `Parameter ${p.key}: default is not one of its options` });
  }
  return out;
}

export function rigCheckPasses(issues: RigIssue[]): boolean {
  return !issues.some((i) => i.severity === 'error');
}
