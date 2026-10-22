/**
 * Voice workflows shared by the server and the CLI (FR-VOI-02, FR-VOI-07, FR-LIP-01): design candidates, save a
 * designed voice, generate takes for lines and align them. Storage and edits are injected, so the same code runs
 * against an open project in the server or in CLI local mode.
 */
import { FrameError, type AssetManifest, type Command, type Delivery, type MediaRef, type Take, type VoiceData } from '@frame/schema';
import type { VoiceClient, WorkerJob } from './client.js';
import { nextTakeNumber, toAlignment } from './takes.js';

export interface ProjectAccess {
  /** Current project state (read after every apply). */
  state(): { takes: Record<string, Take>; scenes: Record<string, { clips: { id: string; line?: { text: string; revision: number; take?: string; delivery: Delivery; speaker: string; muted: boolean } }[]; instances: { id: string; name: string; character?: { voice?: string } }[] }>; assets: Record<string, AssetManifest> };
  apply(commands: Command[], label?: string): { commands: Command[] };
  storeMedia(bytes: Uint8Array, meta: { ext: string; mime: string; durationS?: number; sampleRate?: number; channels?: number }): MediaRef;
  readMedia(hash: string): Uint8Array;
  /** Resolves a voice asset (project-local or library). */
  voice(ref: string): AssetManifest | undefined;
}

export interface Progress {
  progress: number;
  message: string;
}

interface Ctl {
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
}

const stripPauses = (t: string) => t.replace(/\[pause\s+\d+(?:\.\d+)?s\]/gi, ' ').replace(/\s+/g, ' ').trim();

async function run<R>(client: VoiceClient, job: WorkerJob<R>, ctl: Ctl, scale: [number, number], label: string): Promise<R> {
  return client.wait(job, {
    ...(ctl.signal ? { signal: ctl.signal } : {}),
    onProgress: (j) => ctl.onProgress?.({ progress: scale[0] + (scale[1] - scale[0]) * j.progress, message: j.message || label }),
  });
}

/* ------------------------------------------------------------------ design (FR-VOI-02) */

export interface DesignCandidate {
  media: MediaRef;
  seed: number | null;
  durationS: number;
  fixture: boolean;
}

export async function designCandidates(client: VoiceClient, p: ProjectAccess, req: { description: string; language: string; sampleText: string; candidates: number; seed?: number }, ctl: Ctl = {}): Promise<{ candidates: DesignCandidate[]; engine: string; fixture: boolean }> {
  const caps = await client.capabilities();
  const job = await client.design(req);
  const res = await run(client, job, ctl, [0, 0.9], 'Designing voice');
  const candidates: DesignCandidate[] = [];
  for (const c of res.candidates) {
    const bytes = await client.blob(c.audioHash);
    candidates.push({ media: p.storeMedia(bytes, { ext: 'wav', mime: 'audio/wav', durationS: c.durationS, sampleRate: c.sampleRate, channels: 1 }), seed: c.seed, durationS: c.durationS, fixture: caps.fixture });
  }
  ctl.onProgress?.({ progress: 1, message: 'Candidates ready' });
  return { candidates, engine: res.engine, fixture: caps.fixture };
}

/** Builds a voice asset manifest whose neutral reference is the chosen candidate (FR-VOI-02). */
export function designedVoiceManifest(o: { id: string; name: string; description: string; language: string; sampleText: string; candidate: DesignCandidate; date: string; version?: number }): AssetManifest {
  const data: VoiceData = {
    description: o.description,
    method: 'design',
    language: o.language,
    references: [{ emotion: 'neutral', media: o.candidate.media, transcript: o.sampleText, ...(o.candidate.seed !== null ? { seed: o.candidate.seed } : {}), accepted: true, fixture: o.candidate.fixture }],
    auditions: [{ text: o.sampleText, media: o.candidate.media, emotion: 'neutral' }],
    engineData: {},
  };
  return {
    schemaVersion: 1,
    id: o.id,
    version: o.version ?? 1,
    kind: 'voice',
    name: o.name,
    category: 'Voices',
    tags: ['voice', 'designed', ...(o.candidate.fixture ? ['fixture'] : [])],
    synonyms: [],
    families: [],
    views: [],
    viewExemptions: {},
    anchors: {},
    capabilities: [],
    parameters: [],
    dependencies: [],
    layering: {},
    previews: {},
    license: { id: 'LicenseRef-Project-Owner', redistributable: false, commercialUse: true, attribution: 'Designed in this project.' },
    provenance: { method: 'generated', author: o.candidate.fixture ? 'Frame fixture worker (not real speech)' : 'Frame voice designer', date: o.date },
    review: { status: 'pending' },
    data,
  } as AssetManifest;
}

/* ------------------------------------------------------------------ takes (FR-VOI-07, FR-LIP-01) */

export interface GenerateRequest {
  scene: string;
  lines: string[];
  takes: number;
  seed?: number;
  /** Override the speaker's voice. */
  voice?: string;
  language?: string;
}

export interface GenerateResult {
  takes: { line: string; take: string; status: 'ready' | 'failed'; error?: string }[];
  fixture: boolean;
}

