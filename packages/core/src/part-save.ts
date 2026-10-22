/**
 * Saving parts from the part editor (FR-PED-02/05): a new part from an existing one, or a new version of a project
 * part. The rig check decides: failures block saving a usable part but allow saving a draft, which the library
 * offers only as "draft" until it passes (FR-AST-04).
 */
import { FrameError, styleFamilies, views as ALL_VIEWS, type AssetManifest, type View } from '@frame/schema';
import { rigCheck, type PartData, type RigIssue } from '@frame/rig';
import { characterVersionTarget } from './build-character.js';

export interface PartSaveRequest {
  /** The part being edited (library or project). */
  from: string;
  name: string;
  data: PartData;
  asNew?: boolean;
  draft?: boolean;
  changes?: string;
  aiAssisted?: boolean;
}

export function partManifest(req: PartSaveRequest, lookup: { manifest(ref: string): AssetManifest | undefined; versions(id: string): number[] }, o: { newId: () => string; author: string; date: string }): { manifest: AssetManifest; issues: RigIssue[]; isNew: boolean } {
  const base = lookup.manifest(req.from);
  if (!base) throw new FrameError('NOT_FOUND', `${req.from} not found`);
  if (!(base.data as PartData | undefined)?.families) throw new FrameError('USAGE', `${base.name} is not a part with artwork`);
  if (!req.name?.trim()) throw new FrameError('USAGE', 'Name the part');
  const issues = rigCheck(req.data);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length && !req.draft) {
    throw new FrameError('VALIDATION_FAILED', `The part does not pass the rig check (${errors.length} problem(s)); fix them or save it as a draft`, { issues: errors }, 'Drafts are kept but cannot be used on characters until they pass.');
  }
  const target = characterVersionTarget(req.from, (id) => lookup.versions(id), o.newId, req.asNew === true);
  const fams = styleFamilies.filter((f) => req.data.families[f]);
  const drawn = ALL_VIEWS.filter((v) => fams.every((f) => req.data.families[f]!.views[v]));
  const exempt: Partial<Record<View, string>> = {};
  for (const f of fams) for (const [v, why] of Object.entries(req.data.families[f]!.exempt ?? {})) if (why) exempt[v as View] = why;
  const draft = errors.length > 0;
  const { review: _r, changes: _c, ...rest } = base;
  const manifest = {
    ...rest,
    id: target.id,
    version: target.version,
    name: req.name.trim(),
    category: base.category,
    tags: [...new Set([...base.tags.filter((t) => t !== 'draft'), ...(target.isNew ? ['custom'] : []), ...(draft ? ['draft'] : [])])],
    families: fams,
    views: drawn,
    viewExemptions: exempt,
    license: { id: 'LicenseRef-User-Owned', redistributable: true, commercialUse: true },
    provenance: { method: req.aiAssisted ? 'ai-assisted-human-reviewed' : 'authored', author: o.author, date: o.date, notes: target.isNew ? `New part based on ${req.from} (FR-PED-02).` : `Version ${target.version} of ${target.id}.` },
    ...(req.changes ? { changes: req.changes } : {}),
    ...(draft ? { review: { status: 'changes-requested' as const } } : {}),
    data: req.data,
  } as AssetManifest;
  return { manifest, issues, isNew: target.isNew };
}
