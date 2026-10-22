/** Writes the CAT-10 coverage report to docs/catalog/coverage.md. Run: pnpm catalog:coverage */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '@frame/assets/catalog';
import { bundledLibrary } from '@frame/assets/node';
import { coverage, coverageMarkdown } from '@frame/assets';
import { rigCheck, rigCheckPasses, type PartData } from '@frame/rig';
import { previewable, previewFrame, previewSetup } from '@frame/core';
import { loadStyles } from '@frame/assets/node';
import { createNodeRenderer } from '@frame/render/node';
import { visibleBox } from '../../packages/server/src/app.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cat = loadCatalog(path.join(repo, 'catalog'));
const lib = bundledLibrary(path.join(repo, 'content'));
// Static rig check (FR-AST-08) on part data; hand poses are checked through their hand set.
const rig = (m: { data: unknown; dependencies: string[] }) => {
  const d = m.data as Partial<PartData> & { handPose?: string };
  if (d.families && d.slot) return rigCheckPasses(rigCheck(d as PartData));
  if (d.handPose) return m.dependencies.every((dep) => lib.has(dep));
  return undefined;
};
// Previews (CAT-04): render each previewable item in both families; ok when both show visible pixels.
const styles = loadStyles(path.join(repo, 'content'));
const renderer = await createNodeRenderer({ fontsDir: path.join(repo, 'content/fonts') });
const defaults = JSON.parse(fs.readFileSync(path.join(repo, 'content/library.json'), 'utf8')).defaults as { previewCharacter?: string };
const pc = defaults.previewCharacter;
const preview = (m: { id: string; version: number; kind: string }) => {
  if (!previewable(m.kind)) return undefined;
  const ref = `${m.id}@${m.version}`;
  const manifest = lib.manifest(ref)!;
  const setup = previewSetup(ref, manifest, pc && lib.manifest(pc) ? { ref: pc, manifest: lib.manifest(pc)! } : undefined);
  if (!setup) return false;
  for (const family of ['flat', 'illustrated'] as const) {
    try {
      const o = { assets: { manifest: (r: string) => setup.state.assets[r] ?? lib.manifest(r) }, styles, width: 96, height: 96, family, background: '#00000000', captions: true };
      const ev = previewFrame(setup, o, (f) => visibleBox(renderer.rgba(f), f.width, f.height));
      if (!visibleBox(renderer.rgba(ev.frame), 96, 96)) return false;
    } catch {
      return false;
    }
  }
  return true;
};
const report = coverage(cat, (id) => {
  const latest = lib.all().filter((e) => e.manifest.id === id).sort((a, b) => b.manifest.version - a.manifest.version)[0];
  return latest?.manifest;
}, rig, process.env.FRAME_COVERAGE_DATE ?? new Date().toISOString().slice(0, 10), preview);
fs.mkdirSync(path.join(repo, 'docs/catalog'), { recursive: true });
fs.writeFileSync(path.join(repo, 'docs/catalog/coverage.md'), coverageMarkdown(report));
console.log(`green ${report.green}/${report.total}, manifests ${report.withManifest}/${report.total} → docs/catalog/coverage.md`);