export async function generateTakes(client: VoiceClient, p: ProjectAccess, req: GenerateRequest, ctl: Ctl = {}): Promise<GenerateResult> {
  if (req.takes < 1 || req.takes > 8) throw new FrameError('VALIDATION_FAILED', 'Takes must be between 1 and 8');
  const caps = await client.capabilities();
  const scene = p.state().scenes[req.scene];
  if (!scene) throw new FrameError('NOT_FOUND', `Scene ${req.scene} not found`);
  const out: GenerateResult = { takes: [], fixture: caps.fixture };
  const uploaded = new Map<string, string>();
  const n = req.lines.length;
  for (const [li, lineId] of req.lines.entries()) {
    const base = li / n;
    const span = 1 / n;
    const clip = p.state().scenes[req.scene]!.clips.find((c) => c.id === lineId);
    if (!clip?.line) throw new FrameError('NOT_FOUND', `Line ${lineId} not found in scene ${req.scene}`);
    const line = clip.line;
    if (line.muted) continue;
    const speaker = p.state().scenes[req.scene]!.instances.find((i) => i.id === line.speaker);
    const voiceRef = req.voice ?? speaker?.character?.voice;
    if (!voiceRef) throw new FrameError('VALIDATION_FAILED', `${speaker?.name ?? 'The speaker'} has no voice`, { line: lineId }, 'Assign a voice to the character, or pass a voice.');
    const voice = p.voice(voiceRef);
    const vd = voice?.data as VoiceData | undefined;
    if (!voice || voice.kind !== 'voice' || !vd) throw new FrameError('NOT_FOUND', `Voice ${voiceRef} not found`);
    if (vd.method === 'clone' && !vd.consent) throw new FrameError('CONSENT_REQUIRED', `Voice ${voice.name} has no consent record`);
    const refs = [];
    for (const r of vd.references.filter((x) => x.accepted)) {
      let h = uploaded.get(r.media.hash);
      if (!h) {
        h = await client.uploadBlob(p.readMedia(r.media.hash), `ref.${r.media.ext}`, r.media.mime);
        uploaded.set(r.media.hash, h);
      }
      refs.push({ hash: h, transcript: r.transcript, emotion: r.emotion });
    }
    if (!refs.length) throw new FrameError('VALIDATION_FAILED', `Voice ${voice.name} has no accepted references`);
    // Delivery controls are sent only when the engine supports them (FR-VOI-08).
    const engine = caps.engines[0];
    const delivery: { emotion?: string; pace?: number; instruction?: string } = {};
    if (line.delivery.emotion && engine?.controls.emotion.includes(line.delivery.emotion)) delivery.emotion = line.delivery.emotion;
    if (line.delivery.pace !== undefined && line.delivery.pace !== 1 && engine?.controls.pace) delivery.pace = line.delivery.pace;
    if (line.delivery.instruction && engine?.controls.instruction) delivery.instruction = line.delivery.instruction;
    // Placeholder take records show "Generating" immediately and survive failures with their error.
    const first = nextTakeNumber(Object.values(p.state().takes), lineId);
    const now = new Date().toISOString();
    const created = p.apply(Array.from({ length: req.takes }, (_x, i) => ({ name: 'take.add', params: { number: first + i, createdAt: now, take: { line: lineId, lineRevision: line.revision, source: 'generated', voice: voiceRef, engine: engine?.id ?? 'unknown', fixture: caps.fixture, settings: line.delivery, status: 'generating' } } })), `Generate ${req.takes} take(s)`);
    const ids = created.commands.map((c) => (c.params as { id: string }).id);
    try {
      const job = await client.synthesize({ text: line.text, language: req.language ?? vd.language, voice: { refs }, delivery, takes: req.takes, ...(req.seed !== undefined ? { seed: req.seed } : {}) });
      const res = await run(client, job, ctl, [base, base + span * 0.6], 'Generating takes');
      for (const [i, t] of res.takes.entries()) {
        const id = ids[i]!;
        const bytes = await client.blob(t.audioHash);
        const media = p.storeMedia(bytes, { ext: 'wav', mime: 'audio/wav', durationS: t.durationS, sampleRate: t.sampleRate, channels: 1 });
        const aj = await client.align({ audioHash: t.audioHash, transcript: stripPauses(line.text), language: req.language ?? vd.language });
        const al = await run(client, aj, ctl, [base + span * (0.6 + (0.4 * i) / res.takes.length), base + span * (0.6 + (0.4 * (i + 1)) / res.takes.length)], 'Aligning');
        const model = t.settingsUsed['model'];
        p.apply([{ name: 'take.update', params: { id, set: { status: 'ready', media, durationS: t.durationS, alignment: toAlignment(al), ...(t.seed !== null ? { seed: t.seed } : {}), engine: res.engine, ...(typeof model === 'string' ? { model } : {}), fixture: res.fixture } } }], 'Take ready');
        out.takes.push({ line: lineId, take: id, status: 'ready' });
      }
      // Auto-select only when the line has no chosen take for its current text (FR-VOI-09).
      const cur = p.state().scenes[req.scene]!.clips.find((c) => c.id === lineId)!.line!;
      const chosen = cur.take ? p.state().takes[cur.take] : undefined;
      if ((!chosen || chosen.lineRevision !== cur.revision || chosen.status !== 'ready') && cur.revision === line.revision) {
        p.apply([{ name: 'line.chooseTake', params: { scene: req.scene, id: lineId, take: ids[0] } }], 'Choose take');
      }
    } catch (e) {
      const err = e instanceof FrameError ? e : new FrameError('WORKER_UNAVAILABLE', (e as Error).message);
      const pending = ids.filter((id) => p.state().takes[id]?.status === 'generating');
      if (pending.length) p.apply(pending.map((id) => ({ name: 'take.update', params: { id, set: { status: err.code === 'CANCELLED' ? 'cancelled' : 'failed', error: { code: err.code, message: err.message } } } })), 'Take failed');
      for (const id of pending) out.takes.push({ line: lineId, take: id, status: 'failed', error: err.message });
      if (err.code === 'CANCELLED') throw err;
    }
  }
  ctl.onProgress?.({ progress: 1, message: 'Done' });
  return out;
}

