/** Writes the CAT-10 coverage report to docs/catalog/coverage.md. Run: pnpm catalog:coverage */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '@frame/assets/catalog';
import { bundledLibrary } from '@frame/assets/node';
import { coverage, coverageMarkdown } from '@frame/assets';
import { rigCheck, rigCheckPasses, type PartData } from '@frame/rig';

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
const report = coverage(cat, (id) => {
  const latest = lib.all().filter((e) => e.manifest.id === id).sort((a, b) => b.manifest.version - a.manifest.version)[0];
  return latest?.manifest;
}, rig, process.env.FRAME_COVERAGE_DATE ?? new Date().toISOString().slice(0, 10));
fs.mkdirSync(path.join(repo, 'docs/catalog'), { recursive: true });
fs.writeFileSync(path.join(repo, 'docs/catalog/coverage.md'), coverageMarkdown(report));
console.log(`green ${report.green}/${report.total}, manifests ${report.withManifest}/${report.total} → docs/catalog/coverage.md`);
