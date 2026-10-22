/**
 * `frame assets …`, `frame char export/import`, `frame package export/import` (FR-CLI-05, FR-AST-02/03, FR-IMP-04,
 * FR-DAT-10/11). Package commands work on project folders directly (local mode).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { assetUsages, buildCharacter, characterVersionCommands, type CharacterSpec } from '@frame/core';
import { parseRef, type Library } from '@frame/assets';
import { rigCheck, type PartData } from '@frame/rig';
import { AssetManifest, FrameError, issues, type PackageFormat } from '@frame/schema';
import {
  exportAssetsFromProject, exportProjectFromOpen, importAssetsIntoProject, importProjectPackage, manifestHash, readPackage, writeFileAtomic,
  PACKAGE_EXTENSIONS, projectAssetSource, unresolvedReferences, importFile, IMAGE_EXTS, AUDIO_EXTS, type OpenProject, type RightsStatement,
} from '@frame/io';
import { command, type CommandContext } from './framework.js';
import { APP_VERSION } from './env.js';
import { findProjectDir, localOnly, mutate, openProject, projectLibrary } from './project-commands.js';


function optionalProject(ctx: CommandContext): OpenProject | undefined {
  try {
    findProjectDir(ctx);
  } catch {
    return undefined;
  }
  return openProject(ctx);
}

const withVersion = (lib: Library, ref: string) => (ref.includes('@') ? ref : lib.latestRef(ref) ?? ref);

/* ------------------------------------------------------------------ library */

command({
  path: ['assets', 'search'],
  summary: 'Search the library (bundled, user and project assets) by name, tags, synonyms; filter by type, family, view, source.',
  args: [
    { name: 'query', description: 'Search words; filters like type:expression style:illustrated view:side work too', positional: true },
    { name: 'type', description: 'Asset kind (catalog prefix, e.g. act, exp, hair) or category' },
    { name: 'family', description: 'flat or illustrated' },
    { name: 'source', description: 'bundled, user, project or imported' },
    { name: 'limit', description: 'Maximum results (default 50)', type: 'number' },
  ],
  examples: ['frame assets search "wave" --type act', 'frame assets search type:hair style:illustrated --json'],
  run: (ctx) => {
    const lib = projectLibrary(ctx, optionalProject(ctx));
    const hits = lib.search(String(ctx.args.query ?? ''), {
      ...(ctx.args.type ? { kind: String(ctx.args.type) } : {}),
      ...(ctx.args.family ? { family: ctx.args.family as 'flat' } : {}),
      ...(ctx.args.source ? { source: ctx.args.source as 'bundled' } : {}),
      limit: Number(ctx.args.limit ?? 50),
    });
    return { total: hits.length, results: hits.map((h) => ({ ref: h.ref, name: h.manifest.name, kind: h.manifest.kind, category: h.manifest.category, source: h.source, families: h.manifest.families, views: h.manifest.views })) };
  },
  human: (r) => r.results.map((x: any) => `${x.ref.padEnd(36)} ${x.name}  (${x.category}, ${x.source})`).join('\n') || 'No assets match.',
});

command({
  path: ['assets', 'show'],
  summary: 'Show an asset manifest, its versions and source.',
  args: [{ name: 'ref', description: 'Asset id or id@version', positional: true, required: true }],
  run: (ctx) => {
    const lib = projectLibrary(ctx, optionalProject(ctx));
    const ref = withVersion(lib, String(ctx.args.ref));
    const e = lib.get(ref);
    if (!e) throw new FrameError('NOT_FOUND', `${ref} is not in the library`, undefined, 'Use `frame assets search` to find assets.');
    return { ref, source: e.source, versions: lib.versions(e.manifest.id).map((m) => ({ version: m.version, changes: m.changes ?? null })), hash: manifestHash(e.manifest), manifest: e.manifest };
  },
  human: (r) => `${r.ref}  ${r.manifest.name} (${r.manifest.category}, ${r.source})\nversions: ${r.versions.map((v: any) => v.version).join(', ')}\nfamilies: ${r.manifest.families.join(', ') || '—'}  views: ${r.manifest.views.join(', ') || '—'}`,
});