/* ------------------------------------------------------------------ emotional range bank (FR-VOI-03, FR-VOI-10) */

/** Default emotions of the range bank (FR-VOI-03); neutral is the voice's existing reference. */
export const RANGE_EMOTIONS = ['happy', 'sad', 'angry', 'nervous', 'whisper', 'excited', 'deadpan'];

export interface RangeCandidate {
  emotion: string;
  media: MediaRef;
  transcript: string;
  seed: number | null;
  durationS: number;
  /** Speaker similarity to the neutral reference (0–1), when the engine reports it. */
  similarity: number | null;
  fixture: boolean;
}

/** Renders reference clips for emotions from the voice's neutral reference (FR-VOI-03). */
export async function rangeCandidates(client: VoiceClient, p: ProjectAccess, voiceRef: string, req: { emotions?: string[]; text?: string }, ctl: Ctl = {}): Promise<{ candidates: RangeCandidate[]; engine: string }> {
  const voice = p.voice(voiceRef);
  const vd = voice?.data as VoiceData | undefined;
  if (!voice || voice.kind !== 'voice' || !vd) throw new FrameError('NOT_FOUND', `Voice ${voiceRef} not found`);
  const neutral = vd.references.find((r) => r.emotion === 'neutral' && r.accepted);
  if (!neutral) throw new FrameError('VALIDATION_FAILED', `${voice.name} has no accepted neutral reference`);
  const caps = await client.capabilities();
  const supported = caps.engines[0]?.controls.emotion ?? [];
  const emotions = (req.emotions ?? RANGE_EMOTIONS).filter((e) => e !== 'neutral');
  const unsupported = emotions.filter((e) => !supported.includes(e));
  if (unsupported.length) throw new FrameError('VALIDATION_FAILED', `The voice engine does not support: ${unsupported.join(', ')}`, { supported });
  const hash = await client.uploadBlob(p.readMedia(neutral.media.hash), `neutral.${neutral.media.ext}`, neutral.media.mime);
  const text = req.text ?? neutral.transcript;
  const job = await client.range({ neutralRef: { hash, transcript: neutral.transcript, emotion: 'neutral' }, description: vd.description, emotions, text, language: vd.language });
  const res = await run(client, job, ctl, [0, 0.9], 'Rendering emotions');
  const candidates: RangeCandidate[] = [];
  for (const r of res.refs) {
    const media = p.storeMedia(await client.blob(r.audioHash), { ext: 'wav', mime: 'audio/wav', durationS: r.durationS, sampleRate: r.sampleRate, channels: 1 });
    candidates.push({ emotion: r.emotion, media, transcript: r.transcript || text, seed: r.seed, durationS: r.durationS, similarity: r.similarity, fixture: caps.fixture });
  }
  ctl.onProgress?.({ progress: 1, message: 'Range ready' });
  return { candidates, engine: res.engine };
}

/**
 * A new voice version with accepted emotion references (FR-VOI-10: changing a voice creates a new version; lines keep
 * their takes). Accepted references replace earlier ones of the same emotion.
 */
export function voiceWithReferences(voice: AssetManifest, accepted: RangeCandidate[], date: string): AssetManifest {
  const vd = voice.data as VoiceData;
  const refs = vd.references.filter((r) => !accepted.some((a) => a.emotion === r.emotion));
  for (const a of accepted) refs.push({ emotion: a.emotion, media: a.media, transcript: a.transcript, ...(a.seed !== null ? { seed: a.seed } : {}), accepted: true, fixture: a.fixture });
  return {
    ...voice,
    version: voice.version + 1,
    tags: [...new Set([...voice.tags, ...(accepted.some((a) => a.fixture) ? ['fixture'] : [])])],
    provenance: { ...voice.provenance, date },
    data: { ...vd, references: refs, auditions: [...vd.auditions, ...accepted.map((a) => ({ text: a.transcript, media: a.media, emotion: a.emotion }))], engineData: {} },
  } as AssetManifest;
}
