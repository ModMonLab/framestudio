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
import { describeCommands, evaluateFrame, validateProject, type ProjectState } from '@frame/core';
import { libraryFor, loadStyles } from '@frame/assets/node';
import { createNodeRenderer, type NodeRenderer } from '@frame/render/node';
import { renderExport, type OutputPreset } from '@frame/io';
import { exitCodeFor, FrameError, type CommandBatch, type ErrorCode } from '@frame/schema';
import { VoiceClient, designCandidates, designedVoiceManifest, generateTakes, sourceLabel, type ProjectAccess } from '@frame/voice-client';
import { JobQueue, type Job } from './jobs.js';
import { ProjectHub, type HubEvent, type HubProject } from './hub.js';

export const SERVER_VERSION = '0.1.0';

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
}

const STATUS: Partial<Record<ErrorCode, number>> = {
  USAGE: 400, VALIDATION_FAILED: 422, NOT_FOUND: 404, REVISION_CONFLICT: 409, CONFLICT: 409, PERMISSION_REQUIRED: 403,
  CONSENT_REQUIRED: 403, WORKER_UNAVAILABLE: 503, CANCELLED: 409, SCHEMA_TOO_NEW: 422, MIGRATION_REQUIRED: 409, RENDER_FAILED: 500,
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
  const hub = new ProjectHub({ ...(o.watchMs ? { watchMs: o.watchMs } : {}), ...(o.debounceMs !== undefined ? { debounceMs: o.debounceMs } : {}) });
  const jobs = { render: new JobQueue(1), voice: new JobQueue(1) };
  const styles = loadStyles(o.contentDir);
  let renderer: Promise<NodeRenderer> | undefined;
  const getRenderer = () => (renderer ??= createNodeRenderer({ fontsDir: path.join(o.contentDir, 'fonts') }));
  const library = (p?: HubProject) => libraryFor({ contentDir: o.contentDir, projectAssets: Object.fromEntries(Object.entries(p?.open.state.assets ?? {}).map(([ref, m]) => [`assets/local/${ref}.json`, m])) });

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
  app.addContentTypeParser(['application/octet-stream', 'audio/*', 'image/*', 'video/*'], { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
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
      const agent = req.headers['x-frame-agent'];
      const body = req.body;
      if (!body || !Array.isArray(body.commands)) throw new FrameError('USAGE', 'commands[] is required');
      const batch: CommandBatch = { ...body, source: typeof agent === 'string' && agent ? `agent:${agent}` : body.source ?? 'user' };
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
        const r = p.open.session[op]();
        if (!r) throw new FrameError('CONFLICT', `Nothing to ${op}`);
        return { revision: r.revision, label: r.label };
      } catch (e) {
        return sendError(reply, e);
      }
    });
  }
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
      const problems = validateProject(p.open.state, { assetExists: (r) => lib.has(r), mediaExists: (h) => p.open.store.verifyMedia(h) });
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
      const f = p.open.store.findMedia(req.params.hash);
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
  app.get<{ Querystring: { q?: string; kind?: string; limit?: string; project?: string } }>('/api/library', async (req, reply) => {
    try {
      const p = req.query.project ? hub.get(req.query.project) : undefined;
      const lib = library(p);
      const limit = Math.min(500, Number(req.query.limit ?? 100));
      const hits = lib.search(req.query.q ?? '', { ...(req.query.kind ? { kind: req.query.kind } : {}) }).slice(0, limit);
      return { results: hits.map(({ manifest: m, source, incompatible }) => ({ ref: `${m.id}@${m.version}`, source, ...(incompatible ? { incompatible } : {}), id: m.id, version: m.version, kind: m.kind, name: m.name, category: m.category, group: m.group, tags: m.tags, families: m.families, views: m.views })) };
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
  app.get('/api/styles', async () => styles);

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
      const out = b.out ? path.resolve(p.root, b.out) : path.join(p.root, state.project.renderDir ?? 'renders', `${name.replace(/[^A-Za-z0-9_-]+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}${ext}`);
      const job = jobs.render.submit('render', `Export · ${name}`, async (ctx) => {
        const report = await renderExport({
          state, revision, scenes, ...(b.range ? { range: b.range } : {}), preset, presetId: presetRef,
          width: b.width ?? base.width ?? state.project.output.width, height: b.height ?? base.height ?? state.project.output.height,
          ...(base.aspect ? { aspect: base.aspect } : {}),
          burnInCaptions: b.captions ?? (state.project.captions.enabled && state.project.captions.burnIn),
          out, assets: { manifest: (r) => lib.manifest(r) }, assetExists: (r) => lib.has(r), mediaExists: (h) => p.open.store.verifyMedia(h), styles, renderer: await getRenderer(),
          resolveAudio: (src) => (src.kind === 'media' ? p.open.store.findMedia(src.hash) : undefined),
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
    const url = p?.open.state.project.voiceWorkerUrl ?? o.workerUrl;
    if (!url) throw new FrameError('WORKER_UNAVAILABLE', 'No voice worker is configured', undefined, 'Set FRAME_WORKER_URL for the server or a worker URL in project settings.');
    return new VoiceClient({ url, ...(o.workerToken ? { token: o.workerToken } : {}) });
  };
  const access = (p: HubProject): ProjectAccess => ({
    state: () => p.open.state as never,
    apply: (commands, label) => p.open.session.apply({ commands, source: 'user', ...(label ? { label } : {}) }),
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
      const job = jobs.voice.submit('voice.design', 'Design voice', (ctx) => designCandidates(client, access(p), { description: b.description, language: b.language ?? 'en', sampleText: b.sampleText, candidates: b.candidates ?? 4, ...(b.seed !== undefined ? { seed: b.seed } : {}) }, { signal: ctx.signal, onProgress: (x) => ctx.progress(x.progress, x.message) }), p.id);
      return reply.code(202).send(publicJob(job));
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.post<{ Params: { pid: string }; Body: { name: string; description: string; language?: string; sampleText: string; candidate: { media: { hash: string; ext: string; mime: string; bytes: number; durationS?: number }; seed: number | null; durationS: number; fixture: boolean }; assignTo?: { scene: string; instance: string }[] } }>('/api/projects/:pid/voices', async (req, reply) => {
    try {
      const p = hub.get(req.params.pid);
      const b = req.body;
      if (!b?.name || !b.candidate?.media?.hash) throw new FrameError('USAGE', 'name and candidate are required');
      if (!p.open.store.findMedia(b.candidate.media.hash)) throw new FrameError('NOT_FOUND', 'Candidate audio is not in this project');
      // The neutral reference must be long enough for cloning takes (worker limit, default 3 s).
      let minRef = 3;
      try {
        minRef = (await workerFor(p).capabilities()).limits.minRefSeconds;
      } catch {
        /* worker offline: keep the documented default */
      }
      if (b.candidate.durationS < minRef) throw new FrameError('VALIDATION_FAILED', `This candidate is ${b.candidate.durationS.toFixed(1)} s; a voice reference needs at least ${minRef} s`, { durationS: b.candidate.durationS, minRef }, 'Design again with a longer test line.');
      const manifest = designedVoiceManifest({ id: `user.${randomUUID()}`, name: b.name, description: b.description, language: b.language ?? 'en', sampleText: b.sampleText, candidate: b.candidate as never, date: new Date().toISOString().slice(0, 10) });
      const ref = `${manifest.id}@${manifest.version}`;
      const cmds = [{ name: 'asset.addLocal', params: { manifest } }, ...(b.assignTo ?? []).map((a) => ({ name: 'instance.update', params: { scene: a.scene, id: a.instance, set: { character: { ...currentCharacter(p, a.scene, a.instance), voice: ref } } } }))];
      const r = p.open.session.apply({ commands: cmds, source: 'user', label: `Save voice ${b.name}` });
      return { ref, revision: r.revision };
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
      const job = jobs.voice.submit('takes.generate', `Generate takes · ${b.lines.length} line(s)`, (ctx) => generateTakes(client, access(p), { scene: b.scene, lines: b.lines, takes: b.takes ?? 1, ...(b.seed !== undefined ? { seed: b.seed } : {}), ...(b.voice ? { voice: b.voice } : {}) }, { signal: ctx.signal, onProgress: (x) => ctx.progress(x.progress, x.message) }), p.id);
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

function currentCharacter(p: HubProject, scene: string, instance: string) {
  const inst = p.open.state.scenes[scene]?.instances.find((i) => i.id === instance);
  if (!inst?.character) throw new FrameError('NOT_FOUND', `Character ${instance} not found in scene ${scene}`);
  return inst.character;
}

function publicJob(j: Job) {
  const { logs: _l, ...rest } = j;
  return rest;
}