command({
  path: ['assets', 'validate'],
  summary: 'Validate asset manifests (a file or a folder): schema and, for parts, the rig check (FR-AST-08).',
  args: [{ name: 'path', description: 'Manifest file or folder', positional: true, required: true }],
  run: (ctx) => {
    const target = path.resolve(ctx.io.cwd, String(ctx.args.path));
    const files: string[] = [];
    const walk = (p: string) => {
      if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) walk(path.join(p, f));
      else if (p.endsWith('.json')) files.push(p);
    };
    if (!fs.existsSync(target)) throw new FrameError('NOT_FOUND', `${target} does not exist`);
    walk(target);
    const results = files.map((f) => {
      let m: unknown;
      try {
        m = JSON.parse(fs.readFileSync(f, 'utf8'));
      } catch (e) {
        return { file: f, ok: false, errors: [`Not valid JSON: ${(e as Error).message}`], warnings: [] as string[] };
      }
      const errs = issues(AssetManifest, m, 10).map((i) => `${i.path} ${i.message}`);
      const warnings: string[] = [];
      const data = (m as { data?: { slot?: string; families?: unknown } }).data;
      if (!errs.length && data?.slot && data.families) {
        for (const x of rigCheck(data as PartData)) (x.severity === 'error' ? errs : warnings).push(`${[x.family, x.view].filter(Boolean).join(" ")}${x.family || x.view ? ": " : ""}${x.message}`);
      }
      return { file: f, ok: errs.length === 0, errors: errs, warnings };
    });
    const failed = results.filter((r) => !r.ok);
    if (failed.length) throw new FrameError('VALIDATION_FAILED', `${failed.length} of ${results.length} manifest(s) failed validation`, { problems: failed.flatMap((r) => r.errors.map((m) => ({ severity: 'error', message: `${path.relative(ctx.io.cwd, r.file)}: ${m}` }))) });
    return { checked: results.length, warnings: results.flatMap((r) => r.warnings.map((w) => `${path.relative(ctx.io.cwd, r.file)}: ${w}`)) };
  },
  human: (r) => [`${r.checked} manifest(s) valid.`, ...r.warnings.map((w: string) => `  warning: ${w}`)].join('\n'),
});

/* ------------------------------------------------------------------ characters */

command({
  path: ['char', 'create'],
  summary: 'Create a project character from a library or project character, with optional part, colour and look changes.',
  mutating: true,
  args: [
    { name: 'from', description: 'Character to start from (chr.* id or ref)', required: true },
    { name: 'name', description: 'Character name', required: true },
    { name: 'spec', description: 'JSON with role, parts, colors, looks, voice, body, performance (see `frame schema` / MCP create_character)', type: 'json' },
  ],
  examples: ['frame char create --from <character id> --name Robin --spec \'{"parts":{"hair":"<hair id>@1"}}\'', 'frame assets search type:chr'],
  run: async (ctx) => {
    const lib = projectLibrary(ctx, optionalProject(ctx));
    const spec = { ...((ctx.args.spec as object | undefined) ?? {}), name: String(ctx.args.name), from: withVersion(lib, String(ctx.args.from)) } as CharacterSpec;
    const author = ctx.io.env.FRAME_AGENT_SESSION ? `agent:${ctx.io.env.FRAME_AGENT_SESSION}` : 'cli';
    const manifest = buildCharacter(spec, { manifest: (r) => lib.manifest(r) }, { id: `user.${randomUUID()}`, date: new Date().toISOString().slice(0, 10), author });
    const ref = `${manifest.id}@${manifest.version}`;
    const r = await mutate(ctx, [{ name: 'asset.addLocal', params: { manifest } }, { name: 'cast.add', params: { character: ref, name: manifest.name } }], `Create ${manifest.name}`);
    return { ref, name: manifest.name, dryRun: r.dryRun, revision: r.revision };
  },
  human: (r) => `${r.dryRun ? 'Dry run: would create' : 'Created'} ${r.name} (${r.ref})`,
});

