/**
 * MCP tools (FR-AGT-02). Each tool is a thin, typed wrapper over a Frame Server endpoint, so agents use the same
 * engine, validation and permissions as the Studio and the CLI. Times are in seconds at the tool boundary and in
 * ticks (48 000 per second) inside commands, as everywhere in the engine.
 */
import { FrameError, Type, type TSchema } from '@frame/schema';
import type { FrameApi } from './api.js';

export const TICKS = 48000;

export type ToolContent = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: TSchema;
  /** Read-only tools never change a project. */
  readOnly: boolean;
  run(args: Record<string, unknown>, ctx: ToolCtx): Promise<unknown | { content: ToolContent[] }>;
}

export interface ToolCtx {
  api: FrameApi;
  /** Project id used when a tool call omits `project` (set by create_project/open_project). */
  current?: string;
  setCurrent(id: string): void;
  /** Longest a tool waits for a job before returning its id (ms). */
  waitMs: number;
}

interface Job { id: string; kind: string; state: string; progress: number; message: string; result?: unknown; error?: { code: string; message: string } }

const Project = Type.Optional(Type.String({ description: 'Project id from open_project/create_project; defaults to the last opened project.' }));
const pid = (a: Record<string, unknown>, ctx: ToolCtx): string => {
  const id = (a.project as string | undefined) ?? ctx.current;
  if (!id) throw new FrameError('USAGE', 'No project is open', undefined, 'Call open_project or create_project first, or pass project.');
  return encodeURIComponent(id);
};

async function waitJob(ctx: ToolCtx, id: string, ms = ctx.waitMs): Promise<Job> {
  const until = Date.now() + ms;
  for (;;) {
    const j = await ctx.api.json<Job>('GET', `/api/jobs/${encodeURIComponent(id)}`);
    if (['succeeded', 'failed', 'cancelled'].includes(j.state) || Date.now() >= until) return j;
    await new Promise((r) => setTimeout(r, 200));
  }
}

function jobView(j: Job) {
  return { job: j.id, kind: j.kind, state: j.state, progress: j.progress, message: j.message, ...(j.result !== undefined ? { result: j.result } : {}), ...(j.error ? { error: j.error } : {}), ...(['queued', 'running'].includes(j.state) ? { next: 'Call job_status with this job id to wait for the result.' } : {}) };
}

interface StateRes { revision: number; state: { project: Record<string, unknown> & { name: string; episodes: string[]; cast: unknown[]; frameRate: number; output: unknown; styleFamily: string; settings?: unknown }; episodes: Record<string, { id: string; name: string; scenes: string[] }>; scenes: Record<string, { id: string; name: string; duration: number; instances: { id: string; kind: string; name: string; asset?: string; character?: { voice?: string } }[]; clips: { id: string; kind: string; source?: string; line?: { text: string; take?: string } }[]; tracks: unknown[] }>; assets: Record<string, { kind: string; name: string }>; takes: Record<string, unknown> }; canUndo: boolean; undoLabel: string | null }

/** A compact project summary (also the `frame://project/{id}/summary` resource). */
export function summarize(r: StateRes) {
  const st = r.state;
  const p = st.project;
  return {
    revision: r.revision,
    name: p.name,
    styleFamily: p.styleFamily,
    frameRate: p.frameRate,
    output: p.output,
    captions: p.captions,
    permissions: p.permissions,
    cast: p.cast,
    episodes: p.episodes.map((eid) => {
      const e = st.episodes[eid]!;
      return {
        id: e.id, name: e.name,
        scenes: e.scenes.map((sid) => {
          const s = st.scenes[sid]!;
          const lines = s.clips.filter((c) => c.kind === 'line');
          return { id: s.id, name: s.name, durationS: s.duration / TICKS, characters: s.instances.filter((i) => i.kind === 'character').map((i) => ({ id: i.id, name: i.name, asset: i.asset, voice: i.character?.voice ?? null })), props: s.instances.filter((i) => i.kind !== 'character').length, lines: lines.length, linesWithTakes: lines.filter((l) => l.line?.take).length, clips: s.clips.length };
        }),
      };
    }),
    projectAssets: Object.entries(st.assets).map(([ref, m]) => ({ ref, kind: m.kind, name: m.name })),
    takes: Object.keys(st.takes).length,
    undo: r.canUndo ? r.undoLabel : null,
  };
}

