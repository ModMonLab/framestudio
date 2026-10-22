import { Type, AssetManifest, AssetRef, issues, type AssetManifest as Manifest } from '@frame/schema';
import { defineCommand, fail } from '../command.js';

/* ------------------------------------------------------------------ project-local assets (FR-AST-06, FR-VOI-01/10) */

defineCommand({
  name: 'asset.addLocal',
  summary: 'Store a project-local asset version (user.<uuid>@n), e.g. a designed voice. Published versions are immutable.',
  params: Type.Object({ manifest: Type.Unknown() }, { additionalProperties: false }),
  label: (p) => `Add ${(p.manifest as Manifest).name}`,
  touches: (p) => [`assets/${(p.manifest as Manifest).id}@${(p.manifest as Manifest).version}`],
  apply: (d, p) => {
    const m = p.manifest as Manifest;
    const errs = issues(AssetManifest, m, 5);
    if (errs.length) fail('VALIDATION_FAILED', `Asset manifest is invalid: ${errs.map((e) => `${e.path} ${e.message}`).join('; ')}`, { issues: errs });
    if (!m.id.startsWith('user.')) fail('VALIDATION_FAILED', 'Project-local assets use user.<uuid> IDs');
    const ref = `${m.id}@${m.version}`;
    if (d.assets[ref]) fail('CONFLICT', `${ref} already exists; publish a new version instead`, { ref });
    d.assets[ref] = JSON.parse(JSON.stringify(m));
  },
});

defineCommand({
  name: 'asset.removeLocal',
  summary: 'Remove a project-local asset version that nothing in the project uses.',
  params: Type.Object({ ref: AssetRef }, { additionalProperties: false }),
  label: () => 'Remove local asset',
  touches: (p) => [`assets/${p.ref}`],
  apply: (d, p) => {
    if (!d.assets[p.ref]) fail('NOT_FOUND', `${p.ref} is not a project-local asset`);
    const used = Object.values(d.scenes).some((s) => JSON.stringify(s).includes(`"${p.ref}"`)) || JSON.stringify(d.project).includes(`"${p.ref}"`);
    if (used) fail('CONFLICT', `${p.ref} is still used in this project`);
    delete d.assets[p.ref];
  },
});