command({
  path: ['char', 'version', 'save'],
  summary: 'Save changes to a character as a new immutable version (or --as-new character); optionally switch an instance, a scene or the project to it (FR-CHR-10).',
  mutating: true,
  args: [
    { name: 'ref', description: 'Character version being changed (id@version)', positional: true, required: true },
    { name: 'spec', description: 'JSON changes: name, role, parts, colors, looks, controls, details, body, voice, performance, changes', type: 'json' },
    { name: 'as-new', description: 'Save as a new character', type: 'boolean' },
    { name: 'update', description: 'Switch usages: instance, scene or project (default: none — usages keep their version)' },
    { name: 'scene', description: 'Scene for --update instance|scene' },
    { name: 'instance', description: 'Instance for --update instance' },
  ],
  run: async (ctx) => {
    const lib = projectLibrary(ctx, optionalProject(ctx));
    const p = optionalProject(ctx);
    if (!p) throw new FrameError('NOT_FOUND', 'No Frame project here');
    const scope = ctx.args.update as 'instance' | 'scene' | 'project' | undefined;
    if (scope && !['instance', 'scene', 'project'].includes(scope)) throw new FrameError('USAGE', '--update must be instance, scene or project');
    const author = ctx.io.env.FRAME_AGENT_SESSION ? `agent:${ctx.io.env.FRAME_AGENT_SESSION}` : 'cli';
    const v = characterVersionCommands(p.state, {
      from: withVersion(lib, String(ctx.args.ref)),
      ...(ctx.args.spec ? { spec: ctx.args.spec as never } : {}),
      asNew: ctx.args['as-new'] === true,
      ...(scope ? { update: { scope, ...(ctx.args.scene ? { scene: String(ctx.args.scene) } : {}), ...(ctx.args.instance ? { instance: String(ctx.args.instance) } : {}) } } : {}),
    }, { manifest: (r) => lib.manifest(r), versions: (id) => lib.versions(id).map((m) => m.version) }, { newId: () => `user.${randomUUID()}`, date: new Date().toISOString().slice(0, 10), author });
    const r = await mutate(ctx, v.commands as never, v.label);
    return { ref: `${v.manifest.id}@${v.manifest.version}`, isNew: v.isNew, dryRun: r.dryRun, revision: r.revision, label: r.label };
  },
  human: (r) => `${r.dryRun ? 'Dry run: ' : ''}${r.label} → ${r.ref}`,
});

command({
  path: ['assets', 'usages'],
  summary: 'Where each version of an asset is used in the project: instances, clips, voices, cast (FR-AST-05).',
  args: [{ name: 'id', description: 'Asset id (any version)', positional: true, required: true }],
  run: (ctx) => {
    const p = openProject(ctx);
    const id = String(ctx.args.id).replace(/@\d+$/, '');
    return { id, usages: assetUsages(p.state, id) };
  },
  human: (r) => r.usages.map((u: any) => `${u.ref.padEnd(44)} ${u.kind.padEnd(10)} ${u.sceneName ? `${u.sceneName} / ` : ''}${u.name}`).join('\n') || 'Not used in this project.',
});

