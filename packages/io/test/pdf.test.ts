import { describe, expect, it } from 'vitest';
import { createProjectState, ProjectSession, sequentialIds } from '@frame/core';
import { scriptPdf, textPdf } from '../src/index.js';

describe('PDF export (FR-PRJ-04)', () => {
  it('writes a valid, deterministic, paginated text PDF with escaped and WinAnsi text', () => {
    const blocks = Array.from({ length: 120 }, (_, i) => ({ text: `Line ${i} (with parens) \\ and “quotes” — café…`, font: 'mono' as const }));
    const a = textPdf(blocks, { title: 'T' });
    const b = textPdf(blocks, { title: 'T' });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const s = Buffer.from(a).toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(Number(/\/Count (\d+)/.exec(s)![1])).toBeGreaterThan(1);
    expect(s).toContain('\\(with parens\\) \\\\ and \\223quotes\\224 \\227 caf\\351\\205');
    // The xref offsets point at the objects they name.
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    const entries = s.slice(xref).split('\n').slice(3).filter((l) => / n $/.test(l)).map((l) => Number(l.slice(0, 10)));
    entries.forEach((off, i) => expect(s.slice(off, off + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });

  it('lays the script out with cues and dialogue', () => {
    const ids = sequentialIds();
    const state = createProjectState(ids, { name: 'Pilot', styleFamily: 'flat', frameRate: 24, output: { preset: 'out.landscape-hd@1', width: 1920, height: 1080, aspectRatios: ['16:9'] }, appVersion: '0', now: '2026-10-22T00:00:00Z', seed: 1 });
    const session = new ProjectSession(state, 0, { newId: ids, now: () => '2026-10-22T00:00:00Z' });
    const scene = state.episodes[state.project.episodes[0]!]!.scenes[0]!;
    const maya = session.apply({ commands: [{ name: 'instance.add', params: { scene, kind: 'character', asset: 'user.00000000-0000-4000-8000-000000000001@1', name: 'Maya', character: { look: 'default', view: 'three', posture: 'standing', auto: { idle: true, listening: true, blinks: true, talkingGestures: false } } } }] }).commands[0]!.params.id as string;
    session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: maya, text: 'Hello [pause 0.5s] there.', delivery: { emotion: 'happy' } } }, { name: 'project.setSettings', params: { description: '# About\nA *test*.' } }] });
    const s = Buffer.from(scriptPdf(session.state)).toString('latin1');
    for (const t of ['(Pilot)', '(About)', '(A test.)', '(MAYA)', '(\\(happy\\))', '(Hello there.)']) expect(s).toContain(t);
  });
});
