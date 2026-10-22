/** Typed Voice API v1 client (SRS §5; services/voice-worker/openapi.yaml). Browser and Node (fetch). */
import { FrameError } from '@frame/schema';

export interface EngineCaps {
  id: string;
  fixture: boolean;
  label: string;
  models: { id: string; size: string; task: 'design' | 'clone' | 'tts' }[];
  languages: string[];
  controls: { emotion: string[]; pace: { min: number; max: number } | null; instruction: boolean; designInstruction?: boolean; seed: boolean; pauses: boolean };
  activeModels?: Record<string, string>;
}

export interface Capabilities {
  version: string;
  fixture: boolean;
  engines: EngineCaps[];
  aligner: { id: string; available: boolean; languages: string[] };
  transcriber: { available: boolean };
  gpu: { name: string; vramTotal: number; vramUsed: number; loaded?: string | null };
  limits: { maxTextChars: number; maxRefSeconds: number; minRefSeconds: number };
  queue: { busy: number };
}

export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface WorkerJob<R = unknown> {
  id: string;
  kind: string;
  state: JobState;
  progress: number;
  message: string;
  queuePosition: number;
  result?: R;
  error?: { code: string; message: string; details?: unknown };
}

export interface RefIn {
  hash: string;
  transcript: string;
  emotion?: string;
}

export interface GeneratedAudio {
  audioHash: string;
  seed: number | null;
  durationS: number;
  sampleRate: number;
}

export interface DesignResult {
  candidates: GeneratedAudio[];
  engine: string;
}

export interface RangeResult {
  refs: (GeneratedAudio & { emotion: string; transcript: string; similarity: number | null })[];
  engine: string;
}

export interface SynthResult {
  takes: (GeneratedAudio & { settingsUsed: Record<string, unknown> })[];
  engine: string;
  fixture: boolean;
}

export interface AlignResult {
  words: { text: string; start: number; end: number }[];
  phonemes: { p: string; start: number; end: number }[];
  confidence: number;
  method: 'forced' | 'transcribed+forced' | 'amplitude' | 'fixture';
  aligner?: string;
}

export interface ClientOptions {
  url: string;
  token?: string;
  fetch?: typeof fetch;
  /** Poll interval for jobs (ms). */
  pollMs?: number;
}

