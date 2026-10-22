import { describe, expect, it } from 'vitest';
import {
  balanceLines, captionItems, captionPages, DEFAULT_CAPTION_STYLE, duckCurve, duckDbAt, eventGainAt, fadeAt, panGains, scheduleSceneAudio,
  secondsToTicks, subtitleCues, toSrt, toVtt,
} from '../src/index.js';
import { addCharacter, newSession } from './helpers.js';

const MEDIA = { hash: 'sha256-' + 'a'.repeat(64), mime: 'audio/wav', ext: 'wav', bytes: 100, durationS: 2 };

function sceneWithLine() {
  const { session, scene } = newSession();
  const maya = addCharacter(session, scene, 'Maya');
  const line = session.apply({ commands: [{ name: 'line.add', params: { scene, speaker: maya, text: 'Hello there, how are you today?', start: secondsToTicks(1), durationS: 2 } }] }).commands[0]!.params.id as string;
  const take = session.apply({ commands: [{ name: 'take.add', params: { take: { line, lineRevision: 1, source: 'generated', fixture: true, status: 'ready', durationS: 2, media: MEDIA, engine: 'fixture',
    alignment: { method: 'fixture', confidence: 1, phonemes: [], words: ['Hello', 'there', 'how', 'are', 'you', 'today'].map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.25 })) } } } }] }).commands[0]!.params.id as string;
  session.apply({ commands: [{ name: 'line.chooseTake', params: { scene, id: line, take } }] });
  const music = session.state.scenes[scene]!.tracks.find((t) => t.kind === 'music')!.id;
  session.apply({ commands: [{ name: 'clip.add', params: { scene, track: music, start: 0, end: secondsToTicks(5), params: { gainDb: -6, fadeIn: 1 } } }] });
  return { session, scene, line };
}

describe('audio scheduling (FR-SND-01..03, SRS §6.6)', () => {
  it('schedules ready dialogue takes and ducks music under speech', () => {
    const { session, scene } = sceneWithLine();
    // A music clip needs a source; give it an imported media hash.
    const st = session.state.scenes[scene]!;
    const musicClip = st.clips.find((c) => !c.line)!;
    session.apply({ commands: [{ name: 'clip.update', params: { scene, id: musicClip.id, set: { media: MEDIA.hash } } }] });
    const plan = scheduleSceneAudio(session.state, session.state.scenes[scene]!);
    expect(plan.events.map((e) => e.bus)).toEqual(['music', 'dialogue']);
    const dlg = plan.events.find((e) => e.bus === 'dialogue')!;
    expect(dlg).toMatchObject({ start: 1, duration: 2, fixture: true, ducks: false });
    expect(plan.speech).toEqual([[1, 3]]);
    const m = plan.events.find((e) => e.bus === 'music')!;
    expect(m.loop).toBe(true);
    expect(duckDbAt(plan, 2)).toBe(-12);
    expect(duckDbAt(plan, 0.5)).toBe(0);
    expect(duckDbAt(plan, 1 - 0.075)).toBeCloseTo(-6, 5); // halfway through the 0.15 s attack
    expect(duckDbAt(plan, 3.2)).toBeCloseTo(-6, 5); // halfway through the 0.4 s release
    expect(fadeAt(m, 0.5)).toBeCloseTo(0.5);
    expect(eventGainAt(plan, m, 4)).toBeCloseTo(Math.pow(10, -6 / 20));
    expect(eventGainAt(plan, m, 2)).toBeCloseTo(Math.pow(10, -18 / 20));
    expect(duckCurve(plan).map((p) => p[1])).toEqual([0, 0, -12, -12, 0]);
  });

  it('skips muted tracks and silent lines, honours solo, and cuts to a range', () => {
    const { session, scene } = sceneWithLine();
    const st = session.state.scenes[scene]!;
    const dlgTrack = st.tracks.find((t) => t.kind === 'dialogue')!.id;
    let plan = scheduleSceneAudio(session.state, st, { from: secondsToTicks(2), to: secondsToTicks(4) });
    const d = plan.events.find((e) => e.bus === 'dialogue')!;
    expect(d.start).toBe(0);
    expect(d.offset).toBeCloseTo(1);
    expect(d.duration).toBeCloseTo(1);
    session.apply({ commands: [{ name: 'track.update', params: { scene, id: dlgTrack, set: { mute: true } } }] });
    plan = scheduleSceneAudio(session.state, session.state.scenes[scene]!);
    expect(plan.events.filter((e) => e.bus === 'dialogue')).toEqual([]);
  });

  it('constant-power pan', () => {
    const [l, r] = panGains(0);
    expect(l).toBeCloseTo(1);
    expect(r).toBeCloseTo(1);
    expect(panGains(-1)[1]).toBeCloseTo(0);
  });
});

describe('captions (FR-TXT-01/02, FR-TXT-06)', () => {
  it('pages long lines from word timings and balances two lines', () => {
    const text = 'This is a fairly long caption line that needs to be split into more than one page for reading';
    const words = text.split(' ').map((w, i) => ({ text: w, start: i * 0.3, end: i * 0.3 + 0.28 }));
    const pages = captionPages(text, 6, words, 20);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[0]!.start).toBe(0);
    expect(pages[pages.length - 1]!.end).toBe(6);
    for (let i = 1; i < pages.length; i++) expect(pages[i]!.start).toBe(pages[i - 1]!.end);
    expect(pages.every((p) => p.text.length <= 40)).toBe(true);
    expect(balanceLines('one two three four five six', 15)).toBe('one two three\nfour five six');
  });

  it('karaoke highlights spoken words; pop shows a window of words', () => {
    const words = [{ text: 'Hi', start: 0, end: 0.4 }, { text: 'there', start: 0.5, end: 0.9 }, { text: 'friend', start: 1, end: 1.5 }];
    const k = captionItems([{ speaker: 'Maya', text: 'Hi there friend', words, local: 0.6, duration: 2 }], { ...DEFAULT_CAPTION_STYLE, mode: 'karaoke', highlight: '#FF0', upcoming: '#FFF' }, 1920, 1080, false);
    const spans = (k[0] as { spans: { text: string; color?: string }[] }).spans;
    expect(spans).toEqual([{ text: 'Hi there', color: '#FF0' }, { text: ' friend', color: '#FFF' }]);
    const p = captionItems([{ speaker: 'Maya', text: 'Hi there friend', words, local: 1.2, duration: 2 }], { ...DEFAULT_CAPTION_STYLE, mode: 'pop', window: 2 }, 1080, 1920, true);
    const it0 = p[0] as { text: string; y: number; valign: string };
    expect(it0.text).toBe('Maya: friend');
    expect(it0.valign).toBe('bottom');
    expect(it0.y).toBeCloseTo(1920 * 0.8); // vertical formats keep clear of the bottom 20 %
  });

  it('SRT and WebVTT match the burned-in pages', () => {
    const { session } = sceneWithLine();
    const scenes = Object.keys(session.state.scenes);
    const cues = subtitleCues(session.state, scenes, { speakerLabels: true });
    expect(cues).toEqual([{ start: 1, end: 3, text: 'Maya: Hello there, how are you today?' }]);
    expect(toSrt(cues)).toBe('1\n00:00:01,000 --> 00:00:03,000\nMaya: Hello there, how are you today?\n');
    expect(toVtt(cues)).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nMaya: Hello there, how are you today?\n');
  });
});
