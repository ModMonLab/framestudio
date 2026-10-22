/** Conversion between worker results and project take records (FR-DLG-02, FR-LIP-01, API-04). */
import type { Alignment, Take } from '@frame/schema';
import type { AlignResult, Capabilities, SynthResult } from './client.js';

export function toAlignment(r: AlignResult): Alignment {
  return {
    words: r.words.map((w) => ({ text: w.text, start: Math.max(0, w.start), end: Math.max(0, w.end) })),
    phonemes: r.phonemes.map((p) => ({ p: p.p, start: Math.max(0, p.start), end: Math.max(0, p.end) })),
    method: r.method,
    confidence: Math.min(1, Math.max(0, r.confidence)),
    ...(r.aligner ? { aligner: r.aligner } : {}),
  };
}

/** Label shown wherever audio from a worker is presented; fixture output is never real speech (P7, NFR-18). */
export function sourceLabel(caps: Pick<Capabilities, 'fixture'> | { fixture: boolean }): string {
  return caps.fixture ? 'Fixture audio — not real speech' : 'Generated speech';
}

export interface TakeDraft {
  number: number;
  source: 'generated';
  engine: string;
  model?: string;
  fixture: boolean;
  seed?: number;
  durationS: number;
  audioHash: string;
}

/** One draft per synthesized take; the caller downloads `audioHash`, stores it as project media and aligns it. */
export function takeDrafts(result: SynthResult, firstNumber: number): TakeDraft[] {
  return result.takes.map((t, i) => ({
    number: firstNumber + i,
    source: 'generated',
    engine: result.engine,
    ...(typeof t.settingsUsed['model'] === 'string' ? { model: t.settingsUsed['model'] } : {}),
    fixture: result.fixture,
    ...(t.seed !== null ? { seed: t.seed } : {}),
    durationS: t.durationS,
    audioHash: t.audioHash,
  }));
}

export function nextTakeNumber(takes: Pick<Take, 'line' | 'number'>[], lineId: string): number {
  return takes.filter((t) => t.line === lineId).reduce((m, t) => Math.max(m, t.number), 0) + 1;
}