function key(): string {
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  return `frame-${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export class VoiceClient {
  readonly url: string;
  private readonly token?: string;
  private readonly f: typeof fetch;
  private readonly pollMs: number;

  constructor(o: ClientOptions) {
    this.url = o.url.replace(/\/+$/, '');
    this.token = o.token;
    this.f = o.fetch ?? fetch;
    this.pollMs = o.pollMs ?? 250;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...extra };
  }

  private async req<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    let res: Response;
    try {
      res = await this.f(`${this.url}${path}`, {
        method,
        headers: this.headers(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json', ...headers } : headers),
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
    } catch (e) {
      throw new FrameError('WORKER_UNAVAILABLE', `The voice worker at ${this.url} is not reachable`, { cause: String(e) }, 'Start the Voice Worker or check the URL in Settings → Voice worker.');
    }
    if (!res.ok) {
      let err: { code?: string; message?: string; details?: unknown } = {};
      try {
        err = ((await res.json()) as { error?: typeof err }).error ?? {};
      } catch {
        /* non-JSON error body */
      }
      throw workerError(res.status, err);
    }
    const ct = res.headers.get('content-type') ?? '';
    return (ct.includes('json') ? await res.json() : new Uint8Array(await res.arrayBuffer())) as T;
  }

  health(): Promise<{ ok: boolean; version: string }> {
    return this.req('GET', '/v1/health');
  }

  capabilities(): Promise<Capabilities> {
    return this.req('GET', '/v1/capabilities');
  }

  async uploadBlob(data: Uint8Array, filename = 'audio.wav', mime = 'audio/wav'): Promise<string> {
    const fd = new FormData();
    fd.append('file', new Blob([data as BlobPart], { type: mime }), filename);
    return (await this.req<{ hash: string }>('POST', '/v1/blobs', fd)).hash;
  }

  blob(hash: string): Promise<Uint8Array> {
    return this.req('GET', `/v1/blobs/${hash}`);
  }

  design(body: { description: string; language: string; sampleText: string; candidates: number; seed?: number }, idem = key()) {
    return this.req<WorkerJob<DesignResult>>('POST', '/v1/voices/design', body, { 'Idempotency-Key': idem });
  }

  range(body: { neutralRef: RefIn; description: string; emotions: string[]; text: string; language?: string }, idem = key()) {
    return this.req<WorkerJob<RangeResult>>('POST', '/v1/voices/range', body, { 'Idempotency-Key': idem });
  }

  prepare(body: { refs: RefIn[]; engine?: string; model?: string }) {
    return this.req<{ conditioningHash: string }>('POST', '/v1/voices/prepare', body);
  }

  synthesize(body: { text: string; language: string; voice: { refs: RefIn[]; conditioningHash?: string }; delivery: { emotion?: string; pace?: number; instruction?: string }; takes: number; seed?: number; format?: 'wav' | 'flac'; sampleRate?: number }, idem = key()) {
    return this.req<WorkerJob<SynthResult>>('POST', '/v1/synthesize', body, { 'Idempotency-Key': idem });
  }

  align(body: { audioHash: string; transcript: string; language: string }, idem = key()) {
    return this.req<WorkerJob<AlignResult>>('POST', '/v1/align', body, { 'Idempotency-Key': idem });
  }

  transcribe(body: { audioHash: string; language?: string }, idem = key()) {
    return this.req<WorkerJob<{ text: string }>>('POST', '/v1/transcribe', body, { 'Idempotency-Key': idem });
  }

  benchmark(model?: string) {
    return this.req<WorkerJob<{ rtf: number; peakVramMB: number; notes: string }>>('POST', '/v1/benchmark', { model });
  }

  job<R>(id: string): Promise<WorkerJob<R>> {
    return this.req('GET', `/v1/jobs/${id}`);
  }

  cancel(id: string): Promise<{ cancelled: boolean }> {
    return this.req('DELETE', `/v1/jobs/${id}`);
  }

  /** Waits for a job to finish, reporting progress; throws a coded FrameError on failure/cancel. */
  async wait<R>(job: WorkerJob<R>, opts: { onProgress?: (j: WorkerJob<R>) => void; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<R> {
    const t0 = Date.now();
    let j = job;
    for (;;) {
      opts.onProgress?.(j);
      if (j.state === 'succeeded') return j.result as R;
      if (j.state === 'failed') throw workerError(500, j.error ?? {});
      if (j.state === 'cancelled') throw new FrameError('CANCELLED', 'The voice job was cancelled');
      if (opts.signal?.aborted) {
        await this.cancel(j.id).catch(() => undefined);
        throw new FrameError('CANCELLED', 'The voice job was cancelled');
      }
      if (opts.timeoutMs && Date.now() - t0 > opts.timeoutMs) throw new FrameError('WORKER_UNAVAILABLE', 'The voice worker did not finish in time');
      await new Promise((r) => setTimeout(r, this.pollMs));
      j = await this.job<R>(j.id);
    }
  }
}

export function workerError(status: number, err: { code?: string; message?: string; details?: unknown }): FrameError {
  const code = err.code ?? 'ENGINE_ERROR';
  const msg = err.message ?? `Voice worker error (${status})`;
  switch (code) {
    case 'UNAUTHORIZED':
      return new FrameError('PERMISSION_REQUIRED', msg, { worker: code }, 'Set the worker token in Settings → Voice worker.');
    case 'NOT_FOUND':
      return new FrameError('NOT_FOUND', msg, { worker: code, details: err.details });
    case 'UNSUPPORTED_CONTROL':
    case 'TEXT_TOO_LONG':
    case 'REFERENCE_TOO_SHORT':
    case 'LANGUAGE_UNSUPPORTED':
    case 'INVALID_AUDIO':
      return new FrameError('VALIDATION_FAILED', msg, { worker: code, details: err.details });
    case 'CANCELLED':
      return new FrameError('CANCELLED', msg, { worker: code });
    case 'MODEL_NOT_INSTALLED':
    case 'OUT_OF_MEMORY':
    case 'BUSY':
      return new FrameError('WORKER_UNAVAILABLE', msg, { worker: code, details: err.details }, code === 'OUT_OF_MEMORY' ? 'Retry, or choose the 0.6B model in the worker settings.' : undefined);
    default:
      return new FrameError('WORKER_UNAVAILABLE', msg, { worker: code, details: err.details });
  }
}
