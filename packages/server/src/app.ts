/**
 * Frame Server (SRS §2.1, FR-ARC-01..05): REST + WebSocket over the same engine commands as the CLI, a job queue for
 * renders and voice work, media and library access, and the Studio's static files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { CLIPBOARD_FORMAT, pasteCommands, type ClipboardData, actionFitsProp, recipeFromClips, templateFromScene, templateFromScenes, parseScript, scriptImportCommands, scriptRows, scriptText, soundCueCommands, type ActionData, assetUsages, checkCharacter, compareStates, compatibility, partManifest, type CompatTarget, type PartSaveRequest, rigArtwork, rigProp, rigSet, suggestPlane, suggestPropTarget, SET_PLANES, SET_PLANE_LABELS, suggestTarget, RIG_TARGETS, RIG_TARGET_LABELS, type RigLayer, type RigTarget, buildCharacter, characterVersionCommands, describeCommands, randomId, evaluateFrame, type CharacterData, type CharacterSpec, previewable, previewFrame, previewSetup, validateProject, type ProjectState } from '@frame/core';
import { libraryFor, loadStyles } from '@frame/assets/node';
import { createNodeRenderer, type NodeRenderer } from '@frame/render/node';
import { rigCheck, type PartData } from '@frame/rig';
import {
  decodeAudioFile, OpenProject, renderExport, rmsEnvelope, exportAssetsFromProject, exportProjectFromOpen, importAssetsIntoProject, importProjectPackage, manifestHash,
  projectAssetSource, unresolvedReferences, computeLocks, importFile, readLayeredArtwork, autoPerformanceForLibrary, bundledMediaFile, recipeCommandsForLibrary, autoCoverageForLibrary, frameCameraCommand, templateCommandsForLibrary, replaceCastCommands, projectFromTemplateCommands, type CoverageFramings, UserLibrary, sha256, writeFileAtomic, PACKAGE_EXTENSIONS, type OutputPreset, type RightsStatement,
  scriptPdf, styleFamilyBlockers, ProjectStore, AppSettingsStore, type AppSettings, RecentProjects, duplicateProject, moveToTrash, revealInFileManager,
} from '@frame/io';
import type { PackageFormat } from '@frame/schema';
import { exitCodeFor, FrameError, type View, type AssetManifest, type CommandBatch, type ErrorCode, type OutputSettings, type StyleFamily } from '@frame/schema';
import { VoiceClient, designCandidates, designedVoiceManifest, generateTakes, rangeCandidates, sourceLabel, toAlignment, voiceWithReferences, type ProjectAccess, type RangeCandidate } from '@frame/voice-client';
import { JobQueue, type Job } from './jobs.js';
import { ProjectHub, type HubEvent, type HubProject } from './hub.js';

/** Rigging assistant build request: a character (default), a prop with states, or a location kit. */
interface RigBuildBody {
  kind?: 'character' | 'prop' | 'set';
  name: string;
  fileName: string;
  rights: string;
  layers: (RigLayer & { group?: string })[];
  mapping: Record<string, string>;
  libraryParts?: Record<string, string>;
  /** Props: height on stage in output pixels. */
  height?: number;
  /** Sets: artwork size. */
  width?: number;
  artHeight?: number;
  save?: boolean;
  place?: { scene: string; x?: number; y?: number };
}

export const SERVER_VERSION = '0.1.0';
/** Bump when thumbnail framing or rendering changes so cached thumbnails are rebuilt. */
const THUMB_VERSION = 2; // 2: kit parts keep their declared order

export interface ServerOptions {
  contentDir: string;
  /** Built Studio (apps/studio/dist); served at / when present. */
  studioDir?: string;
  /** Voice Worker URL used when a project has no override (FRAME_WORKER_URL). */
  workerUrl?: string;
  /** Worker bearer token; never stored in projects (NFR-09). */
  workerToken?: string;
  /** Required for non-loopback binds. */
  token?: string;
  host?: string;
  watchMs?: number;
  debounceMs?: number;
  logger?: boolean;
  /** User library folder (FR-AST-01). */
  userDir?: string;
  /** Derived-data cache (thumbnails); defaults to <userDir>/../cache. */
  cacheDir?: string;
  /** Recent projects registry (FR-PRJ-06); defaults to <userDir>/../recent.json. */
  recentFile?: string;
  /** App settings (FR-SET-01); defaults to <userDir>/../settings.json. */
  settingsFile?: string;
}

const STATUS: Partial<Record<ErrorCode, number>> = {
  USAGE: 400, VALIDATION_FAILED: 422, NOT_FOUND: 404, REVISION_CONFLICT: 409, CONFLICT: 409, PERMISSION_REQUIRED: 403,
  CONSENT_REQUIRED: 403, WORKER_UNAVAILABLE: 503, CANCELLED: 409, SCHEMA_TOO_NEW: 422, MIGRATION_REQUIRED: 409, RENDER_FAILED: 500,
  INVALID_PACKAGE: 422, UNSUPPORTED: 400,
};

function sendError(reply: FastifyReply, e: unknown) {
  const err = e instanceof FrameError ? e : new FrameError('INTERNAL', (e as Error)?.message ?? String(e));
  return reply.code(STATUS[err.code] ?? 500).send({ error: { ...err.toJSON(), exitCode: exitCodeFor[err.code] } });
}

const MIME: Record<string, string> = { wav: 'audio/wav', flac: 'audio/flac', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', png: 'image/png', webm: 'video/webm', mov: 'video/quicktime', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4' };

export interface FrameServer {
  app: FastifyInstance;
  hub: ProjectHub;
  jobs: { render: JobQueue; voice: JobQueue };
  close(): Promise<void>;
}