const DeliveryNote = 'Characters and lines are edited with apply_commands (see the frame://commands resource for every command and its parameters).';

export const TOOLS: ToolDef[] = [
  {
    name: 'describe_capabilities',
    title: 'Describe capabilities',
    description: 'What this Frame server can do: engine commands, units, voice worker state (fixture or real engine), library size and agent permissions. Call first.',
    inputSchema: Type.Object({}),
    readOnly: true,
    run: async (_a, ctx) => {
      const [health, commands, worker, lib] = await Promise.all([
        ctx.api.json<{ version: string }>('GET', '/api/health'),
        ctx.api.json<{ commands: { name: string; summary: string }[] }>('GET', '/api/commands'),
        ctx.api.json<Record<string, unknown>>('GET', `/api/worker/status${ctx.current ? `?project=${encodeURIComponent(ctx.current)}` : ''}`).catch((e: Error) => ({ state: 'unavailable', message: e.message })),
        ctx.api.json<{ results: { kind: string }[] }>('GET', '/api/library?limit=500'),
      ]);
      return {
        server: health.version,
        session: `agent:${ctx.api.session}`,
        units: { time: 'ticks in commands (48000 per second); seconds in tool arguments', stage: '1920×1080 design units, origin top-left' },
        commands: commands.commands.map((c) => `${c.name} — ${c.summary}`),
        voiceWorker: worker,
        libraryKindsSample: [...new Set(lib.results.map((r) => r.kind))].sort(),
        agentRules: [
          'Every change you make is tagged with your session and can be reverted as a group by a person.',
          'Use dry_run on apply_commands to check work; pass base_revision to detect concurrent edits (REVISION_CONFLICT means re-read and retry).',
          'Agents cannot delete projects or voices, clone voices or expose the worker unless a person granted it in project settings.',
          'Fixture voice output is a test signal, never real speech; say so when reporting results.',
        ],
        resources: ['frame://schemas', 'frame://catalog', 'frame://commands', 'frame://project/{id}/summary'],
      };
    },
  },
  {
    name: 'list_projects',
    title: 'List open projects',
    description: 'Projects open on the Frame server (id, name, folder, revision).',
    inputSchema: Type.Object({}),
    readOnly: true,
    run: async (_a, ctx) => ctx.api.json('GET', '/api/projects'),
  },
  {
    name: 'create_project',
    title: 'Create project',
    description: 'Create a new project folder with the library defaults and open it. The folder must not exist or be empty.',
    inputSchema: Type.Object({ path: Type.String({ description: 'Folder to create, e.g. /work/MyShow.frame' }), name: Type.Optional(Type.String()), styleFamily: Type.Optional(Type.Union([Type.Literal('flat'), Type.Literal('illustrated')])), frameRate: Type.Optional(Type.Union([Type.Literal(24), Type.Literal(25), Type.Literal(30)])) }),
    readOnly: false,
    run: async (a, ctx) => {
      const r = await ctx.api.json<{ id: string }>('POST', '/api/projects/create', a);
      ctx.setCurrent(r.id);
      return r;
    },
  },
  {
    name: 'open_project',
    title: 'Open project',
    description: 'Open a project folder (idempotent) and make it the current project. Returns its id and load problems.',
    inputSchema: Type.Object({ path: Type.String() }),
    readOnly: true,
    run: async (a, ctx) => {
      const r = await ctx.api.json<{ id: string }>('POST', '/api/projects/open', { path: a.path });
      ctx.setCurrent(r.id);
      return r;
    },
  },
  {
    name: 'get_project',
    title: 'Get project',
    description: 'Project summary: settings, episodes and scenes (ids, durations, characters, line and take counts), cast, project-local assets and revision.',
    inputSchema: Type.Object({ project: Project }),
    readOnly: true,
    run: async (a, ctx) => summarize(await ctx.api.json<StateRes>('GET', `/api/projects/${pid(a, ctx)}/state`)),
  },
  {
    name: 'get_scene',
    title: 'Get scene',
    description: 'Full scene data: instances, tracks, clips (with their source tags), cameras, markers and stage. Times are in ticks (48000/s).',
    inputSchema: Type.Object({ scene: Type.String(), project: Project }),
    readOnly: true,
    run: async (a, ctx) => {
      const r = await ctx.api.json<StateRes>('GET', `/api/projects/${pid(a, ctx)}/state`);
      const sc = r.state.scenes[a.scene as string];
      if (!sc) throw new FrameError('NOT_FOUND', `Scene ${a.scene} not found`, { scenes: Object.keys(r.state.scenes) });
      const takes = Object.fromEntries(sc.clips.filter((c) => c.line?.take).map((c) => [c.line!.take!, r.state.takes[c.line!.take!]]).map(([k, t]) => [k, t && { ...(t as object), alignment: undefined }]));
      return { revision: r.revision, scene: sc, chosenTakes: takes };
    },
  },
  {
    name: 'search_assets',
    title: 'Search assets',
    description: 'Search the library (bundled, user and project assets) by words, synonyms and kind (chr, exp, act, prop, kit, top, hair, mus, sfx, out, txt, …). Returns refs to use in commands.',
    inputSchema: Type.Object({ query: Type.Optional(Type.String()), kind: Type.Optional(Type.String()), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })), project: Project }),
    readOnly: true,
    run: async (a, ctx) => {
      const q = new URLSearchParams({ q: String(a.query ?? ''), limit: String(a.limit ?? 30), ...(a.kind ? { kind: String(a.kind) } : {}), ...((a.project as string | undefined) ?? ctx.current ? { project: String((a.project as string | undefined) ?? ctx.current) } : {}) });
      const r = await ctx.api.json<{ results: Record<string, unknown>[] }>('GET', `/api/library?${q}`);
      return { results: r.results.map(({ ref, kind, name, group, tags, incompatible }) => ({ ref, kind, name, group, tags, ...(incompatible ? { incompatible } : {}) })) };
    },
  },
  {
    name: 'get_asset',
    title: 'Get asset',
    description: 'The full manifest of an asset ref (parameters, capabilities, data).',
    inputSchema: Type.Object({ ref: Type.String(), project: Project }),
    readOnly: true,
    run: async (a, ctx) => ctx.api.json('GET', `/api/library/manifest?ref=${encodeURIComponent(String(a.ref))}${(a.project ?? ctx.current) ? `&project=${encodeURIComponent(String(a.project ?? ctx.current))}` : ''}`),
  },
  {
    name: 'apply_commands',
    title: 'Apply commands',
    description: `Apply engine commands as one undoable change. dry_run validates and returns the resulting commands without writing. base_revision makes the call fail with REVISION_CONFLICT if someone changed overlapping data since that revision. ${DeliveryNote}`,
    inputSchema: Type.Object({
      commands: Type.Array(Type.Object({ name: Type.String(), params: Type.Record(Type.String(), Type.Unknown()) }), { minItems: 1 }),
      label: Type.Optional(Type.String({ description: 'History label shown to people, e.g. "Block scene 2".' })),
      dry_run: Type.Optional(Type.Boolean()),
      base_revision: Type.Optional(Type.Integer({ minimum: 0 })),
      project: Project,
    }),
    readOnly: false,
    run: async (a, ctx) => ctx.api.json('POST', `/api/projects/${pid(a, ctx)}/commands`, { commands: a.commands, ...(a.label ? { label: a.label } : {}), ...(a.dry_run ? { dryRun: true } : {}), ...(a.base_revision !== undefined ? { baseRevision: a.base_revision } : {}) }),
  },
  {
    name: 'apply_recipe',
    title: 'Apply recipe',
    description: 'Apply a performance or shot recipe (search_assets kind "rcp" or "cam") to a scene: roles map to instance ids; line-anchored recipes take a line clip id, others a start time. Adds ordinary grouped clips (one undo step); warnings name steps whose assets are missing.',
    inputSchema: Type.Object({
      scene: Type.String(),
      ref: Type.String({ description: 'Recipe ref' }),
      roles: Type.Record(Type.String(), Type.String(), { description: 'Role key → instance id' }),
      at: Type.Optional(Type.Number({ minimum: 0, description: 'Start in seconds (time-anchored recipes)' })),
      line: Type.Optional(Type.String({ description: 'Line clip id (line-anchored recipes)' })),
      dry_run: Type.Optional(Type.Boolean()),
      project: Project,
    }),
    readOnly: false,
    run: async (a, ctx) => ctx.api.json('POST', `/api/projects/${pid(a, ctx)}/scenes/${a.scene}/recipes/apply`, { ref: a.ref, roles: a.roles, ...(a.at !== undefined ? { at: Math.round(Number(a.at) * TICKS) } : {}), ...(a.line ? { line: a.line } : {}), ...(a.dry_run ? { dryRun: true } : {}) }),
  },
  {
    name: 'auto_coverage',
    title: 'Automatic coverage',
    description: 'Generate editable shots from a scene\'s dialogue: an establishing wide, speaker close-ups, reactions; replaces earlier automatic shots and keeps hand-placed ones.',
    inputSchema: Type.Object({ scene: Type.String(), project: Project }),
    readOnly: false,
    run: async (a, ctx) => ctx.api.json('POST', `/api/projects/${pid(a, ctx)}/scenes/${a.scene}/coverage`, {}),
  },
  {
    name: 'apply_template',
    title: 'Apply template',
    description: 'Add the scene(s) of a production template (search_assets kind "tpl") to an episode with any characters in its cast roles (role key → character ref); the suggested script is in the scene notes.',
    inputSchema: Type.Object({ ref: Type.String(), cast: Type.Optional(Type.Record(Type.String(), Type.String())), episode: Type.Optional(Type.String()), name: Type.Optional(Type.String()), project: Project }),
    readOnly: false,
    run: async (a, ctx) => ctx.api.json('POST', `/api/projects/${pid(a, ctx)}/templates/apply`, { ref: a.ref, ...(a.cast ? { cast: a.cast } : {}), ...(a.episode ? { episode: a.episode } : {}), ...(a.name ? { name: a.name } : {}) }),
  },
  {
    name: 'add_sound',
    title: 'Add sound',
    description: 'Put a library sound on a scene\'s sound tracks: music (kind "music") and ambience ("amb") loop from the start time to the scene end unless a duration is given; sound effects ("sfx") and cues ("cue") play once. Music ducks under dialogue automatically.',
    inputSchema: Type.Object({ scene: Type.String(), ref: Type.String(), at: Type.Optional(Type.Number({ minimum: 0, description: 'Start in seconds (default 0)' })), duration: Type.Optional(Type.Number({ exclusiveMinimum: 0, description: 'Seconds' })), gain_db: Type.Optional(Type.Number({ minimum: -60, maximum: 12 })), project: Project }),
    readOnly: false,
    run: async (a, ctx) => {
      const id = pid(a, ctx);
      const r = await ctx.api.json<StateRes>('GET', `/api/projects/${id}/state`);
      const sc = r.state.scenes[a.scene as string];
      if (!sc) throw new FrameError('NOT_FOUND', `Scene ${a.scene} not found`, { scenes: Object.keys(r.state.scenes) });
      const m = await ctx.api.json<{ kind: string; data?: { sound?: { loop?: boolean; media?: { durationS?: number } } } }>('GET', `/api/library/manifest?ref=${encodeURIComponent(String(a.ref))}&project=${encodeURIComponent(id)}`);
      const kind = m.kind === 'music' ? 'music' : m.kind === 'amb' ? 'ambience' : m.kind === 'sfx' || m.kind === 'cue' ? 'sfx' : undefined;
      if (!kind) throw new FrameError('USAGE', `${a.ref} is not a sound (music, amb, sfx or cue)`);
      const track = (sc.tracks as { id: string; owner: string; kind: string }[]).find((t) => t.owner === 'scene' && t.kind === kind)!;
      const start = Math.round(Number(a.at ?? 0) * TICKS);
      const loops = m.data?.sound?.loop ?? (kind !== 'sfx');
      const len = a.duration !== undefined ? Math.round(Number(a.duration) * TICKS) : loops ? sc.duration - start : Math.round((m.data?.sound?.media?.durationS ?? 1) * TICKS);
      const end = Math.min(sc.duration, start + Math.max(1, len));
      return ctx.api.json('POST', `/api/projects/${id}/commands`, { label: `Add ${a.ref}`, commands: [{ name: 'clip.add', params: { scene: a.scene, track: track.id, start, end, asset: a.ref, ...(a.gain_db !== undefined ? { params: { gainDb: a.gain_db } } : {}) } }] });
    },
  },
  {
    name: 'validate',
    title: 'Validate',
    description: 'Problems in the project (missing assets or media, lines without takes, export blockers) with fixes.',
    inputSchema: Type.Object({ project: Project }),
    readOnly: true,
    run: async (a, ctx) => ctx.api.json('GET', `/api/projects/${pid(a, ctx)}/validate`),
  },
  {
    name: 'create_character',
    title: 'Create character',
    description: 'Create a project character from a base character (search_assets kind "chr"), changing parts, body, colours, looks, voice and performance; adds it to the cast and optionally places it in a scene. Part keys: head, eyes, brows, nose, mouth, ears, hair, fringe, facialHair, feet. Every ref is checked.',
    inputSchema: Type.Object({
      name: Type.String(),
      from: Type.String({ description: 'Base character ref, e.g. from search_assets kind "chr"' }),
      role: Type.Optional(Type.String()),
      bodyBase: Type.Optional(Type.String()),
      body: Type.Optional(Type.Record(Type.String(), Type.Number({ minimum: 0, maximum: 100 }))),
      parts: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Null()]))),
      colors: Type.Optional(Type.Record(Type.String(), Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }))),
      looks: Type.Optional(Type.Array(Type.Object({ id: Type.String(), name: Type.String(), garments: Type.Array(Type.String()), accessories: Type.Optional(Type.Array(Type.String())), colors: Type.Optional(Type.Record(Type.String(), Type.String())) }))),
      voice: Type.Optional(Type.String()),
      place: Type.Optional(Type.Object({ scene: Type.String(), x: Type.Optional(Type.Number()), y: Type.Optional(Type.Number()), view: Type.Optional(Type.Union([Type.Literal('front'), Type.Literal('three'), Type.Literal('side'), Type.Literal('back')])) })),
      dry_run: Type.Optional(Type.Boolean()),
      project: Project,
    }),
    readOnly: false,
    run: async (a, ctx) => {
      const { place, dry_run, project: _p, ...spec } = a;
      return ctx.api.json('POST', `/api/projects/${pid(a, ctx)}/characters`, { spec, ...(place ? { place } : {}), ...(dry_run ? { dryRun: true } : {}) });
    },
  },
  {
    name: 'design_voice',
    title: 'Design voice',
    description: 'Design a voice from a description on the Voice Worker: renders candidates, then saves the chosen one (default the first) as a project voice and assigns it to characters. Fixture workers return test signals, not speech (results say so).',
    inputSchema: Type.Object({
      description: Type.String({ minLength: 3 }),
      name: Type.String({ description: 'Voice name' }),
      sample_text: Type.Optional(Type.String({ description: 'Test line (long enough for a reference of at least the worker minimum, usually 3 s).' })),
      candidates: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })),
      choose: Type.Optional(Type.Integer({ minimum: 0, description: 'Index of the candidate to save (default 0).' })),
      assign_to: Type.Optional(Type.Array(Type.Object({ scene: Type.String(), instance: Type.String() }))),
      seed: Type.Optional(Type.Integer()),
      language: Type.Optional(Type.String()),
      project: Project,
    }),
    readOnly: false,
    run: async (a, ctx) => {
      const p = pid(a, ctx);
      const sampleText = String(a.sample_text ?? 'Thanks for listening to the show today. We read every message you send, even the strange ones.');
      const j = await ctx.api.json<Job>('POST', `/api/projects/${p}/voices/design`, { description: a.description, sampleText, candidates: a.candidates ?? 2, ...(a.seed !== undefined ? { seed: a.seed } : {}), ...(a.language ? { language: a.language } : {}) });
      const done = await waitJob(ctx, j.id, Math.max(ctx.waitMs, 300_000));
      if (done.state !== 'succeeded') return jobView(done);
      const cands = (done.result as { candidates: { durationS: number; fixture: boolean }[] }).candidates;
      const chosen = cands[Number(a.choose ?? 0)];
      if (!chosen) throw new FrameError('USAGE', `choose must be below ${cands.length}`);
      const saved = await ctx.api.json<{ ref: string; revision: number }>('POST', `/api/projects/${p}/voices`, { name: a.name, description: a.description, sampleText, candidate: chosen, ...(a.language ? { language: a.language } : {}), ...(a.assign_to ? { assignTo: a.assign_to } : {}) });
      return { ...saved, candidates: cands.map((c, i) => ({ index: i, durationS: c.durationS, fixture: c.fixture })), fixture: chosen.fixture, ...(chosen.fixture ? { note: 'Fixture worker: the voice is a test signal, not real speech.' } : {}) };
    },
  },
  {
    name: 'generate_takes',
    title: 'Generate takes',
    description: 'Synthesise and align takes for dialogue lines with each speaker\'s voice; the newest ready take is chosen. Waits up to the tool wait limit, otherwise returns a job id for job_status.',
    inputSchema: Type.Object({ scene: Type.String(), lines: Type.Array(Type.String(), { minItems: 1 }), takes: Type.Optional(Type.Integer({ minimum: 1, maximum: 4 })), seed: Type.Optional(Type.Integer()), project: Project }),
    readOnly: false,
    run: async (a, ctx) => {
      const j = await ctx.api.json<Job>('POST', `/api/projects/${pid(a, ctx)}/takes/generate`, { scene: a.scene, lines: a.lines, takes: a.takes ?? 1, ...(a.seed !== undefined ? { seed: a.seed } : {}) });
      return jobView(await waitJob(ctx, j.id));
    },
  },
  {
    name: 'render_frame',
    title: 'Render frame',
    description: 'Render one frame of a scene with the export renderer and return it as a PNG image.',
    inputSchema: Type.Object({ scene: Type.String(), t: Type.Optional(Type.Number({ minimum: 0, description: 'Time in seconds (default 0).' })), width: Type.Optional(Type.Integer({ minimum: 16, maximum: 1920 })), height: Type.Optional(Type.Integer({ minimum: 16, maximum: 1080 })), captions: Type.Optional(Type.Boolean()), project: Project }),
    readOnly: true,
    run: async (a, ctx) => {
      const q = new URLSearchParams({ scene: String(a.scene), t: String(Math.round(Number(a.t ?? 0) * TICKS)), width: String(a.width ?? 960), height: String(a.height ?? 540), captions: String(a.captions === true) });
      const img = await ctx.api.bytes(`/api/projects/${pid(a, ctx)}/frame?${q}`);
      return { content: [{ type: 'image', data: Buffer.from(img.bytes).toString('base64'), mimeType: 'image/png' }, { type: 'text', text: `Scene ${a.scene} at ${Number(a.t ?? 0).toFixed(2)} s` }] };
    },
  },
  {
    name: 'render_video',
    title: 'Render video',
    description: 'Export scenes to video with the export pipeline (renders into the project\'s render folder). Returns a job; follow it with job_status. The report flags fixture audio.',
    inputSchema: Type.Object({
      scenes: Type.Optional(Type.Array(Type.String())),
      from: Type.Optional(Type.Number({ minimum: 0, description: 'Start in seconds (single scene).' })),
      to: Type.Optional(Type.Number({ minimum: 0, description: 'End in seconds (single scene).' })),
      preset: Type.Optional(Type.String({ description: 'Output preset ref (search_assets kind "out").' })),
      width: Type.Optional(Type.Integer({ minimum: 16 })),
      height: Type.Optional(Type.Integer({ minimum: 16 })),
      captions: Type.Optional(Type.Boolean()),
      project: Project,
    }),
    readOnly: false,
    run: async (a, ctx) => {
      const range = a.from !== undefined || a.to !== undefined ? { from: Math.round(Number(a.from ?? 0) * TICKS), to: Math.round(Number(a.to ?? 1e6) * TICKS) } : undefined;
      const j = await ctx.api.json<Job>('POST', `/api/projects/${pid(a, ctx)}/renders`, { ...(a.scenes ? { scenes: a.scenes } : {}), ...(range ? { range } : {}), ...(a.preset ? { preset: a.preset } : {}), ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), ...(a.captions !== undefined ? { captions: a.captions } : {}) });
      return jobView(await waitJob(ctx, j.id, Math.min(ctx.waitMs, 5000)));
    },
  },
  {
    name: 'job_status',
    title: 'Job status',
    description: 'State, progress and result of a job (voice design, takes, renders). Waits up to wait_seconds for it to finish.',
    inputSchema: Type.Object({ job: Type.String(), wait_seconds: Type.Optional(Type.Number({ minimum: 0, maximum: 600 })) }),
    readOnly: true,
    run: async (a, ctx) => jobView(await waitJob(ctx, String(a.job), Number(a.wait_seconds ?? 0) * 1000)),
  },
  {
    name: 'undo',
    title: 'Undo',
    description: 'Undo this agent session\'s latest change. Refused (CONFLICT) when the latest change was made by a person or another agent.',
    inputSchema: Type.Object({ project: Project }),
    readOnly: false,
    run: async (a, ctx) => ctx.api.json('POST', `/api/projects/${pid(a, ctx)}/undo`),
  },
  {
    name: 'diff_revisions',
    title: 'Diff revisions',
    description: 'What changed between two revisions: each history step after `from` up to `to` (default now) with its label, source (user, cli, agent:<session>) and commands.',
    inputSchema: Type.Object({ from: Type.Integer({ minimum: 0 }), to: Type.Optional(Type.Integer({ minimum: 0 })), project: Project }),
    readOnly: true,
    run: async (a, ctx) => {
      const p = pid(a, ctx);
      const [{ history }, st] = await Promise.all([ctx.api.json<{ history: { revision: number; at: string; label: string; source: string; commands: unknown[] }[] }>('GET', `/api/projects/${p}/history`), ctx.api.json<{ revision: number }>('GET', `/api/projects/${p}/state`)]);
      const from = Number(a.from);
      const to = a.to !== undefined ? Number(a.to) : st.revision;
      const steps = history.filter((h) => h.revision > from && h.revision <= to);
      const bySource: Record<string, number> = {};
      for (const s of steps) bySource[s.source] = (bySource[s.source] ?? 0) + 1;
      return { from, to, current: st.revision, bySource, steps };
    },
  },
];
