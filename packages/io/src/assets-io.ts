/**
 * Project-side asset packaging glue: resolves refs across the project's library sources and media store, and imports
 * asset packages into a project as project-local assets (FR-IMP-04, FR-DAT-11).
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { Library } from '@frame/assets';
import { FrameError, type AssetManifest, type PackageFormat } from '@frame/schema';
import type { OpenProject } from './project.js';
import {
  exportAssetPackage, exportProjectPackage, manifestHash, prepareAssetImport, readPackage, type AssetSourceLookup, type ImportReport,
  type PackageLimits,
} from './package.js';

export function projectAssetSource(lib: Library, p: OpenProject): AssetSourceLookup {
  return {
    lookup: (ref) => {
      const e = lib.get(ref);
      return e ? { manifest: e.manifest, source: e.source } : undefined;
    },
    media: (hash) => {
      const f = p.store.findMedia(hash);
      return f ? fs.readFileSync(f) : undefined;
    },
  };
}

export function exportAssetsFromProject(p: OpenProject, lib: Library, format: Exclude<PackageFormat, 'frameproj'>, refs: string[], o: { appVersion: string; now?: string }): Uint8Array {
  return exportAssetPackage(format, refs, projectAssetSource(lib, p), { appVersion: o.appVersion, createdAt: o.now ?? new Date().toISOString() });
}

export function exportProjectFromOpen(p: OpenProject, lib: Library, o: { appVersion: string; now?: string }): Uint8Array {
  if (!p.flush()) throw new FrameError('IO_ERROR', `Could not save the project before packaging: ${p.saveState.error}`);
  return exportProjectPackage(p.store.root, p.state as never, projectAssetSource(lib, p), { appVersion: o.appVersion, createdAt: o.now ?? new Date().toISOString() });
}

/**
 * Imports an asset package into a project: media into the content-addressed store, manifests as project-local assets
 * in one undoable command batch. Identical assets are skipped; conflicts are refused unless `onConflict: 'new-id'`.
 */
export function importAssetsIntoProject(
  p: OpenProject,
  lib: Library,
  bytes: Uint8Array,
  o: { expect?: PackageFormat | PackageFormat[]; onConflict?: 'refuse' | 'new-id'; source?: string; dryRun?: boolean; limits?: PackageLimits; newId?: () => string } = {},
): { report: ImportReport; revision: number; manifests: AssetManifest[] } {
  const pkg = readPackage(bytes, o.expect ?? ['framechar', 'frameasset', 'framevoice'], o.limits);
  const prepared = prepareAssetImport(pkg, {
    existing: (ref) => lib.manifest(ref),
    bundledHash: (ref) => {
      const e = lib.get(ref);
      return e?.source === 'bundled' ? manifestHash(e.manifest) : undefined;
    },
  }, { onConflict: o.onConflict ?? 'refuse', newId: o.newId ?? randomUUID });
  if (prepared.report.missing.length) {
    throw new FrameError('NOT_FOUND', `This Frame installation lacks bundled assets the package needs: ${prepared.report.missing.slice(0, 5).join(', ')}`, { missing: prepared.report.missing }, 'Update Frame to import this package.');
  }
  if (o.dryRun || !prepared.manifests.length) return { report: prepared.report, revision: p.session.revision, manifests: prepared.manifests };
  for (const m of prepared.media) p.store.putMedia(m.data, { ...m.ref });
  const r = p.session.apply({
    commands: prepared.manifests.map((manifest) => ({ name: 'asset.addLocal', params: { manifest } })),
    label: `Import ${pkg.manifest.format === 'framechar' ? 'character' : pkg.manifest.format === 'framevoice' ? 'voice' : 'assets'} (${prepared.manifests.length})`,
    ...(o.source ? { source: o.source } : {}),
  });
  return { report: prepared.report, revision: r.revision, manifests: prepared.manifests };
}