command({
  path: ['assets', 'update-usages'],
  summary: 'Switch usages of an asset version to another version: --scope instance|scene|project (explicit and undoable, FR-AST-05).',
  mutating: true,
  args: [
    { name: 'from', description: 'Current id@version', positional: true, required: true },
    { name: 'to', description: 'Target id@version', positional: true, required: true },
    { name: 'scope', description: 'instance, scene or project', required: true },
    { name: 'scene', description: 'Scene id (instance and scene scopes)' },
    { name: 'instance', description: 'Instance id (instance scope)' },
  ],
  run: async (ctx) => {
    const lib = projectLibrary(ctx, optionalProject(ctx));
    const to = String(ctx.args.to);
    const m = lib.manifest(to);
    if (!m) throw new FrameError('NOT_FOUND', `${to} is not in the library`);
    const d = m.data as { looks?: { id: string }[]; defaultLook?: string } | undefined;
    const r = await mutate(ctx, [{ name: 'asset.updateUsages', params: {
      from: String(ctx.args.from), to, scope: String(ctx.args.scope),
      ...(ctx.args.scene ? { scene: String(ctx.args.scene) } : {}), ...(ctx.args.instance ? { instance: String(ctx.args.instance) } : {}),
      ...(d?.looks ? { looks: d.looks.map((l) => l.id), ...(d.defaultLook ? { fallbackLook: d.defaultLook } : {}) } : {}),
    } }]);
    return { dryRun: r.dryRun, revision: r.revision, label: r.label, updated: (r.reports[0] as { updated?: unknown[] } | undefined)?.updated ?? [] };
  },
  human: (r) => `${r.dryRun ? 'Dry run: ' : ''}${r.label} (${r.updated.length} usage(s))`,
});

/* ------------------------------------------------------------------ asset packages */

