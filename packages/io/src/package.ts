/**
 * Packages (SRS §3.6, FR-DAT-10/11, FR-IMP-04, NFR-09): zip archives with a `manifest.json` listing every entry with
 * its hash, size and role. Readers accept only declared paths of allowed types, reject path traversal, oversized
 * entries and hash mismatches, and never execute content. Importing never overwrites an existing `id@version` with
 * different content: the conflict is refused with a report, or the imported asset gets a new ID on request.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, zipSync, type Zippable } from 'fflate';
import {
  AssetManifest, FrameError, PackageManifest, issues, type AssetManifest as Manifest, type MediaRef, type PackageFormat,
  type PackageManifest as PkgManifest,
} from '@frame/schema';
import { collectMedia, collectRefs, refClosure, type AssetSource } from '@frame/assets';
import { sha256, stableStringify } from './fsutil.js';

export const PACKAGE_FORMAT_VERSION = 1;
export const PACKAGE_EXTENSIONS: Record<PackageFormat, string> = { frameproj: '.frameproj', framechar: '.framechar', frameasset: '.frameasset', framevoice: '.framevoice' };

/** File types a package may carry. Anything else (scripts, HTML, executables) is refused (NFR-09, AC-21). */
const ALLOWED_EXT = new Set(['json', 'jsonl', 'wav', 'flac', 'mp3', 'ogg', 'm4a', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'md']);
const SAFE_PATH = new RegExp(PackageManifest.properties.contents.items.properties.path.pattern as string);

export interface PackageLimits {
  maxEntries: number;
  /** Largest uncompressed entry (audio imports may be up to 500 MB, §4.4). */
  maxEntryBytes: number;
  maxTotalBytes: number;
}
export const DEFAULT_LIMITS: PackageLimits = { maxEntries: 50_000, maxEntryBytes: 512 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024 };

export interface PackageEntry {
  path: string;
  data: Uint8Array;
  role: string;
}

