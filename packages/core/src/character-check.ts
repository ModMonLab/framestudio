/**
 * Live rig check of a whole character (FR-BLD-08, FR-AST-08): every part it draws passes the part contract, the
 * character renders in both families and all four views (or declares which it lacks), its mouth draws the full A17
 * set, and the actions it can perform are counted against the action library.
 */
import { MOUTH_SHAPES, rigCheck, type PartData, type ViewArt } from '@frame/rig';
import { styleFamilies, views, type AssetManifest, type StyleFamily, type View } from '@frame/schema';
import type { CharacterData } from './perform/character.js';

export interface CharacterCheckProblem {
  severity: 'error' | 'warning';
  part?: string;
  message: string;
}

export interface CharacterCheck {
  ok: boolean;
  families: StyleFamily[];
  views: View[];
  mouthShapes: number;
  actions: { compatible: number; total: number };
  problems: CharacterCheckProblem[];
}

/** Every drawable part a character uses: body, face and hair parts, details, and the garments/accessories of every look. */
export function characterPartRefs(c: CharacterData): string[] {
  const refs = [...Object.values(c.parts), ...(c.details ?? []), ...c.looks.flatMap((l) => [...l.garments, ...l.accessories])];
  return [...new Set(refs)];
}

function mouthShapesOf(art: ViewArt | undefined): number {
  const found = new Set<string>();
  const add = (w: unknown) => {
    const m = (w as Record<string, unknown> | undefined)?.mouth;
    for (const s of Array.isArray(m) ? m : m !== undefined ? [m] : []) if ((MOUTH_SHAPES as readonly string[]).includes(String(s))) found.add(String(s));
  };
  for (const l of art?.layers ?? []) {
    add(l.when);
    for (const sh of l.shapes ?? []) add(sh.when);
  }
  return found.size;
}

export function checkCharacter(m: AssetManifest, lookup: (ref: string) => AssetManifest | undefined, actions: AssetManifest[] = []): CharacterCheck {
  const c = m.data as CharacterData;
  const problems: CharacterCheckProblem[] = [];
  const famOk = new Set<StyleFamily>(styleFamilies);
  const viewOk = new Set<View>(views);
  let mouthShapes = 0;
  for (const ref of characterPartRefs(c)) {
    const a = lookup(ref);
    if (!a) {
      problems.push({ severity: 'error', part: ref, message: `${ref} is not in the library` });
      continue;
    }
    const data = a.data as PartData | undefined;
    if (!data?.families) continue; // data-only assets
    for (const i of rigCheck(data)) problems.push({ severity: i.severity, part: ref, message: `${a.name}${i.family ? ` (${i.family}${i.view ? `, ${i.view}` : ''})` : ''}: ${i.message}` });
    for (const f of styleFamilies) {
      const fam = data.families[f];
      if (!fam) famOk.delete(f);
      // An exempt view is supported by design (e.g. no face features in back view, FR-LIP-05).
      for (const v of views) if (!fam?.views[v] && !fam?.exempt?.[v]) viewOk.delete(v);
    }
    if (ref === c.parts.mouth) {
      const fam = data.families[styleFamilies[0]!];
      mouthShapes = mouthShapesOf(fam?.views.front);
    }
  }
  if (c.parts.mouth && mouthShapes < MOUTH_SHAPES.length) problems.push({ severity: 'error', part: c.parts.mouth, message: `The mouth draws ${mouthShapes} of ${MOUTH_SHAPES.length} speech shapes (Catalog A17)` });
  if (!c.looks.some((l) => l.id === c.defaultLook)) problems.push({ severity: 'error', message: `Default look "${c.defaultLook}" is not one of the looks` });
  const own = new Set(m.capabilities);
  const rigs = (caps: string[]) => caps.filter((x) => x.startsWith('rig.'));
  const compatible = actions.filter((a) => rigs(a.capabilities).every((r) => own.has(r))).length;
  return {
    ok: !problems.some((p) => p.severity === 'error'),
    families: styleFamilies.filter((f) => famOk.has(f)),
    views: views.filter((v) => viewOk.has(v)),
    mouthShapes,
    actions: { compatible, total: actions.length },
    problems,
  };
}