function writeOut(ctx: CommandContext, out: unknown, fallback: string, bytes: Uint8Array) {
  const file = path.resolve(ctx.io.cwd, String(out ?? fallback));
  if (fs.existsSync(file) && !ctx.opts.yes) throw new FrameError('CONFLICT', `${file} exists`, undefined, 'Pass --yes to overwrite it.');
  if (!ctx.opts.dryRun) writeFileAtomic(file, bytes);
  return file;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';

function exportCommand(format: Exclude<PackageFormat, 'frameproj'>, ctx: CommandContext, refsArg: unknown, allVersions = false) {
  localOnly(ctx, 'Exporting packages');
  const p = openProject(ctx);
  const lib = projectLibrary(ctx, p);
  let refs = (refsArg as string[]).map((r) => withVersion(lib, r));
  if (allVersions) refs = [...new Set(refs.flatMap((r) => lib.versions(parseRef(r).id).map((m) => `${m.id}@${m.version}`)))];
  const bytes = exportAssetsFromProject(p, lib, format, refs, { appVersion: APP_VERSION });
  const first = lib.manifest(refs[0]!)!;
  const file = writeOut(ctx, ctx.args.out, `${slug(first.name)}${PACKAGE_EXTENSIONS[format]}`, bytes);
  const pkg = readPackage(bytes);
  const unresolved = unresolvedReferences(refs, projectAssetSource(lib, p));
  return { dryRun: ctx.opts.dryRun, file, format, assets: refs, bytes: bytes.byteLength, contents: pkg.manifest.contents.length, requires: pkg.manifest.requires?.length ?? 0, unresolved };
}

const exportHuman = (r: any) => [`${r.dryRun ? 'Dry run: would write' : 'Wrote'} ${r.file} (${r.assets.length} asset(s), ${r.contents} file(s), ${r.requires} bundled reference(s))`, ...r.unresolved.map((x: string) => `  warning: ${x} is referenced but not in the library`)].join('\n');

command({
  path: ['assets', 'export'],
  summary: 'Export assets with their non-bundled dependencies and media as a .frameasset package (FR-IMP-04).',
  mutating: false,
  args: [
    { name: 'refs', description: 'Asset refs (id or id@version)', positional: true, required: true, variadic: true },
    { name: 'out', description: 'Output file (default <name>.frameasset)' },
  ],
  examples: ['frame assets export user.1b0c…@2 --out props.frameasset'],
  run: (ctx) => exportCommand('frameasset', ctx, ctx.args.refs),
  human: exportHuman,
});

command({
  path: ['char', 'export'],
  summary: 'Export a character (selected version, or --all-versions) with custom parts, looks and voice as .framechar.',
  args: [
    { name: 'ref', description: 'Character ref (id or id@version)', positional: true, required: true },
    { name: 'out', description: 'Output file (default <name>.framechar)' },
    { name: 'all-versions', description: 'Include every version of the character', type: 'boolean' },
  ],
  run: (ctx) => exportCommand('framechar', ctx, [ctx.args.ref], ctx.args['all-versions'] === true),
  human: exportHuman,
});

command({
  path: ['voice', 'export'],
  summary: 'Export a voice asset with its references, range bank and consent record as .framevoice.',
  args: [
    { name: 'ref', description: 'Voice ref', positional: true, required: true },
    { name: 'out', description: 'Output file (default <name>.framevoice)' },
  ],
  run: (ctx) => exportCommand('framevoice', ctx, [ctx.args.ref]),
  human: exportHuman,
});

function importCommand(ctx: CommandContext, expect: PackageFormat[]) {
  localOnly(ctx, 'Importing packages');
  const file = path.resolve(ctx.io.cwd, String(ctx.args.file));
  if (!fs.existsSync(file)) throw new FrameError('NOT_FOUND', `${file} does not exist`);
  const p = openProject(ctx);
  const source = ctx.io.env.FRAME_AGENT_SESSION ? `agent:${ctx.io.env.FRAME_AGENT_SESSION}` : 'cli';
  const e = path.extname(file).slice(1).toLowerCase();
  if (expect.length > 1 && ([...IMAGE_EXTS, ...AUDIO_EXTS] as string[]).includes(e)) {
    // Images and audio (FR-IMP-01/02): validated, stored with provenance, optionally placed in a scene.
    if (!ctx.args.rights) throw new FrameError('USAGE', 'State your rights to the file with --rights own|licensed|public-domain', undefined, 'Imports record a statement of rights and a licence (FR-IMP-02).');
    const r = importFile(p, new Uint8Array(fs.readFileSync(file)), {
      fileName: path.basename(file), rights: ctx.args.rights as RightsStatement, author: source, source,
      ...(ctx.args.licence ? { licence: String(ctx.args.licence) } : {}),
      ...(ctx.args.scene ? { scene: String(ctx.args.scene) } : {}), ...(ctx.args.as ? { as: ctx.args.as as never } : {}),
      ...(ctx.args.at !== undefined ? { at: Math.round(Number(ctx.args.at) * 48000) } : {}),
      dryRun: ctx.opts.dryRun,
    });
    if (!ctx.opts.dryRun) p.close();
    return { file: true, ...r };
  }
  const r = importAssetsIntoProject(p, projectLibrary(ctx, p), fs.readFileSync(file), { expect, onConflict: ctx.args['new-ids'] === true ? 'new-id' : 'refuse', dryRun: ctx.opts.dryRun, source });
  if (!ctx.opts.dryRun) p.close();
  return { dryRun: ctx.opts.dryRun, ...r.report, revision: r.revision };
}

const importArgs = [
  { name: 'file', description: 'Package file', positional: true, required: true },
  { name: 'new-ids', description: 'Give conflicting assets new IDs instead of refusing (FR-DAT-11)', type: 'boolean' as const },
];
const fileImportArgs = [
  ...importArgs,
  { name: 'rights', description: 'Images and audio: own, licensed or public-domain (required)' },
  { name: 'licence', description: 'Licence you hold when --rights licensed (e.g. CC-BY-4.0)' },
  { name: 'scene', description: 'Place the image or audio in this scene' },
  { name: 'as', description: 'object or background (images); music, ambience or sfx (audio)' },
  { name: 'at', description: 'Audio start in seconds', type: 'number' as const },
];
const importHuman = (r: any) =>
  r.file ? [`${r.dryRun ? 'Dry run: would import' : 'Imported'} ${r.kind}${r.asset ? ` ${r.asset}` : ''}${r.instance ? ` placed as ${r.instance}` : ''}${r.clip ? ` on clip ${r.clip}` : ''}`, ...r.warnings.map((w: string) => `  warning: ${w}`)].join('\n') : [
    `${r.dryRun ? 'Dry run: would add' : 'Added'} ${r.added.length} asset(s)${r.unchanged.length ? `, ${r.unchanged.length} already present` : ''}.`,
    ...r.renamed.map((x: any) => `  renamed ${x.from} → ${x.to}`),
    ...r.roots.map((x: string) => `  ${x}`),
  ].join('\n');

command({ path: ['assets', 'import'], summary: 'Import an image (PNG, JPEG, WebP, SVG), audio (WAV, MP3, FLAC, OGG, M4A) or a .frameasset/.framechar/.framevoice package into the project.', mutating: true, args: fileImportArgs, examples: ['frame assets import backdrop.png --rights own --scene <scene> --as background', 'frame assets import theme.mp3 --rights licensed --licence CC-BY-4.0 --scene <scene> --as music'], run: (ctx) => importCommand(ctx, ['frameasset', 'framechar', 'framevoice']), human: importHuman });
command({ path: ['char', 'import'], summary: 'Import a .framechar package (character versions, custom parts, looks, voice).', mutating: true, args: importArgs, run: (ctx) => importCommand(ctx, ['framechar']), human: importHuman });
command({ path: ['voice', 'import'], summary: 'Import a .framevoice package (consent record required for clones).', mutating: true, args: importArgs, run: (ctx) => importCommand(ctx, ['framevoice']), human: importHuman });

/* ------------------------------------------------------------------ project packages */

command({
  path: ['package', 'export'],
  summary: 'Export the project as a .frameproj package with every non-bundled asset it uses (bundled ones by id@version and hash).',
  args: [{ name: 'out', description: 'Output file (default <project>.frameproj)' }],
  run: (ctx) => {
    localOnly(ctx, 'Exporting packages');
    const p = openProject(ctx);
    const bytes = exportProjectFromOpen(p, projectLibrary(ctx, p), { appVersion: APP_VERSION });
    const file = writeOut(ctx, ctx.args.out, `${slug(p.state.project.name)}.frameproj`, bytes);
    return { dryRun: ctx.opts.dryRun, file, bytes: bytes.byteLength, contents: readPackage(bytes).manifest.contents.length };
  },
  human: (r) => `${r.dryRun ? 'Dry run: would write' : 'Wrote'} ${r.file} (${r.contents} file(s), ${(r.bytes / 1e6).toFixed(1)} MB)`,
});

command({
  path: ['package', 'import'],
  summary: 'Open a .frameproj package as a new project folder.',
  mutating: true,
  args: [
    { name: 'file', description: 'Package file', positional: true, required: true },
    { name: 'dir', description: 'New project folder (must not exist or be empty)', positional: true, required: true },
    { name: 'allow-missing', description: 'Open even if bundled assets are missing (relink later)', type: 'boolean' },
  ],
  run: (ctx) => {
    const file = path.resolve(ctx.io.cwd, String(ctx.args.file));
    if (!fs.existsSync(file)) throw new FrameError('NOT_FOUND', `${file} does not exist`);
    const bytes = fs.readFileSync(file);
    const lib = projectLibrary(ctx);
    const bundledHash = (ref: string) => {
      const e = lib.get(ref);
      return e?.source === 'bundled' ? manifestHash(e.manifest) : undefined;
    };
    const dir = path.resolve(ctx.io.cwd, String(ctx.args.dir));
    if (ctx.opts.dryRun) {
      const pkg = readPackage(bytes, 'frameproj');
      return { dryRun: true, dir, project: pkg.manifest.project, files: pkg.manifest.contents.length, missing: (pkg.manifest.requires ?? []).filter((r) => bundledHash(r.ref) !== r.hash).map((r) => r.ref) };
    }
    return { dryRun: false, ...importProjectPackage(bytes, dir, { bundledHash }, { allowMissing: ctx.args['allow-missing'] === true }) };
  },
  human: (r) => `${r.dryRun ? 'Dry run: would create' : 'Created'} ${r.dir ?? r.root} (${r.project?.name ?? 'project'}, ${r.files} file(s))${r.missing.length ? `\n  missing bundled assets: ${r.missing.join(', ')}` : ''}`,
});