export async function createServer(o: ServerOptions): Promise<FrameServer> {
  const app = Fastify({ logger: o.logger ?? false, bodyLimit: 512 * 1024 * 1024 });
  // Locks are computed against bundled + user sources at every save (FR-DAT-06).
  const lockLookup = () => {
    const lib = libraryFor({ contentDir: o.contentDir, ...(o.userDir ? { userDir: o.userDir } : {}) });
    return (ref: string) => {
      const e = lib.get(ref);
      return e ? { manifest: e.manifest, source: e.source } : undefined;
    };
  };
  // Recent projects (FR-PRJ-06) live next to the user library, like the thumbnail cache.
  const recentFile = o.recentFile ?? (o.userDir ? path.join(path.dirname(o.userDir), 'recent.json') : undefined);
  const recent = recentFile ? new RecentProjects(recentFile) : undefined;
  // App settings (FR-SET-01) beside the user library; the worker token lives here, never in projects (NFR-09).
  const appSettings = new AppSettingsStore(o.settingsFile ?? (o.userDir ? path.join(path.dirname(o.userDir), 'settings.json') : undefined));
  const startSettings = appSettings.read();
  const hub = new ProjectHub({
    ...(o.watchMs ? { watchMs: o.watchMs } : {}), ...(startSettings.autosaveMs !== undefined ? { debounceMs: startSettings.autosaveMs } : o.debounceMs !== undefined ? { debounceMs: o.debounceMs } : {}),
    onAttach: (open) => {
      open.locksFor = (state) => computeLocks(state, lockLookup());
      try {
        recent?.touch(open.store.root, open.state);
      } catch {
        /* the recent list is a convenience; never block opening a project */
      }
    },
  });
  const jobs = { render: new JobQueue(1), voice: new JobQueue(1) };
  const styles = loadStyles(o.contentDir);
  let renderer: Promise<NodeRenderer> | undefined;
  // Imported images resolve from the media store of whichever open project holds them (content-addressed).
  const images = (src: string) => {
    if (!src.startsWith('media:')) return undefined;
    for (const p of hub.list()) {
      const f = p.open.store.findMedia(src.slice(6));
      if (f) return new Uint8Array(fs.readFileSync(f));
    }
    return undefined;
  };
  const getRenderer = () => (renderer ??= createNodeRenderer({ fontsDir: path.join(o.contentDir, 'fonts'), images }));
  const library = (p?: HubProject) => libraryFor({ contentDir: o.contentDir, ...(o.userDir ? { userDir: o.userDir } : {}), projectAssets: Object.fromEntries(Object.entries(p?.open.state.assets ?? {}).map(([ref, m]) => [`assets/local/${ref}.json`, m])) });

  /* ---------------------------------------------------------------- security */
  app.addHook('onRequest', async (req, reply) => {
    // Loopback binds still reject foreign Host headers (DNS rebinding); network binds need the token.
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    const loopback = !o.host || ['127.0.0.1', 'localhost', '::1'].includes(o.host);
    if (loopback && host && !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host)) return reply.code(403).send({ error: { code: 'PERMISSION_REQUIRED', message: 'Unexpected Host header' } });
    if (o.token && req.url.startsWith('/api/') && req.url !== '/api/health') {
      const auth = req.headers.authorization ?? '';
      const q = new URL(req.url, 'http://x').searchParams.get('token');
      if (auth !== `Bearer ${o.token}` && q !== o.token) return reply.code(401).send({ error: { code: 'PERMISSION_REQUIRED', message: 'A valid token is required' } });
    }
  });
  app.addContentTypeParser(['application/octet-stream', 'application/zip', 'audio/*', 'image/*', 'video/*'], { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
  app.setErrorHandler((e, _req, reply) => {
    const fe = e as { validation?: unknown; statusCode?: number; message: string };
    if (fe.validation || fe.statusCode === 400) return sendError(reply, new FrameError('USAGE', fe.message));
    return sendError(reply, e);
  });

  await app.register(websocket);

  /* ---------------------------------------------------------------- live events (FR-ARC-03) */
  const sockets = new Set<{ send: (s: string) => void; project?: string; readyState: number }>();
  const broadcast = (e: HubEvent | { type: 'job'; job: Omit<Job, 'logs'> }) => {
    const project = e.type === 'job' ? e.job.project : e.project;
    const text = JSON.stringify(e);
    for (const s of sockets) if (s.readyState === 1 && (!s.project || !project || s.project === project)) s.send(text);
  };
  hub.onEvent(broadcast);
  jobs.render.onChange((job) => broadcast({ type: 'job', job: publicJob(job) }));
  jobs.voice.onChange((job) => broadcast({ type: 'job', job: publicJob(job) }));

  app.register(async (scope) => {
    scope.get('/api/events', { websocket: true }, (socket, req) => {
      const project = new URL(req.url, 'http://x').searchParams.get('project') ?? undefined;
      const entry = Object.assign(socket, { project });
      sockets.add(entry);
      const p = project ? hub.list().find((x) => x.id === project) : undefined;
      socket.send(JSON.stringify({ type: 'hello', version: SERVER_VERSION, ...(p ? { project: p.id, revision: p.open.session.revision } : {}) }));
      socket.on('close', () => sockets.delete(entry));
    });
  });

  /* ---------------------------------------------------------------- service */
  app.get('/api/health', async () => ({ ok: true, version: SERVER_VERSION }));
  app.get('/api/commands', async () => ({ commands: describeCommands() }));

  /* ---------------------------------------------------------------- projects */
  app.get('/api/projects', async () => ({ projects: hub.list().map((p) => ({ id: p.id, name: p.open.state.project.name, root: p.root, revision: p.open.session.revision, save: p.open.saveState })) }));
  app.post<{ Body: { path: string; migrate?: boolean } }>('/api/projects/open', async (req, reply) => {
    try {
      if (!req.body?.path) throw new FrameError('USAGE', 'path is required');
      const p = hub.open(req.body.path, { writeMigrations: req.body.migrate === true });
      return { id: p.id, root: p.root, revision: p.open.session.revision, problems: p.open.load?.problems ?? [] };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // New project folder with the library defaults (same as `frame init`), then opened.
  app.post<{ Body: { path: string; name?: string; styleFamily?: StyleFamily; frameRate?: number; template?: string; cast?: Record<string, string> } }>('/api/projects/create', async (req, reply) => {
    try {
      const b = req.body;
      if (!b?.path) throw new FrameError('USAGE', 'path is required');
      const dir = path.resolve(b.path);
      const d = libraryDefaults;
      const family = b.styleFamily ?? d.styleFamily;
      const prefs = appSettings.read();
      const fps = b.frameRate ?? prefs.defaultFrameRate ?? d.frameRate;
      if (family !== 'flat' && family !== 'illustrated') throw new FrameError('USAGE', 'styleFamily must be flat or illustrated');
      if (!fps || ![24, 25, 30].includes(fps)) throw new FrameError('USAGE', 'frameRate must be 24, 25 or 30');
      if (!d.output) throw new FrameError('INTERNAL', 'The content library has no default output preset');
      if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) throw new FrameError('CONFLICT', `${dir} is not empty`, undefined, 'Choose a new folder name.');
      const name = b.name ?? path.basename(dir).replace(/\.frame$/, '');
      // A default output chosen in Settings (FR-SET-01) when it is a picture preset.
      const pref = prefs.defaultOutput ? (library().manifest(prefs.defaultOutput)?.data as { output?: { width?: number; height?: number; aspect?: string } } | undefined)?.output : undefined;
      const output = pref?.width && pref.height ? { preset: prefs.defaultOutput!, width: pref.width, height: pref.height, aspectRatios: [pref.aspect ?? `${pref.width}:${pref.height}`] } : d.output;
      OpenProject.create(dir, { name, styleFamily: family, frameRate: fps as 24, output, appVersion: SERVER_VERSION, newId: randomId, ...(d.captionStyle ? { captionStyle: d.captionStyle } : {}) }).close();
      const p = hub.open(dir);
      // From a production template (FR-PRJ-01): its scenes replace the empty first scene; one undo step.
      if (b.template) {
        const ex = projectFromTemplateCommands(p.open.state, b.template, { ...(b.cast ? { cast: b.cast } : {}) }, { lib: library(p), styles });
        p.open.session.apply({ commands: ex.commands as never, source: sourceOf(req), label: `Start from ${library(p).manifest(b.template)?.name ?? 'template'}` });
      }
      return { id: p.id, root: p.root, revision: p.open.session.revision, name };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Resolve files changed on disk while local changes were unsaved (FR-PER-05).
  app.post<{ Params: { pid: string }; Body: { keep: 'disk' | 'mine' } }>('/api/projects/:pid/external/resolve', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const keep = req.body?.keep;
      if (keep !== 'disk' && keep !== 'mine') throw new FrameError('USAGE', 'keep must be "disk" or "mine"');
      p.open.resolveExternal(keep, () => new ProjectStore(p.root).load({ skipJournal: true }).state);
      return { revision: p.open.session.revision, save: p.open.saveState };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Relink missing media (FR-PER-06): the chosen file must be the same content, verified by hash.
  app.post<{ Params: { pid: string }; Querystring: { hash: string; ext?: string }; Body: Buffer }>('/api/projects/:pid/media/relink', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!Buffer.isBuffer(req.body)) throw new FrameError('USAGE', 'Send the file bytes as application/octet-stream');
      const got = sha256(req.body);
      if (got !== req.query.hash) throw new FrameError('VALIDATION_FAILED', 'That file is not the missing one (its contents differ)', { expected: req.query.hash, got }, 'Choose the original file, or replace the audio by uploading a new take.');
      const bad = p.open.store.findMedia(got);
      if (bad) fs.rmSync(bad, { force: true });
      const ext = (req.query.ext ?? 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
      p.open.store.putMedia(new Uint8Array(req.body), { ext, mime: 'application/octet-stream' });
      return { relinked: got };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string } }>('/api/projects/:pid/close', async (req, reply) => {
    try {
      hub.close(req.params.pid);
      return { closed: true };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.get<{ Params: { pid: string } }>('/api/projects/:pid/state', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      return { revision: p.open.session.revision, state: p.open.state, save: p.open.saveState, canUndo: p.open.session.canUndo(), canRedo: p.open.session.canRedo(), undoLabel: p.open.session.undoLabel() ?? null, redoLabel: p.open.session.redoLabel() ?? null };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Commands: the only way clients edit a project (FR-ARC-01/02/04).
  app.post<{ Params: { pid: string }; Body: CommandBatch & { dryRun?: boolean } }>('/api/projects/:pid/commands', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const body = req.body;
      if (!body || !Array.isArray(body.commands)) throw new FrameError('USAGE', 'commands[] is required');
      const batch: CommandBatch = { ...body, source: req.headers['x-frame-agent'] ? sourceOf(req) : body.source ?? 'user' };
      // Switching style family re-renders all artwork; refuse it while any used asset has no art in the target (FR-PRJ-05).
      for (const c of batch.commands) {
        const family = c.name === 'project.setSettings' ? (c.params as { styleFamily?: string }).styleFamily : undefined;
        if (!family || family === p.open.state.project.styleFamily) continue;
        const blockers = styleFamilyBlockers(p.open.state, lockLookup(), family);
        if (blockers.length) throw new FrameError('VALIDATION_FAILED', `${blockers.length} asset${blockers.length === 1 ? ' has' : 's have'} no ${family} artwork: ${blockers.slice(0, 5).map((b) => b.name).join(', ')}${blockers.length > 5 ? '…' : ''}`, { blockers }, 'Replace those assets or keep the current style family.');
      }
      const r = p.open.session.apply(batch, { dryRun: body.dryRun === true });
      return { revision: r.revision, baseRevision: r.baseRevision, rebased: r.rebased, dryRun: r.dryRun, label: r.label, commands: r.commands, changed: r.changed, reports: r.reports };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  for (const op of ['undo', 'redo'] as const) {
    app.post<{ Params: { pid: string } }>(`/api/projects/:pid/${op}`, async (req, reply) => {
      try {
        const p = hub.get(req.params.pid);
        // An agent undoes only its own latest change, never a person's (FR-AGT-04); redo is for people.
        if (req.headers['x-frame-agent']) {
          if (op === 'redo') throw new FrameError('PERMISSION_REQUIRED', 'Agents cannot redo', undefined, 'Apply the change again with apply_commands.');
          const src = p.open.session.undoSource();
          if (src && src !== sourceOf(req)) throw new FrameError('CONFLICT', `The latest change ("${p.open.session.undoLabel()}") was made by ${src.startsWith('agent:') ? 'another agent' : 'a person'}`, { source: src }, 'Re-read the project and apply a corrective change instead.');
        }
        const r = p.open.session[op]();
        if (!r) throw new FrameError('CONFLICT', `Nothing to ${op}`);
        return { revision: r.revision, label: r.label };
      } catch (e) {
        return sendError(reply, e);
      }
    });
  }
  // Revert every change of one agent session as a single undoable step (FR-AGT-04/05). People only.
  app.post<{ Params: { pid: string }; Body: { source: string } }>('/api/projects/:pid/revert-source', async (req, reply) => {
    try {
      if (req.headers['x-frame-agent']) throw new FrameError('PERMISSION_REQUIRED', 'Only a person can revert an agent session');
      const p = hub.get(req.params.pid);
      if (!req.body?.source?.startsWith('agent:')) throw new FrameError('USAGE', 'source must be an agent session (agent:<id>)');
      const r = p.open.session.revertSource(req.body.source);
      if (!r) throw new FrameError('NOT_FOUND', `No changes from ${req.body.source}`);
      return { revision: r.revision, label: r.label };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string } }>('/api/projects/:pid/save', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      p.open.flush();
      return p.open.saveState;
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.get<{ Params: { pid: string } }>('/api/projects/:pid/validate', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const lib = library(p);
      const locked = lockLookup();
      const problems = validateProject(p.open.state, { assetExists: (r) => lib.has(r), manifest: (r) => lib.manifest(r), mediaExists: (h) => p.open.store.verifyMedia(h), assetHash: (r) => { const m = locked(r)?.manifest; return m ? manifestHash(m) : undefined; } });
      return { revision: p.open.session.revision, problems };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.get<{ Params: { pid: string } }>('/api/projects/:pid/history', async (req, reply) => {
    try {
      return { history: hub.get(req.params.pid).open.store.readHistory() };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // One frame as PNG with the export renderer (thumbnails, previews without WebAssembly, identity checks; FR-RND-01).
  app.get<{ Params: { pid: string }; Querystring: { scene: string; t?: string; width?: string; height?: string; captions?: string; family?: string; aspect?: string } }>('/api/projects/:pid/frame', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const st = p.open.state;
      const sc = st.scenes[req.query.scene];
      if (!sc) throw new FrameError('NOT_FOUND', `Scene ${req.query.scene} not found`);
      const t = Math.max(0, Math.min(sc.duration - 1, Number(req.query.t ?? 0)));
      const width = Math.min(3840, Number(req.query.width ?? st.project.output.width));
      const height = Math.min(2160, Number(req.query.height ?? st.project.output.height));
      const family = req.query.family === 'flat' || req.query.family === 'illustrated' ? req.query.family : undefined;
      const lib = library(p);
      const ev = evaluateFrame(st, sc.id, t, { assets: { manifest: (r) => lib.manifest(r) }, styles, width, height, captions: req.query.captions === 'true', ...(family ? { family } : {}), ...(req.query.aspect ? { aspect: req.query.aspect } : {}) });
      const png = (await getRenderer()).png(ev.frame);
      return reply.header('content-type', 'image/png').header('x-frame-revision', String(p.open.session.revision)).send(Buffer.from(png));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Every manifest a scene's evaluation touches (recorded while evaluating key times), so browser previews render
  // synchronously with the same data as the server and CLI.
  app.get<{ Params: { pid: string }; Querystring: { scene: string } }>('/api/projects/:pid/scene-assets', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const st = p.open.state;
      const sc = st.scenes[req.query.scene];
      if (!sc) throw new FrameError('NOT_FOUND', `Scene ${req.query.scene} not found`);
      const lib = library(p);
      const used = new Map<string, unknown>();
      const assets = { manifest: (r: string) => {
        const m = lib.manifest(r);
        if (m) used.set(r, m);
        return m;
      } };
      const times = new Set<number>([0]);
      for (const c of sc.clips) {
        times.add(c.start);
        times.add(Math.floor((c.start + c.end) / 2));
        if (c.asset) assets.manifest(c.asset);
      }
      for (const i of sc.instances) if (i.asset) assets.manifest(i.asset);
      if (st.project.captions.style) assets.manifest(st.project.captions.style);
      for (const family of ['flat', 'illustrated'] as const) {
        for (const t of times) if (t < sc.duration) evaluateFrame(st, sc.id, t, { assets, styles, width: 64, height: 36, captions: true, family });
      }
      return { revision: p.open.session.revision, manifests: Object.fromEntries(used) };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Files inside a project folder (render outputs for the in-app player, FR-RND-07); byte ranges for seeking.
  app.get<{ Params: { pid: string }; Querystring: { path: string } }>('/api/projects/:pid/files', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const f = path.resolve(p.root, req.query.path ?? '');
      const rel = path.relative(p.root, f);
      if (!req.query.path || rel.startsWith('..') || path.isAbsolute(rel)) throw new FrameError('PERMISSION_REQUIRED', 'Only files inside the project folder can be served');
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) throw new FrameError('NOT_FOUND', `${rel} not found`);
      const size = fs.statSync(f).size;
      const type = MIME[path.extname(f).slice(1).toLowerCase()] ?? (f.endsWith('.srt') || f.endsWith('.vtt') || f.endsWith('.txt') ? 'text/plain; charset=utf-8' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream');
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
      reply.header('content-type', type).header('accept-ranges', 'bytes');
      if (m && (m[1] || m[2])) {
        const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
        const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
        if (start > end || start >= size) return reply.code(416).header('content-range', `bytes */${size}`).send();
        return reply.code(206).header('content-range', `bytes ${start}-${end}/${size}`).header('content-length', String(end - start + 1)).send(fs.createReadStream(f, { start, end }));
      }
      return reply.header('content-length', String(size)).send(fs.createReadStream(f));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- media (FR-DAT-07) */
  app.get<{ Params: { pid: string; hash: string } }>('/api/projects/:pid/media/:hash', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      // Project media, or bundled content media (library sounds) by the same content address.
      const f = p.open.store.findMedia(req.params.hash) ?? bundledMediaFile(o.contentDir, req.params.hash);
      if (!f) throw new FrameError('NOT_FOUND', `Media ${req.params.hash} not found`);
      const ext = path.extname(f).slice(1);
      return reply.header('content-type', MIME[ext] ?? 'application/octet-stream').header('cache-control', 'private, max-age=31536000, immutable').send(fs.createReadStream(f));
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string }; Querystring: { ext?: string }; Body: Buffer }>('/api/projects/:pid/media', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const ext = (req.query.ext ?? '').toLowerCase();
      if (!/^[a-z0-9]{1,8}$/.test(ext)) throw new FrameError('USAGE', 'ext query parameter is required (e.g. ?ext=wav)');
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw new FrameError('USAGE', 'Send the file bytes as the request body');
      return p.open.store.putMedia(new Uint8Array(req.body), { ext, mime: MIME[ext] ?? String(req.headers['content-type'] ?? 'application/octet-stream') });
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- library (FR-AST) */
  app.get<{ Querystring: { q?: string; kind?: string; limit?: string; project?: string; scene?: string; instance?: string; family?: string; view?: string; source?: string } }>('/api/library', async (req, reply) => {
    try {
      const p = req.query.project ? hub.get(req.query.project) : undefined;
      const lib = library(p);
      const limit = req.query.limit === 'all' ? Infinity : Math.min(500, Number(req.query.limit ?? 100));
      // Compatibility with the selection (FR-AST-04): the project's family and, with an instance, its character.
      const inst = p && req.query.scene && req.query.instance ? p.open.state.scenes[req.query.scene]?.instances.find((i) => i.id === req.query.instance) : undefined;
      const charMan = inst?.kind === 'character' && inst.asset ? lib.manifest(inst.asset) : undefined;
      const target: CompatTarget | undefined = p ? { family: p.open.state.project.styleFamily, ...(charMan && inst?.character ? { character: { manifest: charMan, view: inst.character.view, posture: inst.character.posture } } : {}) } : undefined;
      const hits = lib.search(req.query.q ?? '', {
        ...(req.query.kind ? { kind: req.query.kind } : {}), ...(target ? { compatible: (m) => compatibility(m, target) } : {}),
        ...(req.query.family === 'flat' || req.query.family === 'illustrated' ? { family: req.query.family } : {}),
        ...(['front', 'three', 'side', 'back'].includes(req.query.view ?? '') ? { view: req.query.view as View } : {}),
        ...(['bundled', 'user', 'project', 'imported'].includes(req.query.source ?? '') ? { source: req.query.source as 'bundled' } : {}),
      }).slice(0, limit);
      return { results: hits.map(({ manifest: m, source, incompatible }) => ({ ref: `${m.id}@${m.version}`, source: m.id.startsWith('user.') && p?.open.state.assets[`${m.id}@${m.version}`] ? 'project' : source, preview: previewable(m.kind), ...(incompatible ? { incompatible } : {}), id: m.id, version: m.version, kind: m.kind, name: m.name, category: m.category, group: m.group, tags: m.tags, families: m.families, views: m.views, capabilities: m.capabilities })) };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.get<{ Querystring: { ref: string; project?: string } }>('/api/library/manifest', async (req, reply) => {
    try {
      const p = req.query.project ? hub.get(req.query.project) : undefined;
      const m = library(p).manifest(req.query.ref);
      if (!m) throw new FrameError('NOT_FOUND', `Asset ${req.query.ref} not found`);
      return m;
    } catch (e) {
      return sendError(reply, e);
    }
  });
  /* ---------------------------------------------------------------- part editor (FR-PED-02/05) */
  app.post<{ Params: { pid: string }; Body: PartSaveRequest & { dryRun?: boolean } }>('/api/projects/:pid/parts', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const lib = library(p);
      const { manifest, issues, isNew } = partManifest(req.body, { manifest: (r) => lib.manifest(r) as AssetManifest | undefined, versions: (id) => lib.versions(id).map((m) => m.version) }, { newId: () => `user.${randomUUID()}`, author: sourceOf(req) === 'user' ? 'Studio user' : sourceOf(req), date: new Date().toISOString().slice(0, 10) });
      const ref = `${manifest.id}@${manifest.version}`;
      const draft = manifest.tags.includes('draft');
      const r = p.open.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest } }] as never, source: sourceOf(req), label: `${draft ? 'Save draft' : 'Save part'} ${manifest.name}${isNew ? '' : ` version ${manifest.version}`}` }, { dryRun: req.body.dryRun === true });
      return { ref, isNew, draft, issues, revision: r.revision, dryRun: r.dryRun };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- user library and preferences (FR-AST-01/06) */
  const userLib = () => {
    if (!o.userDir) throw new FrameError('UNSUPPORTED', 'No user library folder is configured for this server', undefined, 'Start the server with `frame server start` (uses ~/.frame/library or FRAME_USER_DIR).');
    return new UserLibrary(o.userDir);
  };
  app.get('/api/user/prefs', async (_req, reply) => {
    try {
      return userLib().prefs();
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.put<{ Body: { favourites: string[]; collections: { id: string; name: string; items: string[] }[] } }>('/api/user/prefs', async (req, reply) => {
    try {
      return userLib().setPrefs({ favourites: req.body?.favourites ?? [], collections: req.body?.collections ?? [] });
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Keeps project assets (characters, voices, imports) in the user library for other projects.
  app.post<{ Params: { pid: string }; Body: { refs: string[] } }>('/api/projects/:pid/library/save', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      return userLib().saveFromProject(p.open, library(p), req.body?.refs ?? []);
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Copies user-library assets (and their media) into the project before they are used, so it stays self-contained.
  app.post<{ Params: { pid: string }; Body: { refs: string[] } }>('/api/projects/:pid/library/adopt', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const cmds = userLib().adoptCommands(p.open, library(p), req.body?.refs ?? []);
      if (!cmds.length) return { added: [], revision: p.open.session.revision };
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: `Use ${cmds.length} asset(s) from my library` });
      return { added: cmds.map((c) => { const m = c.params.manifest as AssetManifest; return `${m.id}@${m.version}`; }), revision: r.revision };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- file import (FR-IMP-01/02) */
  app.post<{ Params: { pid: string }; Querystring: { name: string; rights: string; licence?: string; attribution?: string; scene?: string; as?: string; at?: string; x?: string; y?: string; dryRun?: string }; Body: Buffer }>('/api/projects/:pid/import', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!Buffer.isBuffer(req.body)) throw new FrameError('USAGE', 'Send the file bytes as application/octet-stream');
      const q = req.query;
      const n = (v?: string) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
      const res = importFile(p.open, new Uint8Array(req.body), {
        fileName: String(q.name ?? ''), rights: q.rights as RightsStatement, author: sourceOf(req) === 'user' ? 'Studio user' : sourceOf(req), source: sourceOf(req),
        ...(q.licence ? { licence: q.licence } : {}), ...(q.attribution ? { attribution: q.attribution } : {}),
        ...(q.scene ? { scene: q.scene } : {}), ...(q.as ? { as: q.as as never } : {}),
        ...(n(q.at) !== undefined ? { at: n(q.at)! } : {}), ...(n(q.x) !== undefined ? { x: n(q.x)! } : {}), ...(n(q.y) !== undefined ? { y: n(q.y)! } : {}),
        dryRun: q.dryRun === 'true',
      });
      return res;
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- automatic performance (FR-ACT-07/08) */
  // Regenerates talking gestures and listening reactions as editable `auto` clips for a scene's characters.
  app.post<{ Params: { pid: string; sid: string }; Body: { instances?: string[]; kinds?: ('talking' | 'listening')[]; dryRun?: boolean } }>('/api/projects/:pid/scenes/:sid/auto-performance', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!p.open.state.scenes[req.params.sid]) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      const kinds = req.body?.kinds?.filter((k) => k === 'talking' || k === 'listening');
      const cmds = autoPerformanceForLibrary(p.open.state, req.params.sid, library(p), { ...(req.body?.instances ? { instances: req.body.instances } : {}), ...(kinds?.length ? { kinds } : {}) });
      if (!cmds.length) return { revision: p.open.session.revision, added: 0, removed: 0 };
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: 'Automatic performance' }, { dryRun: !!req.body?.dryRun });
      return { revision: r.revision, added: cmds.filter((c) => c.name === 'clip.add').length, removed: cmds.filter((c) => c.name === 'clip.remove').reduce((n, c) => n + (c.params.ids as string[]).length, 0) };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- interactions and sound cues (FR-PRP-02, FR-SND-04) */
  // Props in the scene a character can use, with the library actions that fit each one.
  app.get<{ Params: { pid: string; sid: string } }>('/api/projects/:pid/scenes/:sid/interactions', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const scene = p.open.state.scenes[req.params.sid];
      if (!scene) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      const lib = library(p);
      const acts = lib.byKind('act').map((e) => ({ ref: `${e.manifest.id}@${e.manifest.version}`, name: e.manifest.name, action: (e.manifest.data as { action?: ActionData }).action })).filter((a) => a.action);
      const props = scene.instances.filter((i) => i.kind === 'prop' && i.asset).map((i) => {
        const m = lib.manifest(i.asset!);
        const fit = m ? acts.filter((a) => actionFitsProp(a.action!, m as never)) : [];
        return { prop: i.id, name: i.name, actions: fit.map((a) => ({ ref: a.ref, name: a.name, durationS: a.action!.duration })) };
      }).filter((x) => x.actions.length);
      return { props };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Regenerates sound cues (action and prop-state events) as editable `auto` SFX clips.
  app.post<{ Params: { pid: string; sid: string } }>('/api/projects/:pid/scenes/:sid/sound-cues', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!p.open.state.scenes[req.params.sid]) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      const cmds = soundCueCommands(p.open.state, req.params.sid, library(p));
      if (!cmds.length) return { revision: p.open.session.revision, cues: 0 };
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: 'Sound cues' });
      return { revision: r.revision, cues: cmds.filter((c) => c.name === 'clip.add').length };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- recipes, coverage and framing (FR-RCP, FR-CAM-01/04/05) */
  app.post<{ Params: { pid: string; sid: string }; Body: { ref: string; roles: Record<string, string>; at?: number; line?: string; dryRun?: boolean } }>('/api/projects/:pid/scenes/:sid/recipes/apply', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? ({} as never);
      if (!p.open.state.scenes[req.params.sid]) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      const ex = recipeCommandsForLibrary(p.open.state, req.params.sid, String(b.ref ?? ''), { roles: b.roles ?? {}, ...(b.at !== undefined ? { at: Math.round(Number(b.at)) } : {}), ...(b.line ? { line: b.line } : {}) }, { lib: library(p), styles });
      if (!ex.commands.length) throw new FrameError('USAGE', `Nothing to add${ex.warnings.length ? `: ${ex.warnings.join('; ')}` : ''}`);
      const r = p.open.session.apply({ commands: ex.commands as never, source: sourceOf(req), label: `Apply ${library(p).manifest(b.ref)?.name ?? 'recipe'}` }, { dryRun: !!b.dryRun });
      return { revision: r.revision, group: ex.group, start: ex.start, end: ex.end, warnings: ex.warnings, clips: ex.commands.filter((c) => c.name === 'clip.add').length };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Saves selected clips as a project recipe with role placeholders (FR-RCP-04); "Save to my library" keeps it.
  app.post<{ Params: { pid: string; sid: string }; Body: { clips: string[]; name: string } }>('/api/projects/:pid/scenes/:sid/recipes/save', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? ({} as never);
      if (!b.name?.trim()) throw new FrameError('USAGE', 'Name the recipe');
      let data;
      try {
        data = recipeFromClips(p.open.state, req.params.sid, b.clips ?? []);
      } catch (e) {
        throw new FrameError('USAGE', (e as Error).message);
      }
      const id = `user.${randomUUID()}`;
      const manifest = {
        schemaVersion: 1, id, version: 1, kind: 'rcp', name: b.name.trim(), category: 'Performance recipes', group: 'My recipes', tags: ['recipe', 'mine'], synonyms: [], families: ['flat', 'illustrated'], views: [], viewExemptions: {}, anchors: {}, capabilities: [], parameters: [], dependencies: [], layering: {}, previews: {},
        license: { id: 'LicenseRef-User-Owned', redistributable: true, commercialUse: true }, provenance: { method: 'authored', author: sourceOf(req), date: new Date().toISOString().slice(0, 10), notes: 'Saved from a selection of clips (FR-RCP-04).' }, data: { recipe: data },
      };
      const r = p.open.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest } }] as never, source: sourceOf(req), label: `Save recipe ${b.name.trim()}` });
      return { ref: `${id}@1`, revision: r.revision, roles: data.roles };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string; sid: string } }>('/api/projects/:pid/scenes/:sid/coverage', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!p.open.state.scenes[req.params.sid]) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      if (!libraryDefaults.coverage) throw new FrameError('NOT_FOUND', 'The content library defines no coverage framings');
      const cmds = autoCoverageForLibrary(p.open.state, req.params.sid, { lib: library(p), styles, framings: libraryDefaults.coverage });
      if (!cmds.length) throw new FrameError('USAGE', 'Nothing to cover: the scene has no lines yet');
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: 'Automatic coverage' });
      return { revision: r.revision, shots: cmds.filter((c) => c.name === 'clip.add').length };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string; sid: string }; Body: { preset: string; subjects: string[]; camera?: string; name?: string; at?: number } }>('/api/projects/:pid/scenes/:sid/cameras/frame', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? ({} as never);
      if (!p.open.state.scenes[req.params.sid]) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      const cmd = frameCameraCommand(p.open.state, req.params.sid, String(b.preset ?? ''), b.subjects ?? [], Math.round(Number(b.at ?? 0)), { lib: library(p), styles, ...(b.camera ? { camera: b.camera } : {}), ...(b.name ? { name: b.name } : {}) });
      const r = p.open.session.apply({ commands: [cmd] as never, source: sourceOf(req), label: b.camera ? 'Reframe camera' : `Add ${String(cmd.params.name)}` });
      return { revision: r.revision, camera: b.camera ?? r.commands[0]!.params.id };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- clipboard (FR-PER-07) */
  app.post<{ Params: { pid: string; sid: string }; Body: { data: ClipboardData; at?: number } }>('/api/projects/:pid/scenes/:sid/paste', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const data = req.body?.data;
      if (!data || data.format !== CLIPBOARD_FORMAT) throw new FrameError('USAGE', 'Nothing to paste (not Frame clipboard data)');
      // Media from another open project is copied in; media already here is kept.
      const missingMedia: string[] = [];
      const source = data.project !== p.id ? hub.list().find((x) => x.id === data.project) : undefined;
      for (const h of data.media) {
        if (p.open.store.findMedia(h)) continue;
        const f = source?.open.store.findMedia(h);
        if (f) p.open.store.putMedia(new Uint8Array(fs.readFileSync(f)), { ext: path.extname(f).slice(1), mime: 'application/octet-stream' });
        else missingMedia.push(h);
      }
      const r = pasteCommands(p.open.state, req.params.sid, data, { newId: randomId, ...(req.body.at !== undefined ? { at: req.body.at } : {}) });
      if (!r.commands.length) throw new FrameError('USAGE', r.warnings[0] ?? 'Nothing to paste here');
      const applied = p.open.session.apply({ commands: r.commands, source: sourceOf(req), label: 'Paste' });
      return { revision: applied.revision, instances: r.instances, clips: r.clips, warnings: [...r.warnings, ...(missingMedia.length ? [`${missingMedia.length} media file(s) were not found; relink them from Problems`] : [])] };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- project settings (FR-PRJ-05) */
  app.get<{ Params: { pid: string }; Querystring: { family?: string } }>('/api/projects/:pid/style-check', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const family = req.query.family;
      if (family !== 'flat' && family !== 'illustrated') throw new FrameError('USAGE', 'family must be flat or illustrated');
      return { family, blockers: styleFamilyBlockers(p.open.state, lockLookup(), family) };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- script (FR-PRJ-04, FR-DLG-01) */
  app.get<{ Params: { pid: string }; Querystring: { format?: string } }>('/api/projects/:pid/script', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const name = p.open.state.project.name.replace(/[^\w .-]/g, '_');
      if (req.query.format === 'pdf') {
        reply.header('content-type', 'application/pdf');
        reply.header('content-disposition', `attachment; filename="${name}.pdf"`);
        return reply.send(Buffer.from(scriptPdf(p.open.state)));
      }
      const format = req.query.format === 'fountain' ? 'fountain' : req.query.format === 'text' ? 'text' : undefined;
      if (!format) return { rows: scriptRows(p.open.state) };
      reply.header('content-type', 'text/plain; charset=utf-8');
      reply.header('content-disposition', `attachment; filename="${name}.${format === 'fountain' ? 'fountain' : 'txt'}"`);
      return scriptText(p.open.state, format);
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string; sid: string }; Body: { text: string; dryRun?: boolean } }>('/api/projects/:pid/scenes/:sid/script/import', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? ({} as never);
      if (!p.open.state.scenes[req.params.sid]) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      const parsed = parseScript(String(b.text ?? ''));
      if (!parsed.length) throw new FrameError('USAGE', 'No dialogue found', undefined, 'Write one line per speaker as "NAME: line", or use Fountain.');
      const r = scriptImportCommands(p.open.state, req.params.sid, parsed);
      if (r.unknown.length && !r.lines) throw new FrameError('VALIDATION_FAILED', `No character in this scene is called ${r.unknown.join(', ')}`, { unknown: r.unknown }, 'Add the characters first, or rename the speakers.');
      const applied = p.open.session.apply({ commands: r.commands as never, source: sourceOf(req), label: `Import script (${r.lines} lines)` }, { dryRun: !!b.dryRun });
      return { revision: applied.revision, lines: r.lines, unknown: r.unknown, ids: applied.commands.filter((c) => c.name === 'line.add').map((c) => c.params.id) };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- production templates (FR-TPL-01..03) */
  app.post<{ Params: { pid: string }; Body: { ref: string; episode?: string; cast?: Record<string, string>; looks?: Record<string, string>; name?: string } }>('/api/projects/:pid/templates/apply', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? ({} as never);
      const episode = b.episode ?? p.open.state.project.episodes[0];
      if (!episode || !p.open.state.episodes[episode]) throw new FrameError('NOT_FOUND', `Episode ${episode} not found`);
      const ex = templateCommandsForLibrary(p.open.state, episode, String(b.ref ?? ''), { ...(b.cast ? { cast: b.cast } : {}), ...(b.looks ? { looks: b.looks } : {}), ...(b.name ? { name: b.name } : {}) }, { lib: library(p), styles });
      const r = p.open.session.apply({ commands: ex.commands as never, source: sourceOf(req), label: `New scene from ${library(p).manifest(b.ref)?.name ?? 'template'}` });
      return { revision: r.revision, scene: ex.sceneId, instances: ex.ids };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Saves a scene as a project template (FR-TPL-02); "Save to my library" keeps it for other projects.
  app.post<{ Params: { pid: string; sid: string }; Body: { name: string; scope?: 'scene' | 'episode' } }>('/api/projects/:pid/scenes/:sid/templates/save', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? ({} as never);
      if (!b.name?.trim()) throw new FrameError('USAGE', 'Name the template');
      const st = p.open.state;
      if (!st.scenes[req.params.sid]) throw new FrameError('NOT_FOUND', `Scene ${req.params.sid} not found`);
      // A scene, or every scene of its episode as a project template (FR-TPL-02).
      const data = b.scope === 'episode' ? templateFromScenes(st, st.episodes[st.sceneEpisode[req.params.sid]!]!.scenes) : templateFromScene(st, req.params.sid);
      const id = `user.${randomUUID()}`;
      const manifest = {
        schemaVersion: 1, id, version: 1, kind: 'tpl', name: b.name.trim(), category: 'Production templates', group: 'My templates', tags: ['template', 'mine'], synonyms: [], families: ['flat', 'illustrated'], views: [], viewExemptions: {}, anchors: {}, capabilities: [], parameters: [], dependencies: [], layering: {}, previews: {},
        license: { id: 'LicenseRef-User-Owned', redistributable: true, commercialUse: true }, provenance: { method: 'authored', author: sourceOf(req), date: new Date().toISOString().slice(0, 10), notes: 'Saved from a scene (FR-TPL-02).' }, data: { template: data },
      };
      const r = p.open.session.apply({ commands: [{ name: 'asset.addLocal', params: { manifest } }] as never, source: sourceOf(req), label: `Save template ${b.name.trim()}` });
      return { ref: `${id}@1`, revision: r.revision, roles: data.roles.map((x) => ({ key: x.key, label: x.label })) };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string; sid: string }; Body: { instance: string; character: string; look?: string } }>('/api/projects/:pid/scenes/:sid/cast/replace', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? ({} as never);
      const cmds = replaceCastCommands(p.open.state, req.params.sid, String(b.instance ?? ''), String(b.character ?? ''), { lib: library(p), styles, ...(b.look ? { look: b.look } : {}) });
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: `Recast as ${library(p).manifest(b.character)?.name ?? 'character'}` });
      return { revision: r.revision, reframed: cmds.filter((c) => c.name === 'camera.update').length };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- rigging assistant (FR-IMP-03) */
  // Reads layered artwork, stores raster layers as media and returns layers with suggested rig targets.
  app.post<{ Params: { pid: string }; Querystring: { name: string }; Body: Buffer }>('/api/projects/:pid/rigging/read', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!Buffer.isBuffer(req.body)) throw new FrameError('USAGE', 'Send the PSD or SVG bytes as application/octet-stream');
      const art = readLayeredArtwork(new Uint8Array(req.body), String(req.query.name ?? 'artwork'));
      const layers = art.layers.map((l) => ({
        id: l.id, name: l.name, ...(l.view ? { view: l.view } : {}), ...(l.group ? { group: l.group } : {}), hidden: l.hidden, bounds: l.bounds,
        ...(l.png ? { media: p.open.store.putMedia(l.png, { ext: 'png', mime: 'image/png', width: Math.round(l.bounds[2]), height: Math.round(l.bounds[3]) }).hash } : {}),
        ...(l.paths ? { paths: l.paths } : {}),
        suggestion: suggestTarget(l.name),
        propSuggestion: suggestPropTarget(l),
        planeSuggestion: suggestPlane(l),
      }));
      return { fileName: art.fileName, source: art.source, width: art.width, height: art.height, views: art.views, layers, warnings: art.warnings, targets: RIG_TARGETS.map((t) => ({ value: t, label: RIG_TARGET_LABELS[t] })), planes: [...SET_PLANES, 'ignore' as const].map((t) => ({ value: t, label: SET_PLANE_LABELS[t] })) };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Props with states and location kits (FR-IMP-03): dry run returns the manifest; save adds it and can place it.
  const buildObject = (p: ReturnType<typeof hub.get>, b: RigBuildBody, source: string) => {
    const common = { name: b.name.trim(), layers: b.layers ?? [], mapping: (b.mapping ?? {}) as Record<string, string>, newId: () => randomUUID(), author: source, date: new Date().toISOString().slice(0, 10), sourceFile: String(b.fileName ?? ''), rights: b.rights };
    const out = p.open.state.project.output;
    const res = b.kind === 'prop'
      ? { ...rigProp({ ...common, ...(b.height ? { height: Number(b.height) } : {}) }), pieces: undefined }
      : { ...rigSet({ ...common, width: Number(b.width ?? 0), height: Number(b.artHeight ?? 0), output: { width: out.width, height: out.height } }), states: undefined };
    const errors = res.problems.filter((x) => x.severity === 'error');
    if (!b.save) return { kind: b.kind, asset: res.asset, mapping: res.mapping, problems: res.problems, states: res.states ?? null, pieces: res.pieces ?? null, ok: errors.length === 0 };
    if (errors.length) throw new FrameError('VALIDATION_FAILED', `The ${b.kind} cannot be saved yet: ${errors.map((e) => e.message).join('; ')}`, { problems: errors });
    const ref = `${res.asset.id}@1`;
    const cmds: { name: string; params: Record<string, unknown> }[] = [{ name: 'asset.addLocal', params: { manifest: res.asset } }];
    const instances: string[] = [];
    if (b.place && b.kind === 'prop') {
      instances.push(randomId('ins'));
      cmds.push({ name: 'instance.add', params: { scene: b.place.scene, id: instances[0], kind: 'prop', asset: ref, name: res.asset.name, transform: { x: b.place.x ?? out.width / 2, y: b.place.y ?? out.height * 0.92 } } });
    } else if (b.place) {
      for (const x of res.pieces ?? []) {
        const id = randomId('ins');
        instances.push(id);
        cmds.push({ name: 'instance.add', params: { scene: b.place.scene, id, kind: 'set-piece', asset: ref, name: x.name, transform: { x: x.at[0], y: x.at[1] }, depthPlane: x.plane, params: { part: x.key } } });
      }
    }
    const r = p.open.session.apply({ commands: cmds as never, source, label: `Rig ${res.asset.name}` });
    return { ref, instances, revision: r.revision };
  };
  // Builds the character from mapped layers: a dry run returns the manifests and the rig check; save adds them.
  app.post<{ Params: { pid: string }; Body: RigBuildBody }>('/api/projects/:pid/rigging/build', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body;
      if (!b?.name?.trim()) throw new FrameError('USAGE', 'Name the character');
      if (!b.rights?.trim()) throw new FrameError('USAGE', 'State your rights to the artwork', undefined, 'Imports record a statement of rights (FR-IMP-02).');
      for (const l of b.layers ?? []) if (l.media && !p.open.store.findMedia(l.media)) throw new FrameError('NOT_FOUND', `Layer ${l.name} media is missing; read the artwork again`);
      const lib = library(p);
      if (b.kind === 'prop' || b.kind === 'set') return buildObject(p, b, sourceOf(req));
      for (const ref of Object.values(b.libraryParts ?? {})) if (ref && !lib.has(ref)) throw new FrameError('NOT_FOUND', `${ref} is not in the library`);
      const res = rigArtwork({ name: b.name.trim(), layers: b.layers ?? [], mapping: (b.mapping ?? {}) as Record<string, RigTarget>, libraryParts: b.libraryParts ?? {}, newId: () => randomUUID(), author: sourceOf(req), date: new Date().toISOString().slice(0, 10), sourceFile: String(b.fileName ?? ''), rights: b.rights });
      const local = new Map([...res.parts, res.character].map((m) => [`${m.id}@${m.version}`, m]));
      const look = (r: string) => local.get(r) ?? (lib.manifest(r) as AssetManifest | undefined);
      const check = checkCharacter(res.character, look, lib.byKind('act').map((x) => x.manifest));
      const errors = [...res.problems.filter((x) => x.severity === 'error'), ...check.problems.filter((x) => x.severity === 'error')];
      if (!b.save) return { ...res, check, ok: errors.length === 0 };
      if (errors.length) throw new FrameError('VALIDATION_FAILED', `The character cannot be saved yet: ${errors.map((e) => e.message).join('; ')}`, { problems: errors });
      const ref = `${res.character.id}@1`;
      const cmds: { name: string; params: Record<string, unknown> }[] = [...res.parts, res.character].map((manifest) => ({ name: 'asset.addLocal', params: { manifest } }));
      cmds.push({ name: 'cast.add', params: { character: ref, name: res.character.name } });
      let instance: string | undefined;
      if (b.place) {
        instance = randomId('ins');
        cmds.push({ name: 'instance.add', params: { scene: b.place.scene, id: instance, kind: 'character', asset: ref, name: res.character.name, transform: { x: b.place.x ?? 960, y: b.place.y ?? 1000 }, character: { look: 'default', view: res.views[0], posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } });
      }
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: `Rig ${res.character.name}` });
      return { ref, instance: instance ?? null, revision: r.revision, views: res.views };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- packages (FR-DAT-10/11, FR-IMP-04) */
  const download = (reply: FastifyReply, bytes: Uint8Array, name: string) =>
    reply.header('content-type', 'application/zip').header('content-disposition', `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, '-')}"`).send(Buffer.from(bytes));
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
  app.get<{ Params: { pid: string }; Querystring: { format: string; refs: string } }>('/api/projects/:pid/packages/export', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const format = req.query.format as Exclude<PackageFormat, 'frameproj'>;
      if (!['framechar', 'frameasset', 'framevoice'].includes(format)) throw new FrameError('USAGE', 'format must be framechar, frameasset or framevoice');
      const refs = String(req.query.refs ?? '').split(',').filter(Boolean);
      const lib = library(p);
      const bytes = exportAssetsFromProject(p.open, lib, format, refs, { appVersion: SERVER_VERSION });
      const unresolved = unresolvedReferences(refs, projectAssetSource(lib, p.open));
      if (unresolved.length) reply.header('x-frame-unresolved', unresolved.join(','));
      return download(reply, bytes, `${slug(lib.manifest(refs[0]!)?.name ?? 'export')}${PACKAGE_EXTENSIONS[format]}`);
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string }; Querystring: { onConflict?: string; expect?: string; dryRun?: string }; Body: Buffer }>('/api/projects/:pid/packages/import', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!Buffer.isBuffer(req.body)) throw new FrameError('USAGE', 'Send the package bytes as application/zip');
      const expect = (req.query.expect ? req.query.expect.split(',') : ['framechar', 'frameasset', 'framevoice']) as PackageFormat[];
      const r = importAssetsIntoProject(p.open, library(p), new Uint8Array(req.body), { expect, onConflict: req.query.onConflict === 'new-id' ? 'new-id' : 'refuse', dryRun: req.query.dryRun === 'true', source: sourceOf(req) });
      return { ...r.report, revision: r.revision };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.get<{ Params: { pid: string } }>('/api/projects/:pid/package', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const bytes = exportProjectFromOpen(p.open, library(p), { appVersion: SERVER_VERSION });
      return download(reply, bytes, `${slug(p.open.state.project.name)}.frameproj`);
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Querystring: { path: string; allowMissing?: string }; Body: Buffer }>('/api/projects/import-package', async (req, reply) => {
    try {
      if (!req.query.path) throw new FrameError('USAGE', 'path is required');
      if (!Buffer.isBuffer(req.body)) throw new FrameError('USAGE', 'Send the package bytes as application/zip');
      const lib = library();
      const bundledHash = (ref: string) => {
        const e = lib.get(ref);
        return e?.source === 'bundled' ? manifestHash(e.manifest) : undefined;
      };
      const res = importProjectPackage(new Uint8Array(req.body), req.query.path, { bundledHash }, { allowMissing: req.query.allowMissing === 'true' });
      const p = hub.open(res.root);
      return { id: p.id, root: p.root, revision: p.open.session.revision, name: p.open.state.project.name, missing: res.missing };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Asset details (FR-AST-05): versions with their changes, where the asset is used in the project, licence and
  // provenance, and the rig check for parts (FR-AST-08).
  app.get<{ Querystring: { ref: string; project?: string } }>('/api/library/details', async (req, reply) => {
    try {
      const p = req.query.project ? hub.get(req.query.project) : undefined;
      const lib = library(p);
      const e = lib.get(req.query.ref);
      if (!e) throw new FrameError('NOT_FOUND', `Asset ${req.query.ref} not found`);
      const m = e.manifest;
      const part = (m.data as { families?: unknown } | undefined)?.families ? (m.data as PartData) : undefined;
      const { data: _d, ...meta } = m;
      return {
        ref: req.query.ref, source: p && m.id.startsWith('user.') && p.open.state.assets[req.query.ref] ? 'project' : e.source, manifest: meta,
        latest: lib.latestRef(m.id), hash: manifestHash(m),
        versions: lib.versions(m.id).map((v) => ({ version: v.version, ref: `${v.id}@${v.version}`, changes: v.changes ?? null, date: v.provenance.date, draft: v.tags.includes('draft') })),
        usages: p ? assetUsages(p.open.state, m.id) : [],
        rigCheck: part ? rigCheck(part) : null,
      };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Manifests that failed validation and were left out of the library (FR-AST-02).
  app.get<{ Querystring: { project?: string } }>('/api/library/problems', async (req) => {
    const p = req.query.project ? hub.get(req.query.project) : undefined;
    return { problems: library(p).problems };
  });
  app.get('/api/styles', async () => styles);

  // Thumbnails (FR-AST-07): the item on the library's preview character, rendered with the export renderer and cached.
  const libraryDefaults = (() => {
    try {
      return (JSON.parse(fs.readFileSync(path.join(o.contentDir, 'library.json'), 'utf8')) as { defaults?: { previewCharacter?: string; output?: OutputSettings; frameRate?: number; styleFamily?: StyleFamily; captionStyle?: string; coverage?: CoverageFramings } }).defaults ?? {};
    } catch {
      return {};
    }
  })();
  // Library defaults the Studio reads (builder test sets, preview character); content, not code (FR-ARC-06).
  app.get('/api/library/defaults', async () => libraryDefaults);
  const thumbs = new Map<string, Buffer>();
  const thumbDir = o.cacheDir ? path.join(o.cacheDir, 'thumbnails') : o.userDir ? path.join(path.dirname(o.userDir), 'cache', 'thumbnails') : undefined;
  /* ---------------------------------------------------------------- app settings (FR-SET-01) */
  app.get('/api/settings', async () => {
    const s = appSettings.read();
    const { workerToken, ...rest } = s;
    const size = (dir?: string): number => {
      if (!dir || !fs.existsSync(dir)) return 0;
      let n = 0;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size;
      return n;
    };
    return {
      settings: { ...rest, workerTokenSet: !!workerToken },
      effective: { workerUrl: s.workerUrl || o.workerUrl || null, autosaveMs: s.autosaveMs ?? o.debounceMs ?? 400 },
      paths: { content: o.contentDir, userLibrary: o.userDir ?? null, cache: thumbDir ?? null, settings: appSettings.file ?? null },
      storage: { cacheBytes: size(thumbDir), userLibraryBytes: size(o.userDir) },
      telemetry: 'none',
    };
  });
  app.post<{ Body: Partial<AppSettings> & { clearToken?: boolean } }>('/api/settings', async (req, reply) => {
    try {
      if (req.headers['x-frame-agent']) throw new FrameError('PERMISSION_REQUIRED', 'Agents cannot change app settings');
      const b = req.body ?? {};
      if (b.autosaveMs !== undefined && (!Number.isFinite(b.autosaveMs) || b.autosaveMs < 100 || b.autosaveMs > 60_000)) throw new FrameError('USAGE', 'autosaveMs must be between 100 and 60000');
      if (b.defaultFrameRate !== undefined && ![24, 25, 30].includes(b.defaultFrameRate)) throw new FrameError('USAGE', 'defaultFrameRate must be 24, 25 or 30');
      if (b.workerUrl && !/^https?:\/\//.test(b.workerUrl)) throw new FrameError('USAGE', 'The worker URL must start with http:// or https://');
      const next = appSettings.update({
        ...(b.workerUrl !== undefined ? { workerUrl: b.workerUrl.trim() } : {}),
        ...(b.workerToken ? { workerToken: b.workerToken } : {}),
        ...(b.clearToken ? { workerToken: '' } : {}),
        ...(b.autosaveMs !== undefined ? { autosaveMs: Math.round(b.autosaveMs) } : {}),
        ...(b.defaultFrameRate !== undefined ? { defaultFrameRate: b.defaultFrameRate } : {}),
        ...(b.defaultOutput !== undefined ? { defaultOutput: b.defaultOutput } : {}),
      });
      if (next.autosaveMs) hub.setDebounce(next.autosaveMs);
      const { workerToken, ...rest } = next;
      return { settings: { ...rest, workerTokenSet: !!workerToken } };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post('/api/settings/clear-cache', async (req, reply) => {
    try {
      if (req.headers['x-frame-agent']) throw new FrameError('PERMISSION_REQUIRED', 'Agents cannot clear caches');
      thumbs.clear();
      if (thumbDir) fs.rmSync(thumbDir, { recursive: true, force: true });
      return { cleared: true };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- project browser (FR-PRJ-06) */
  const needRecent = () => {
    if (!recent) throw new FrameError('UNSUPPORTED', 'This server keeps no recent-projects list', undefined, 'Start it with `frame server start` (uses ~/.frame).');
    return recent;
  };
  const knownRoot = (root: string | undefined) => {
    const r = needRecent().list().find((e) => e.root === path.resolve(root ?? ''));
    if (!r) throw new FrameError('NOT_FOUND', `${root} is not in the recent projects list`, undefined, 'Open the folder first.');
    return r;
  };
  app.get('/api/recent', async (_req, reply) => {
    try {
      const open = hub.list();
      return { projects: needRecent().list().map((e) => ({ ...e, open: open.find((p) => p.root === e.root)?.id ?? null })) };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Body: { root: string; pinned?: boolean; forget?: boolean } }>('/api/recent/update', async (req, reply) => {
    try {
      const e = knownRoot(req.body?.root);
      if (req.body.forget) needRecent().forget(e.root);
      else if (req.body.pinned !== undefined) needRecent().update(e.root, { pinned: req.body.pinned });
      return { ok: true };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Body: { root: string; to: string; name?: string } }>('/api/recent/duplicate', async (req, reply) => {
    try {
      const e = knownRoot(req.body?.root);
      if (!req.body.to) throw new FrameError('USAGE', 'to (the new folder) is required');
      // An open project is saved first so the copy holds its latest state.
      hub.list().find((p) => p.root === e.root)?.open.flush();
      const name = req.body.name?.trim() || `${e.name} copy`;
      duplicateProject(e.root, path.resolve(req.body.to), { projectId: randomId('prj'), name });
      const p = hub.open(path.resolve(req.body.to));
      return { id: p.id, root: p.root, name };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Body: { root: string } }>('/api/recent/trash', async (req, reply) => {
    try {
      if (req.headers['x-frame-agent']) throw new FrameError('PERMISSION_REQUIRED', 'Agents cannot delete projects from the browser', undefined, 'A person deletes projects in the Studio.');
      const e = knownRoot(req.body?.root);
      const open = hub.list().find((p) => p.root === e.root);
      if (open) hub.close(open.id);
      const where = moveToTrash(e.root);
      needRecent().forget(e.root);
      return { trashed: e.root, where };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Body: { root: string } }>('/api/recent/reveal', async (req, reply) => {
    try {
      // Only meaningful when the browser runs on the server's machine; loopback-only servers guarantee that.
      revealInFileManager(knownRoot(req.body?.root).root);
      return { ok: true };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.get<{ Querystring: { root: string } }>('/api/recent/thumbnail', async (req, reply) => {
    try {
      const e = knownRoot(req.query.root);
      const file = thumbDir ? path.join(thumbDir, 'projects', `${sha256(Buffer.from(e.root)).slice(-24)}.png`) : undefined;
      const p = hub.list().find((x) => x.root === e.root);
      const sc = p ? p.open.state.scenes[p.open.state.episodes[p.open.state.project.episodes[0] ?? '']?.scenes[0] ?? ''] : undefined;
      if (p && sc) {
        const lib = library(p);
        const ev = evaluateFrame(p.open.state, sc.id, Math.round(sc.duration / 2), { assets: { manifest: (r) => lib.manifest(r) }, styles, width: 320, height: 180 });
        const png = Buffer.from((await getRenderer()).png(ev.frame));
        if (file) writeFileAtomic(file, png);
        return reply.header('content-type', 'image/png').header('cache-control', 'no-cache').send(png);
      }
      if (file && fs.existsSync(file)) return reply.header('content-type', 'image/png').header('cache-control', 'no-cache').send(fs.readFileSync(file));
      throw new FrameError('NOT_FOUND', 'No thumbnail yet; open the project once');
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get<{ Querystring: { ref: string; family?: string; w?: string; h?: string; project?: string } }>('/api/library/thumbnail', async (req, reply) => {
    try {
      const p = req.query.project ? hub.get(req.query.project) : undefined;
      const lib = library(p);
      const ref = req.query.ref;
      const m = lib.manifest(ref);
      if (!m) throw new FrameError('NOT_FOUND', `Asset ${ref} not found`);
      const family = req.query.family === 'illustrated' ? 'illustrated' : 'flat';
      const w = Math.max(16, Math.min(512, Number(req.query.w ?? 96)));
      const h = Math.max(16, Math.min(512, Number(req.query.h ?? w)));
      // Keyed by content, so a changed asset or preview character renders again (FR-AST-07); kept on disk across runs.
      const pc0 = libraryDefaults.previewCharacter;
      const pcm0 = pc0 ? lib.manifest(pc0) : undefined;
      const key = sha256(`${THUMB_VERSION}|${manifestHash(m)}|${pcm0 ? manifestHash(pcm0) : ''}|${family}|${w}x${h}`);
      const file = thumbDir ? path.join(thumbDir, `${key}.png`) : undefined;
      let png = thumbs.get(key) ?? (file && fs.existsSync(file) ? fs.readFileSync(file) : undefined);
      if (!png) {
        const pc = libraryDefaults.previewCharacter;
        const pcm = pc ? lib.manifest(pc) : undefined;
        const setup = previewSetup(ref, m, pc && pcm ? { ref: pc, manifest: pcm } : undefined);
        if (!setup) throw new FrameError('NOT_FOUND', `${ref} has no visual preview`);
        const renderer = await getRenderer();
        const ev = previewFrame(setup, { assets: { manifest: (r) => setup.state.assets[r] ?? lib.manifest(r) }, styles, width: w, height: h, family, captions: true }, (frame) => visibleBox(renderer.rgba(frame), frame.width, frame.height));
        png = Buffer.from(renderer.png(ev.frame));
        if (file) {
          try {
            writeFileAtomic(file, png);
          } catch {
            // The cache is derived data; failing to keep it never fails the request.
          }
        }
      }
      if (thumbs.size > 2000) thumbs.clear();
      thumbs.set(key, png);
      return reply.header('content-type', 'image/png').header('cache-control', 'public, max-age=86400').send(png);
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- jobs (FR-ARC-05) */
  const allJobs = (project?: string) => [...jobs.render.list(project), ...jobs.voice.list(project)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  app.get<{ Querystring: { project?: string } }>('/api/jobs', async (req) => ({ jobs: allJobs(req.query.project).map(publicJob) }));
  app.get<{ Params: { id: string } }>('/api/jobs/:id', async (req, reply) => {
    const j = jobs.render.get(req.params.id) ?? jobs.voice.get(req.params.id);
    return j ? { ...publicJob(j), logs: j.logs } : sendError(reply, new FrameError('NOT_FOUND', `Job ${req.params.id} not found`));
  });
  app.delete<{ Params: { id: string } }>('/api/jobs/:id', async (req) => ({ cancelled: jobs.render.cancel(req.params.id) || jobs.voice.cancel(req.params.id) }));

  /* ---------------------------------------------------------------- render (FR-RND) */
  app.post<{ Params: { pid: string }; Body: { scenes?: string[]; scene?: string; preset?: string; out?: string; range?: { from: number; to: number }; width?: number; height?: number; captions?: boolean; subtitles?: ('srt' | 'vtt')[]; stems?: boolean } }>('/api/projects/:pid/renders', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body ?? {};
      // Snapshot now: edits made while the job runs do not affect it (FR-RND-05).
      const state: ProjectState = p.open.state;
      const revision = p.open.session.revision;
      const scenes = b.scenes ?? [b.scene ?? state.episodes[state.project.episodes[0] ?? '']?.scenes[0] ?? ''];
      for (const s of scenes) if (!state.scenes[s]) throw new FrameError('NOT_FOUND', `Scene ${s} not found`);
      const lib = library(p);
      const presetRef = b.preset ?? state.project.output.preset;
      const base = (lib.manifest(presetRef)?.data as { output?: OutputPreset } | undefined)?.output;
      if (!base) throw new FrameError('NOT_FOUND', `Output preset ${presetRef} not found`);
      const preset: OutputPreset = { ...base, ...(b.subtitles ? { subtitles: b.subtitles } : {}), ...(b.stems ? { stems: true } : {}) };
      const ext = preset.container === 'png' ? '' : preset.container === 'none' ? '.srt' : `.${preset.container}`;
      const name = scenes.length === 1 ? state.scenes[scenes[0]!]!.name : state.project.name;
      if (b.out && req.headers['x-frame-agent'] && path.relative(p.root, path.resolve(p.root, b.out)).startsWith('..')) throw new FrameError('PERMISSION_REQUIRED', 'Agents can only render inside the project folder');
      const out = b.out ? path.resolve(p.root, b.out) : path.join(p.root, state.project.renderDir ?? 'renders', `${name.replace(/[^A-Za-z0-9_-]+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}${ext}`);
      const job = jobs.render.submit('render', `Export · ${name}`, async (ctx) => {
        const report = await renderExport({
          state, revision, scenes, ...(b.range ? { range: b.range } : {}), preset, presetId: presetRef,
          width: b.width ?? base.width ?? state.project.output.width, height: b.height ?? base.height ?? state.project.output.height,
          ...(base.aspect ? { aspect: base.aspect } : {}),
          burnInCaptions: b.captions ?? (state.project.captions.enabled && state.project.captions.burnIn),
          out, assets: { manifest: (r) => lib.manifest(r) }, assetExists: (r) => lib.has(r), mediaExists: (h) => p.open.store.verifyMedia(h), styles, renderer: await getRenderer(),
          resolveAudio: (src) => (src.kind === 'media' ? p.open.store.findMedia(src.hash) ?? bundledMediaFile(o.contentDir, src.hash) : undefined),
          signal: ctx.signal,
          onProgress: (pr) => ctx.progress(pr.phase === 'Rendering' && pr.frames ? (pr.frame ?? 0) / pr.frames * 0.9 : pr.phase === 'Completed' ? 1 : ctx.signal.aborted ? 0 : 0.95, pr.phase === 'Rendering' ? `Rendering frame ${pr.frame} of ${pr.frames} · ${(pr.fps ?? 0).toFixed(0)} fps` : pr.phase),
        });
        if (report.status !== 'completed') throw new FrameError((report.error?.code ?? 'RENDER_FAILED') as ErrorCode, report.error?.message ?? 'Export failed', { report });
        return report;
      }, p.id);
      return reply.code(202).send(publicJob(job));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- voice (FR-VOI, FR-VWK-05, FR-VOI-12) */
  const workerFor = (p?: HubProject) => {
    const s = appSettings.read();
    const url = p?.open.state.project.voiceWorkerUrl || s.workerUrl || o.workerUrl;
    if (!url) throw new FrameError('WORKER_UNAVAILABLE', 'No voice worker is configured', undefined, 'Set the worker URL in Settings, FRAME_WORKER_URL for the server, or a worker URL in project settings.');
    const token = s.workerToken || o.workerToken;
    return new VoiceClient({ url, ...(token ? { token } : {}) });
  };
  const access = (p: HubProject, source = 'user'): ProjectAccess => ({
    state: () => p.open.state as never,
    apply: (commands, label) => p.open.session.apply({ commands, source, ...(label ? { label } : {}) }),
    storeMedia: (bytes, meta) => p.open.store.putMedia(bytes, meta),
    readMedia: (hash) => {
      const f = p.open.store.findMedia(hash);
      if (!f) throw new FrameError('NOT_FOUND', `Media ${hash} not found`);
      return new Uint8Array(fs.readFileSync(f));
    },
    voice: (ref) => library(p).manifest(ref),
  });

  app.get<{ Querystring: { project?: string } }>('/api/worker/status', async (req) => {
    let client: VoiceClient;
    try {
      client = workerFor(req.query.project ? hub.get(req.query.project) : undefined);
    } catch (e) {
      return { state: 'misconfigured', message: (e as FrameError).message, hint: (e as FrameError).hint };
    }
    try {
      const caps = await client.capabilities();
      const busy = jobs.voice.list().filter((j) => j.state === 'running' || j.state === 'queued').length;
      return { state: busy ? 'busy' : 'connected', url: client.url, busy, fixture: caps.fixture, label: sourceLabel(caps), capabilities: caps };
    } catch (e) {
      const fe = e as FrameError;
      return { state: fe.code === 'PERMISSION_REQUIRED' ? 'misconfigured' : 'offline', url: client.url, message: fe.message, hint: fe.hint ?? 'Start the Voice Worker (frame-voice-worker serve).' };
    }
  });

  app.post<{ Params: { pid: string }; Body: { description: string; language?: string; sampleText: string; candidates?: number; seed?: number } }>('/api/projects/:pid/voices/design', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const client = workerFor(p);
      const b = req.body;
      if (!b?.description || !b.sampleText) throw new FrameError('USAGE', 'description and sampleText are required');
      const job = jobs.voice.submit('voice.design', 'Design voice', (ctx) => designCandidates(client, access(p, sourceOf(req)), { description: b.description, language: b.language ?? 'en', sampleText: b.sampleText, candidates: b.candidates ?? 4, ...(b.seed !== undefined ? { seed: b.seed } : {}) }, { signal: ctx.signal, onProgress: (x) => ctx.progress(x.progress, x.message) }), p.id);
      return reply.code(202).send(publicJob(job));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.post<{ Params: { pid: string }; Body: { name: string; description: string; language?: string; sampleText: string; candidate: { media: { hash: string; ext: string; mime: string; bytes: number; durationS?: number }; seed: number | null; durationS: number; fixture: boolean }; assignTo?: { scene: string; instance: string }[]; versionOf?: string; updateUsers?: boolean } }>('/api/projects/:pid/voices', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body;
      if (!b?.name || !b.candidate?.media?.hash) throw new FrameError('USAGE', 'name and candidate are required');
      if (!p.open.store.findMedia(b.candidate.media.hash)) throw new FrameError('NOT_FOUND', 'Candidate audio is not in this project');
      // A redesign of a project voice is a new version of it (FR-VOI-10); emotion references of the old version were
      // rendered from the old neutral reference, so the new version starts with the new neutral only.
      const prev = b.versionOf ? p.open.state.assets[b.versionOf] : undefined;
      if (b.versionOf && prev?.kind !== 'voice') throw new FrameError('NOT_FOUND', `${b.versionOf} is not a voice in this project`, undefined, 'Only voices designed in this project can be versioned.');
      // The neutral reference must be long enough for cloning takes (worker limit, default 3 s).
      let minRef = 3;
      try {
        minRef = (await workerFor(p).capabilities()).limits.minRefSeconds;
      } catch {
        /* worker offline: keep the documented default */
      }
      if (b.candidate.durationS < minRef) throw new FrameError('VALIDATION_FAILED', `This candidate is ${b.candidate.durationS.toFixed(1)} s; a voice reference needs at least ${minRef} s`, { durationS: b.candidate.durationS, minRef }, 'Design again with a longer test line.');
      const id = prev?.id ?? `user.${randomUUID()}`;
      const manifest = designedVoiceManifest({ id, name: b.name, description: b.description, language: b.language ?? 'en', sampleText: b.sampleText, candidate: b.candidate as never, date: new Date().toISOString().slice(0, 10), version: prev ? nextVersion(p, id) : 1 });
      const ref = `${manifest.id}@${manifest.version}`;
      const cmds: { name: string; params: Record<string, unknown> }[] = [{ name: 'asset.addLocal', params: { manifest } }];
      const switched = prev && b.updateUsers ? switchUsers(p, b.versionOf!, ref) : [];
      cmds.push(...switched);
      for (const a of b.assignTo ?? []) {
        if (switched.some((c) => c.params.id === a.instance && c.params.scene === a.scene)) continue;
        cmds.push({ name: 'instance.update', params: { scene: a.scene, id: a.instance, set: { character: { ...currentCharacter(p, a.scene, a.instance), voice: ref } } } });
      }
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: prev ? `${prev.name} version ${manifest.version}` : `Save voice ${b.name}` });
      return { ref, revision: r.revision, updated: cmds.length - 1 };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Character creation from a base character (FR-AGT-02 create_character; the Builder's save path).
  app.post<{ Params: { pid: string }; Body: { spec: CharacterSpec; place?: { scene: string; x?: number; y?: number; view?: string; look?: string }; dryRun?: boolean } }>('/api/projects/:pid/characters', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body;
      if (!b?.spec) throw new FrameError('USAGE', 'spec is required');
      const lib = library(p);
      const manifest = buildCharacter(b.spec, { manifest: (r) => lib.manifest(r) as AssetManifest | undefined }, { id: `user.${randomUUID()}`, date: new Date().toISOString().slice(0, 10), author: sourceOf(req) });
      const ref = `${manifest.id}@${manifest.version}`;
      const data = manifest.data as CharacterData;
      const cmds: { name: string; params: Record<string, unknown> }[] = [{ name: 'asset.addLocal', params: { manifest } }, { name: 'cast.add', params: { character: ref, name: manifest.name } }];
      if (b.place) cmds.push({ name: 'instance.add', params: { scene: b.place.scene, kind: 'character', asset: ref, name: manifest.name, transform: { x: b.place.x ?? 960, y: b.place.y ?? 1000 }, character: { look: b.place.look ?? data.defaultLook, view: b.place.view ?? 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false }, ...(data.voice ? { voice: data.voice } : {}) } } });
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: `Create ${manifest.name}` }, { dryRun: b.dryRun === true });
      return { ref, revision: r.revision, dryRun: r.dryRun, instance: b.place ? (r.commands[2]!.params as { id: string }).id : null };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Character versions (FR-CHR-10, FR-BLD-06): save the builder's changes as version n+1 (or as a new character) and,
  // when asked, switch one instance, a scene or the whole project to it in the same undoable step.
  app.post<{ Params: { pid: string }; Body: { from: string; spec?: Omit<CharacterSpec, 'from' | 'name'> & { name?: string }; asNew?: boolean; update?: { scope: 'instance' | 'scene' | 'project'; scene?: string; instance?: string }; dryRun?: boolean } }>('/api/projects/:pid/characters/versions', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body;
      const lib = library(p);
      const { manifest, commands: cmds, label, isNew } = characterVersionCommands(p.open.state, b, {
        manifest: (r) => lib.manifest(r) as AssetManifest | undefined, versions: (id) => lib.versions(id).map((m) => m.version),
      }, { newId: () => `user.${randomUUID()}`, date: new Date().toISOString().slice(0, 10), author: sourceOf(req) });
      const ref = `${manifest.id}@${manifest.version}`;
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label }, { dryRun: b.dryRun === true });
      return { ref, version: manifest.version, isNew, revision: r.revision, dryRun: r.dryRun, reports: r.reports };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Project versions (FR-PER-03): named snapshots; list, save, compare with the current state, restore (undoable).
  app.get<{ Params: { pid: string } }>('/api/projects/:pid/versions', async (req, reply) => {
    try {
      return { versions: hub.get(req.params.pid).open.store.listVersions() };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string }; Body: { name: string } }>('/api/projects/:pid/versions', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const name = String(req.body?.name ?? '').trim();
      if (!name) throw new FrameError('USAGE', 'name is required');
      p.open.flush();
      return p.open.store.saveVersion(p.open.state, p.open.session.revision, name, randomId('snap'));
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.get<{ Params: { pid: string; vid: string } }>('/api/projects/:pid/versions/:vid/compare', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      return compareStates(p.open.store.loadVersion(req.params.vid), p.open.state);
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string; vid: string } }>('/api/projects/:pid/versions/:vid/restore', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const snap = p.open.store.loadVersion(req.params.vid);
      const name = p.open.store.listVersions().find((v) => v.id === req.params.vid)?.name ?? req.params.vid;
      // Applied as one undoable step (unlike an external reload, history is kept).
      const r = p.open.session.restore(snap, `Restore version "${name}"`, sourceOf(req));
      return { revision: r.revision, label: r.label };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Live rig check of a character draft (FR-BLD-08): validates the changes and checks every part it draws.
  app.post<{ Params: { pid: string }; Body: { from: string; spec?: Omit<CharacterSpec, 'from' | 'name'> & { name?: string } } }>('/api/projects/:pid/characters/check', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const lib = library(p);
      const look = (r: string) => lib.manifest(r) as AssetManifest | undefined;
      const base = look(req.body?.from ?? '');
      if (!base || base.kind !== 'chr') throw new FrameError('NOT_FOUND', `${req.body?.from} is not a character`);
      let manifest: AssetManifest;
      try {
        manifest = buildCharacter({ ...(req.body.spec ?? {}), from: req.body.from, name: req.body.spec?.name ?? base.name }, { manifest: look }, { id: base.id, date: '', author: '' });
      } catch (e) {
        if (e instanceof FrameError && e.code === 'VALIDATION_FAILED') {
          const list = ((e.details as { problems?: string[] } | undefined)?.problems ?? [e.message]).map((message) => ({ severity: 'error' as const, message }));
          return { ok: false, families: [], views: [], mouthShapes: 0, actions: { compatible: 0, total: 0 }, problems: list };
        }
        throw e;
      }
      return checkCharacter(manifest, look, lib.byKind('act').filter((x) => lib.latestRef(x.manifest.id) === `${x.manifest.id}@${x.manifest.version}`).map((x) => x.manifest));
    } catch (e) {
      return sendError(reply, e);
    }
  });
  app.post<{ Params: { pid: string; vid: string }; Body: { path: string } }>('/api/projects/:pid/versions/:vid/copy', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      if (!req.body?.path) throw new FrameError('USAGE', 'path is required');
      const dir = path.resolve(req.body.path);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new FrameError('CONFLICT', `${dir} is not empty`, undefined, 'Choose a new folder name.');
      const v = p.open.store.listVersions().find((x) => x.id === req.params.vid);
      if (!v) throw new FrameError('NOT_FOUND', `Version ${req.params.vid} not found`);
      p.open.flush();
      p.open.store.copyVersionTo(v.id, dir, { projectId: randomId('prj'), name: `${p.open.state.project.name} — ${v.name}` });
      const copy = hub.open(dir);
      return { id: copy.id, root: copy.root, name: copy.open.state.project.name };
    } catch (e) {
      return sendError(reply, e);
    }
  });
  // Where an asset is used, across every open project (FR-AST-05).
  app.get<{ Querystring: { id: string } }>('/api/library/usages', async (req, reply) => {
    try {
      const id = String(req.query.id ?? '').replace(/@\d+$/, '');
      if (!id) throw new FrameError('USAGE', 'id is required');
      return { id, projects: hub.list().map((p) => ({ project: p.id, name: p.open.state.project.name, usages: assetUsages(p.open.state, id) })).filter((x) => x.usages.length) };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Emotional range bank (FR-VOI-03): render emotion references from the voice's neutral reference.
  app.post<{ Params: { pid: string }; Body: { voice: string; emotions?: string[]; text?: string } }>('/api/projects/:pid/voices/range', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const client = workerFor(p);
      const b = req.body;
      if (!b?.voice) throw new FrameError('USAGE', 'voice is required');
      const job = jobs.voice.submit('voice.range', 'Emotional range', (ctx) => rangeCandidates(client, access(p, sourceOf(req)), b.voice, { ...(b.emotions ? { emotions: b.emotions } : {}), ...(b.text ? { text: b.text } : {}) }, { signal: ctx.signal, onProgress: (x) => ctx.progress(x.progress, x.message) }), p.id);
      return reply.code(202).send(publicJob(job));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Accepted references become a new voice version (FR-VOI-10); characters move to it only when asked.
  app.post<{ Params: { pid: string }; Body: { voice: string; accept: RangeCandidate[]; updateUsers?: boolean } }>('/api/projects/:pid/voices/version', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body;
      const voice = p.open.state.assets[b?.voice ?? ''];
      if (!voice) throw new FrameError('NOT_FOUND', `${b?.voice} is not a voice in this project`, undefined, 'Only voices designed in this project can be versioned here.');
      if (!Array.isArray(b.accept) || !b.accept.length) throw new FrameError('USAGE', 'accept[] is required');
      for (const a of b.accept) if (!p.open.store.findMedia(a.media?.hash ?? '')) throw new FrameError('NOT_FOUND', `Reference audio for ${a.emotion} is not in this project`);
      const next = voiceWithReferences(voice, b.accept, new Date().toISOString().slice(0, 10), nextVersion(p, voice.id));
      const ref = `${next.id}@${next.version}`;
      const cmds: { name: string; params: Record<string, unknown> }[] = [{ name: 'asset.addLocal', params: { manifest: next } }, ...(b.updateUsers ? switchUsers(p, b.voice, ref) : [])];
      const r = p.open.session.apply({ commands: cmds as never, source: sourceOf(req), label: `${voice.name} version ${next.version}` });
      return { ref, revision: r.revision, updated: cmds.length - 1 };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.post<{ Params: { pid: string }; Body: { scene: string; lines: string[]; takes?: number; seed?: number; voice?: string } }>('/api/projects/:pid/takes/generate', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const client = workerFor(p);
      const b = req.body;
      if (!b?.scene || !Array.isArray(b.lines) || !b.lines.length) throw new FrameError('USAGE', 'scene and lines[] are required');
      const job = jobs.voice.submit('takes.generate', `Generate takes · ${b.lines.length} line(s)`, (ctx) => generateTakes(client, access(p, sourceOf(req)), { scene: b.scene, lines: b.lines, takes: b.takes ?? 1, ...(b.seed !== undefined ? { seed: b.seed } : {}), ...(b.voice ? { voice: b.voice } : {}) }, { signal: ctx.signal, onProgress: (x) => ctx.progress(x.progress, x.message) }), p.id);
      return reply.code(202).send(publicJob(job));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  // Upload a take for a line (FR-VOI-06): store, decode and measure, lip sync from the amplitude envelope at once
  // (FR-LIP-02), then forced alignment when a worker is reachable (FR-LIP-01).
  app.post<{ Params: { pid: string }; Querystring: { scene: string; line: string; ext: string; choose?: string }; Body: Buffer }>('/api/projects/:pid/takes/upload', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const { scene, line, ext } = req.query;
      if (!/^(wav|mp3|flac|ogg|m4a|aac|webm)$/.test(String(ext ?? '').toLowerCase())) throw new FrameError('USAGE', 'ext must be wav, mp3, flac, ogg, m4a, aac or webm');
      const clip = p.open.state.scenes[scene]?.clips.find((c) => c.id === line);
      if (!clip?.line) throw new FrameError('NOT_FOUND', `Line ${line} not found in scene ${scene}`);
      if (!Buffer.isBuffer(req.body) || !req.body.length) throw new FrameError('USAGE', 'Send the audio file as the request body');
      const bytes = new Uint8Array(req.body);
      const job = jobs.voice.submit('takes.upload', 'Upload take', async (ctx) => {
        ctx.progress(0.1, 'Decoding');
        const media0 = p.open.store.putMedia(bytes, { ext: ext.toLowerCase(), mime: MIME[ext.toLowerCase()] ?? 'application/octet-stream' });
        let pcm;
        try {
          pcm = decodeAudioFile(p.open.store.findMedia(media0.hash)!);
        } catch (e) {
          throw new FrameError('VALIDATION_FAILED', `This file could not be decoded as audio: ${(e as Error).message}`);
        }
        const durationS = (pcm.data[0]?.length ?? 0) / pcm.sampleRate;
        if (durationS < 0.1) throw new FrameError('VALIDATION_FAILED', 'The audio is shorter than 0.1 s');
        const media = { ...media0, durationS: Math.round(durationS * 1000) / 1000, sampleRate: pcm.sampleRate, channels: pcm.channels };
        const ln = p.open.state.scenes[scene]!.clips.find((c) => c.id === line)!.line!;
        const alignment = { method: 'amplitude' as const, words: [], phonemes: [], confidence: 0, envelope: { windowS: 0.02, values: rmsEnvelope(pcm, 0.02) } };
        const r = p.open.session.apply({ source: sourceOf(req), label: 'Upload take', commands: [{ name: 'take.add', params: { take: { line, lineRevision: ln.revision, source: 'uploaded', fixture: false, status: 'ready', media, durationS: media.durationS, alignment } } }] });
        const takeId = (r.commands[0]!.params as { id: string }).id;
        if (req.query.choose !== 'false') p.open.session.apply({ source: sourceOf(req), label: 'Choose uploaded take', commands: [{ name: 'line.chooseTake', params: { scene, id: line, take: takeId } }] });
        ctx.progress(0.5, 'Aligning');
        let aligned = false;
        let note: string | undefined;
        try {
          const client = workerFor(p);
          const hash = await client.uploadBlob(bytes, `take.${ext}`, MIME[ext.toLowerCase()] ?? 'application/octet-stream');
          const aj = await client.align({ audioHash: hash, transcript: ln.text.replace(/\[pause\s+\d+(?:\.\d+)?s\]/gi, ' ').replace(/\s+/g, ' ').trim(), language: 'en' });
          const al = await client.wait(aj, { signal: ctx.signal, onProgress: (j) => ctx.progress(0.5 + j.progress * 0.5, 'Aligning') });
          p.open.session.apply({ source: sourceOf(req), label: 'Align take', commands: [{ name: 'take.update', params: { id: takeId, set: { alignment: toAlignment(al) } } }] });
          aligned = true;
        } catch (e) {
          // Without an aligner the amplitude fallback stays in place (marked approximate).
          note = `Lip sync uses the audio level until the take is aligned: ${(e as Error).message}`;
        }
        return { take: takeId, durationS: media.durationS, aligned, ...(note ? { note } : {}) };
      }, p.id);
      return reply.code(202).send(publicJob(job));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  /* ---------------------------------------------------------------- static: content and Studio */
  await app.register(fastifyStatic, { root: path.resolve(o.contentDir), prefix: '/content/', decorateReply: false, index: false });
  if (o.studioDir && fs.existsSync(path.join(o.studioDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: path.resolve(o.studioDir), prefix: '/', decorateReply: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/') || req.url.startsWith('/content/')) return sendError(reply, new FrameError('NOT_FOUND', `No route ${req.method} ${req.url}`));
      return reply.type('text/html').send(fs.readFileSync(path.join(o.studioDir!, 'index.html')));
    });
  } else {
    app.setNotFoundHandler((req, reply) => sendError(reply, new FrameError('NOT_FOUND', `No route ${req.method} ${req.url}`)));
  }

  return {
    app,
    hub,
    jobs,
    close: async () => {
      hub.closeAll();
      await app.close();
      (await renderer)?.dispose();
    },
  };
}

/** Bounding box of pixels with alpha > 0 (thumbnail framing). */
export function visibleBox(rgba: Uint8Array, w: number, h: number): { x: number; y: number; w: number; h: number } | undefined {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3]! > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? undefined : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The version after the newest one of `id` in the project (an older version can be the base of a new one). */
function nextVersion(p: HubProject, id: string): number {
  return Math.max(0, ...Object.values(p.open.state.assets).filter((a) => a.id === id).map((a) => a.version)) + 1;
}

/** instance.update commands moving every character that uses voice `from` to `to` (FR-VOI-10; takes are kept). */
function switchUsers(p: HubProject, from: string, to: string) {
  const out: { name: string; params: Record<string, unknown> }[] = [];
  for (const sc of Object.values(p.open.state.scenes)) {
    for (const i of sc.instances) if (i.character?.voice === from) out.push({ name: 'instance.update', params: { scene: sc.id, id: i.id, set: { character: { ...i.character, voice: to } } } });
  }
  return out;
}

/** Change source of a request: `agent:<session>` when an agent (MCP, CLI with FRAME_AGENT_SESSION) sent it (FR-AGT-04). */
function sourceOf(req: { headers: Record<string, string | string[] | undefined> }): string {
  const agent = req.headers['x-frame-agent'];
  return typeof agent === 'string' && /^[\w.:-]{1,80}$/.test(agent) ? `agent:${agent}` : 'user';
}

function currentCharacter(p: HubProject, scene: string, instance: string) {
  const inst = p.open.state.scenes[scene]?.instances.find((i) => i.id === instance);
  if (!inst?.character) throw new FrameError('NOT_FOUND', `Character ${instance} not found in scene ${scene}`);
  return inst.character;
}

function publicJob(j: Job) {
  const { logs: _l, ...rest } = j;
  return rest;
}
