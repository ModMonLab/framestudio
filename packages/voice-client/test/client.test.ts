import { describe, expect, it } from 'vitest';
import { FrameError } from '@frame/schema';
import { VoiceClient, nextTakeNumber, resolveDelivery, sourceLabel, takeDrafts, toAlignment, type WorkerJob } from '../src/index.js';

function fakeFetch(routes: Record<string, (init: RequestInit) => { status?: number; body: unknown }>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    const key = `${init.method ?? 'GET'} ${path}`;
    const h = routes[key];
    if (!h) return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: key } }), { status: 404, headers: { 'content-type': 'application/json' } });
    const r = h(init);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('VoiceClient (API-01..API-04)', () => {
  it('sends the bearer token and an idempotency key, and waits for jobs', async () => {
    let polls = 0;
    const { f, calls } = fakeFetch({
      'POST /v1/synthesize': () => ({ status: 202, body: { id: 'j1', kind: 'synthesize', state: 'queued', progress: 0, message: '', queuePosition: 0 } }),
      'GET /v1/jobs/j1': () => {
        polls++;
        return polls < 2
          ? { body: { id: 'j1', kind: 'synthesize', state: 'running', progress: 0.5, message: 'Generating', queuePosition: 0 } }
          : { body: { id: 'j1', kind: 'synthesize', state: 'succeeded', progress: 1, message: '', queuePosition: 0, result: { engine: 'fixture', fixture: true, takes: [{ audioHash: 'sha256-a', seed: 4, durationS: 1.2, sampleRate: 24000, settingsUsed: {} }] } } };
      },
    });
    const c = new VoiceClient({ url: 'http://w:8765/', token: 'tok', fetch: f, pollMs: 1 });
    const job = await c.synthesize({ text: 'Hi', language: 'en', voice: { refs: [] }, delivery: {}, takes: 1 });
    const progress: number[] = [];
    const res = await c.wait(job, { onProgress: (j: WorkerJob) => progress.push(j.progress) });
    expect(res.takes[0]?.audioHash).toBe('sha256-a');
    expect(progress).toEqual([0, 0.5, 1]);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok');
    expect(headers['Idempotency-Key']).toMatch(/^frame-[0-9a-f]{24}$/);
    expect(calls[0]!.url).toBe('http://w:8765/v1/synthesize');
  });

  it('maps worker error codes to Frame error codes', async () => {
    const { f } = fakeFetch({
      'POST /v1/synthesize': () => ({ status: 422, body: { error: { code: 'UNSUPPORTED_CONTROL', message: 'no pace', details: { control: 'pace' } } } }),
      'GET /v1/capabilities': () => ({ status: 401, body: { error: { code: 'UNAUTHORIZED', message: 'token' } } }),
    });
    const c = new VoiceClient({ url: 'http://w', fetch: f });
    await expect(c.synthesize({ text: 'x', language: 'en', voice: { refs: [] }, delivery: { pace: 2 }, takes: 1 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(c.capabilities()).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
  });

  it('reports an unreachable worker as WORKER_UNAVAILABLE with a hint', async () => {
    const c = new VoiceClient({ url: 'http://w', fetch: (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch });
    const e = await c.health().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(FrameError);
    expect((e as FrameError).code).toBe('WORKER_UNAVAILABLE');
    expect((e as FrameError).hint).toMatch(/Voice worker/);
  });

  it('failed and cancelled jobs throw', async () => {
    const c = new VoiceClient({ url: 'http://w', fetch: fakeFetch({}).f });
    await expect(c.wait({ id: 'x', kind: 'align', state: 'failed', progress: 0, message: '', queuePosition: 0, error: { code: 'OUT_OF_MEMORY', message: 'oom' } })).rejects.toMatchObject({ code: 'WORKER_UNAVAILABLE' });
    await expect(c.wait({ id: 'x', kind: 'align', state: 'cancelled', progress: 0, message: '', queuePosition: 0 })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('take helpers', () => {
  it('labels fixture output as not real speech (P7, NFR-18)', () => {
    expect(sourceLabel({ fixture: true })).toMatch(/not real speech/);
    expect(sourceLabel({ fixture: false })).toBe('Generated speech');
  });
  it('creates numbered drafts and clamps alignment', () => {
    const d = takeDrafts({ engine: 'fixture', fixture: true, takes: [{ audioHash: 'h1', seed: 1, durationS: 1, sampleRate: 24000, settingsUsed: {} }, { audioHash: 'h2', seed: null, durationS: 2, sampleRate: 24000, settingsUsed: { model: 'm' } }] }, 3);
    expect(d.map((x) => x.number)).toEqual([3, 4]);
    expect(d[1]).toMatchObject({ model: 'm', fixture: true });
    expect(d[1]!.seed).toBeUndefined();
    expect(nextTakeNumber([{ line: 'clp-1', number: 2 }, { line: 'clp-2', number: 9 }], 'clp-1')).toBe(3);
    const a = toAlignment({ words: [{ text: 'hi', start: -0.01, end: 0.2 }], phonemes: [], confidence: 1.3, method: 'fixture' });
    expect(a.words[0]!.start).toBe(0);
    expect(a.confidence).toBe(1);
  });
});

describe('delivery presets (Catalog Q2, FR-VOI-08)', () => {
  const all = { emotion: ['neutral', 'happy', 'deadpan'], pace: { min: 0.5, max: 2 }, instruction: true };
  it('a preset supplies defaults and the line overrides them', () => {
    expect(resolveDelivery({ preset: 'delivery.deadpan' }, { emotion: 'deadpan', instruction: 'flat, deadpan' }, all)).toEqual({ emotion: 'deadpan', instruction: 'flat, deadpan' });
    expect(resolveDelivery({ preset: 'delivery.deadpan', emotion: 'happy', pace: 1.2 }, { emotion: 'deadpan', instruction: 'flat' }, all)).toEqual({ emotion: 'happy', pace: 1.2, instruction: 'flat' });
  });
  it('sends only controls the engine reports', () => {
    expect(resolveDelivery({ pace: 1.3, instruction: 'whisper' }, { emotion: 'angry' }, { emotion: ['neutral'], pace: null, instruction: false })).toEqual({});
    expect(resolveDelivery({ pace: 1 }, undefined, all)).toEqual({});
  });
});