export interface ReadPackage {
  manifest: PkgManifest;
  files: Map<string, Uint8Array>;
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const invalid = (message: string, details?: unknown) => new FrameError('INVALID_PACKAGE', message, details, 'The package is damaged or was not made by Frame; nothing was imported.');

function extOf(p: string): string {
  const i = p.lastIndexOf('.');
  return i < 0 ? '' : p.slice(i + 1).toLowerCase();
}

export function checkEntryPath(p: string): string | undefined {
  if (!SAFE_PATH.test(p) || p.split('/').some((s) => s === '' || s === '.' || s === '..')) return 'unsafe path';
  if (!ALLOWED_EXT.has(extOf(p))) return `file type .${extOf(p) || '(none)'} is not allowed in packages`;
  return undefined;
}

/** Writes a package. Entries are stored in path order with a fixed timestamp so identical inputs give identical bytes. */
export function writePackage(format: PackageFormat, entries: PackageEntry[], o: { assets: string[]; requires?: { ref: string; hash: string }[]; appVersion: string; createdAt: string; project?: { id: string; name: string } }): Uint8Array {
  const seen = new Set<string>();
  for (const e of entries) {
    const bad = checkEntryPath(e.path);
    if (bad) throw new FrameError('VALIDATION_FAILED', `Cannot package ${e.path}: ${bad}`);
    if (seen.has(e.path) || e.path === 'manifest.json') throw new FrameError('VALIDATION_FAILED', `Duplicate package path ${e.path}`);
    seen.add(e.path);
  }
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  const manifest: PkgManifest = {
    format, formatVersion: PACKAGE_FORMAT_VERSION, appVersion: o.appVersion, createdAt: o.createdAt,
    contents: sorted.map((e) => ({ path: e.path, hash: sha256(e.data), bytes: e.data.byteLength, role: e.role })),
    assets: o.assets,
    ...(o.requires?.length ? { requires: [...o.requires].sort((a, b) => a.ref.localeCompare(b.ref)) } : {}),
    ...(o.project ? { project: o.project } : {}),
  };
  const mtime = new Date('2000-01-01T00:00:00Z');
  const files: Zippable = { 'manifest.json': [enc.encode(stableStringify(manifest)), { mtime }] };
  for (const e of sorted) files[e.path] = [e.data, { mtime, level: ['wav', 'json', 'jsonl', 'txt', 'md'].includes(extOf(e.path)) ? 6 : 0 }];
  return zipSync(files);
}

/**
 * Reads and verifies a package: the manifest must validate, every entry must be declared, safely named, of an
 * allowed type, within the size limits and match its declared hash and size (FR-DAT-10).
 */
export function readPackage(bytes: Uint8Array, expected?: PackageFormat | PackageFormat[], limits: PackageLimits = DEFAULT_LIMITS): ReadPackage {
  const problems: string[] = [];
  let count = 0;
  let total = 0;
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(bytes, {
      filter: (f) => {
        count++;
        total += f.originalSize;
        if (count > limits.maxEntries) problems.push(`more than ${limits.maxEntries} entries`);
        else if (f.originalSize > limits.maxEntryBytes) problems.push(`${f.name} is too large (${f.originalSize} bytes)`);
        else if (total > limits.maxTotalBytes) problems.push('the package expands beyond the size limit');
        else if (f.name !== 'manifest.json' && checkEntryPath(f.name)) problems.push(`${f.name}: ${checkEntryPath(f.name)}`);
        else return true;
        return false;
      },
    });
  } catch (e) {
    throw invalid(`Not a readable package: ${(e as Error).message}`);
  }
  if (problems.length) throw invalid(`The package was refused: ${problems.slice(0, 5).join('; ')}`, { problems });
  const mbytes = raw['manifest.json'];
  if (!mbytes) throw invalid('The package has no manifest.json');
  let manifest: PkgManifest;
  try {
    manifest = JSON.parse(dec.decode(mbytes)) as PkgManifest;
  } catch {
    throw invalid('manifest.json is not valid JSON');
  }
  const iss = issues(PackageManifest, manifest, 5);
  if (iss.length) throw invalid(`manifest.json is invalid: ${iss.map((i) => `${i.path} ${i.message}`).join('; ')}`, { issues: iss });
  const want = expected === undefined ? undefined : Array.isArray(expected) ? expected : [expected];
  if (want && !want.includes(manifest.format)) throw invalid(`Expected a ${want.map((f) => PACKAGE_EXTENSIONS[f]).join(' or ')} package, got ${PACKAGE_EXTENSIONS[manifest.format]}`);
  if (manifest.formatVersion > PACKAGE_FORMAT_VERSION) throw new FrameError('SCHEMA_TOO_NEW', `Package format version ${manifest.formatVersion} is newer than this Frame supports (${PACKAGE_FORMAT_VERSION})`, undefined, 'Update Frame to open this package.');
  const declared = new Map(manifest.contents.map((c) => [c.path, c]));
  if (declared.size !== manifest.contents.length) problems.push('duplicate paths in manifest.json');
  const files = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(raw)) {
    if (name === 'manifest.json') continue;
    const d = declared.get(name);
    if (!d) {
      problems.push(`${name} is not declared in manifest.json`);
      continue;
    }
    if (data.byteLength !== d.bytes || sha256(data) !== d.hash) problems.push(`${name} does not match its declared hash`);
    else files.set(name, data);
  }
  for (const c of manifest.contents) {
    const bad = checkEntryPath(c.path);
    if (bad) problems.push(`${c.path}: ${bad}`);
    else if (!raw[c.path]) problems.push(`${c.path} is declared but missing`);
  }
  if (problems.length) throw invalid(`The package was refused: ${problems.slice(0, 5).join('; ')}`, { problems });
  return { manifest, files };
}

/* ------------------------------------------------------------------ asset packages (.framechar, .frameasset, .framevoice) */

export interface AssetSourceLookup {
  /** Resolves a ref across bundled, user and project sources. */
  lookup(ref: string): { manifest: Manifest; source: AssetSource } | undefined;
  /** Media bytes by hash (project media store). */
  media(hash: string): Uint8Array | undefined;
}

/** Content hash of a manifest (locks and `requires`). */
export function manifestHash(m: Manifest): string {
  return sha256(stableStringify(m));
}

const mediaPath = (m: MediaRef) => `media/${m.hash}.${m.ext}`;

/**
 * Collects a set of root assets with every non-bundled dependency and the media they reference. Bundled
 * dependencies are recorded by ref and hash only.
 */
export function collectAssetContents(roots: string[], src: AssetSourceLookup): { entries: PackageEntry[]; requires: { ref: string; hash: string }[]; unresolved: string[] } {
  const { refs, missing } = refClosure(roots, (r) => src.lookup(r)?.manifest, (r) => src.lookup(r)?.source !== 'bundled');
  const absentRoots = missing.filter((r) => roots.includes(r));
  if (absentRoots.length) throw new FrameError('NOT_FOUND', `Cannot package: ${absentRoots.join(', ')} not found`, { missing: absentRoots });
  const entries: PackageEntry[] = [];
  const requires: { ref: string; hash: string }[] = [];
  const media = new Map<string, MediaRef>();
  for (const ref of refs) {
    const e = src.lookup(ref)!;
    if (e.source === 'bundled' && !roots.includes(ref)) {
      requires.push({ ref, hash: manifestHash(e.manifest) });
      continue;
    }
    entries.push({ path: `assets/${ref}.json`, data: enc.encode(stableStringify(e.manifest)), role: roots.includes(ref) ? 'root' : 'dependency' });
    collectMedia(e.manifest, media);
  }
  for (const m of media.values()) {
    const data = src.media(m.hash);
    if (!data) throw new FrameError('NOT_FOUND', `Cannot package: media ${m.hash} is missing from the project`, { hash: m.hash }, 'Relink or regenerate the missing audio first.');
    entries.push({ path: mediaPath(m), data, role: 'media' });
  }
  return { entries, requires, unresolved: missing };
}

const ROOT_KIND: Partial<Record<PackageFormat, string>> = { framechar: 'chr', framevoice: 'voice' };

/** Exports characters (all or selected versions), voices or any assets with their dependencies (FR-IMP-04). */
export function exportAssetPackage(format: Exclude<PackageFormat, 'frameproj'>, roots: string[], src: AssetSourceLookup, o: { appVersion: string; createdAt: string }): Uint8Array {
  if (!roots.length) throw new FrameError('USAGE', 'Choose at least one asset to export');
  for (const r of roots) {
    const e = src.lookup(r);
    if (!e) throw new FrameError('NOT_FOUND', `${r} not found`);
    const kind = ROOT_KIND[format];
    if (kind && e.manifest.kind !== kind) throw new FrameError('USAGE', `${r} is a ${e.manifest.kind}; ${PACKAGE_EXTENSIONS[format]} packages hold ${kind} assets`);
    checkConsent(e.manifest);
  }
  const { entries, requires } = collectAssetContents(roots, src);
  return writePackage(format, entries, { assets: roots, requires, ...o });
}

/**
 * References that neither the package nor this installation can resolve (a content gap such as a missing starter
 * voice). Packaging still succeeds — the same references are already unresolved where the assets came from — and
 * callers report them as warnings.
 */
export function unresolvedReferences(roots: string[], src: Pick<AssetSourceLookup, 'lookup'>): string[] {
  return refClosure(roots, (r) => src.lookup(r)?.manifest, (r) => src.lookup(r)?.source !== 'bundled').missing.filter((r) => !roots.includes(r));
}

/** Cloned voices carry their consent record everywhere, including packages (FR-VOI-04, AC-05). */
function checkConsent(m: Manifest) {
  const d = m.data as { method?: string; consent?: unknown } | undefined;
  if (m.kind === 'voice' && d?.method === 'clone' && !d.consent) {
    throw new FrameError('CONSENT_REQUIRED', `${m.name} is a cloned voice without a consent record`, { ref: `${m.id}@${m.version}` }, 'Cloned voices need the speaker\'s consent statement, name and date.');
  }
}

export interface ImportTarget {
  /** Existing manifest with this ref in the target (project, user library or bundled), if any. */
  existing(ref: string): Manifest | undefined;
  /** Hash of the bundled manifest with this ref, if bundled. */
  bundledHash(ref: string): string | undefined;
}

export interface ImportReport {
  format: PackageFormat;
  roots: string[];
  added: string[];
  /** Already present with identical content. */
  unchanged: string[];
  /** Conflicting IDs given new IDs (only with onConflict 'new-id'). */
  renamed: { from: string; to: string }[];
  /** Bundled requirements this installation lacks or has with different content. */
  missing: string[];
}

export interface ImportedAssets {
  report: ImportReport;
  manifests: Manifest[];
  media: { ref: MediaRef; data: Uint8Array }[];
}

/**
 * Prepares an asset package for import without writing anything: validates every manifest, checks consent, resolves
 * conflicts (FR-DAT-11) and checks bundled requirements. The caller stores the manifests and media.
 */
export function prepareAssetImport(pkg: ReadPackage, target: ImportTarget, o: { onConflict?: 'refuse' | 'new-id'; newId?: () => string } = {}): ImportedAssets {
  const { manifest, files } = pkg;
  if (manifest.format === 'frameproj') throw new FrameError('USAGE', 'This is a project package; open it as a project');
  const problems: string[] = [];
  const manifests: Manifest[] = [];
  const mediaByHash = new Map<string, Uint8Array>();
  for (const c of manifest.contents) {
    const data = files.get(c.path)!;
    if (c.path.startsWith('assets/') && c.path.endsWith('.json')) {
      let m: Manifest;
      try {
        m = JSON.parse(dec.decode(data)) as Manifest;
      } catch {
        problems.push(`${c.path} is not valid JSON`);
        continue;
      }
      const iss = issues(AssetManifest, m, 3);
      if (iss.length) problems.push(`${c.path}: ${iss.map((i) => `${i.path} ${i.message}`).join('; ')}`);
      else if (c.path !== `assets/${m.id}@${m.version}.json`) problems.push(`${c.path} holds ${m.id}@${m.version}`);
      else manifests.push(m);
    } else if (c.path.startsWith('media/')) {
      const hash = c.path.slice(6).replace(/\.[a-z0-9]+$/, '');
      if (hash !== c.hash) problems.push(`${c.path} is not named after its content hash`);
      else mediaByHash.set(hash, data);
    } else problems.push(`${c.path} is not an asset or media file`);
  }
  const refs = new Set(manifests.map((m) => `${m.id}@${m.version}`));
  for (const r of manifest.assets) if (!refs.has(r)) problems.push(`root ${r} is not in the package`);
  if (problems.length) throw invalid(`The package was refused: ${problems.slice(0, 5).join('; ')}`, { problems });
  for (const m of manifests) checkConsent(m);

  const report: ImportReport = { format: manifest.format, roots: [...manifest.assets], added: [], unchanged: [], renamed: [], missing: [] };
  for (const r of manifest.requires ?? []) if (target.bundledHash(r.ref) !== r.hash && !refs.has(r.ref)) report.missing.push(r.ref);

  // Conflicts: same id@version with different content (FR-DAT-11).
  const conflicts = new Set<string>();
  for (const m of manifests) {
    const ref = `${m.id}@${m.version}`;
    const ex = target.existing(ref);
    if (ex && manifestHash(ex) !== manifestHash(m)) conflicts.add(m.id);
  }
  const rename = new Map<string, string>();
  if (conflicts.size) {
    if (o.onConflict !== 'new-id') {
      throw new FrameError('CONFLICT', `The package contains different content for assets that already exist: ${[...conflicts].join(', ')}`, { conflicts: [...conflicts] }, 'Import with "new IDs" to keep both, or remove the existing assets first.');
    }
    for (const id of conflicts) {
      if (!id.startsWith('user.')) throw new FrameError('CONFLICT', `${id} conflicts with a library asset and cannot be renamed`, { id });
      rename.set(id, `user.${(o.newId ?? randomUUID)()}`);
    }
  }
  const remap = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const i = v.lastIndexOf('@');
      const id = i > 0 ? v.slice(0, i) : v;
      const to = rename.get(id);
      return to ? to + v.slice(id.length) : v;
    }
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, remap(x)]));
    return v;
  };
  const out: Manifest[] = [];
  for (const m0 of manifests) {
    const m = (rename.size ? remap(m0) : m0) as Manifest;
    const ref = `${m.id}@${m.version}`;
    if (rename.has(m0.id)) report.renamed.push({ from: `${m0.id}@${m0.version}`, to: ref });
    if (target.existing(ref)) report.unchanged.push(ref);
    else {
      report.added.push(ref);
      out.push(m);
    }
  }
  if (rename.size) report.roots = report.roots.map((r) => remap(r) as string);
  const media: ImportedAssets['media'] = [];
  for (const m of out) {
    for (const ref of collectMedia(m).values()) {
      const data = mediaByHash.get(ref.hash);
      if (!data) throw invalid(`${m.id}@${m.version} references media ${ref.hash} that the package does not carry`);
      if (!media.some((x) => x.ref.hash === ref.hash)) media.push({ ref, data });
    }
  }
  return { report, manifests: out, media };
}

/* ------------------------------------------------------------------ project packages (.frameproj) */

/** Folders and files of a project folder that a project package carries. */
const PROJECT_INCLUDE = ['project.json', 'episodes', 'assets', 'locks', 'cast'];

function walkFiles(root: string, rel: string, out: string[]) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (st.isFile()) {
    out.push(rel);
    return;
  }
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue; // temp files of atomic writes
    walkFiles(root, rel ? `${rel}/${e.name}` : e.name, out);
  }
}

/**
 * Packages a saved project folder (flush first) with every non-bundled library asset it references; bundled assets
 * are referenced by `id@version` and hash (SRS §3.6). Versions, renders and history stay behind.
 */
export function exportProjectPackage(root: string, state: { project: { id: string; name: string } } & Record<string, unknown>, src: Pick<AssetSourceLookup, 'lookup'>, o: { appVersion: string; createdAt: string }): Uint8Array {
  const rels: string[] = [];
  for (const r of PROJECT_INCLUDE) walkFiles(root, r, rels);
  const entries: PackageEntry[] = [];
  for (const rel of rels) {
    if (checkEntryPath(rel)) continue;
    entries.push({ path: `project/${rel}`, data: fs.readFileSync(path.join(root, rel)), role: rel.startsWith('assets/media/') ? 'media' : 'project' });
  }
  const local = new Set(Object.keys((state.assets ?? {}) as object));
  const used = collectRefs([state.project, state.episodes, state.scenes, state.takes, state.assets]);
  // Missing references are already reported by validation (MISSING_ASSET); they stay unresolved in the copy too.
  const { refs } = refClosure([...used].filter((r) => !local.has(r)), (r) => src.lookup(r)?.manifest, (r) => src.lookup(r)?.source !== 'bundled');
  const requires: { ref: string; hash: string }[] = [];
  for (const ref of refs) {
    const e = src.lookup(ref)!;
    if (e.source === 'bundled') requires.push({ ref, hash: manifestHash(e.manifest) });
    else entries.push({ path: `library/${ref}.json`, data: enc.encode(stableStringify(e.manifest)), role: 'library' });
  }
  return writePackage('frameproj', entries, { assets: [], requires, project: { id: state.project.id, name: state.project.name }, ...o });
}

/**
 * Unpacks a project package into an empty folder. Library assets that travelled with the project become
 * project-local assets so the project resolves without the original library (AC-20).
 */
export function importProjectPackage(bytes: Uint8Array, dir: string, target: Pick<ImportTarget, 'bundledHash'>, o: { allowMissing?: boolean; limits?: PackageLimits } = {}): { root: string; project: { id: string; name: string } | undefined; missing: string[]; files: number } {
  const pkg = readPackage(bytes, 'frameproj', o.limits);
  const root = path.resolve(dir);
  if (fs.existsSync(root) && fs.readdirSync(root).length) throw new FrameError('CONFLICT', `${root} is not empty`, undefined, 'Choose a new folder for the project.');
  if (!pkg.files.has('project/project.json')) throw invalid('The package has no project/project.json');
  const missing = (pkg.manifest.requires ?? []).filter((r) => target.bundledHash(r.ref) !== r.hash).map((r) => r.ref);
  if (missing.length && !o.allowMissing) {
    throw new FrameError('NOT_FOUND', `This Frame installation lacks ${missing.length} bundled asset(s) the project uses: ${missing.slice(0, 5).join(', ')}`, { missing }, 'Update Frame, or open anyway and relink from the Problems panel.');
  }
  const writes: [string, Uint8Array][] = [];
  for (const [p, data] of pkg.files) {
    let rel: string;
    if (p.startsWith('project/')) rel = p.slice('project/'.length);
    else if (p.startsWith('library/') && p.endsWith('.json')) {
      const m = JSON.parse(dec.decode(data)) as Manifest;
      if (issues(AssetManifest, m, 1).length || p !== `library/${m.id}@${m.version}.json`) throw invalid(`${p} is not a valid asset manifest`);
      rel = `assets/local/${m.id}@${m.version}.json`;
    } else throw invalid(`${p} is not part of a project package`);
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) throw invalid(`${p} escapes the project folder`);
    writes.push([abs, data]);
  }
  for (const [abs, data] of writes) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
  }
  return { root, project: pkg.manifest.project, missing, files: writes.length };
}
