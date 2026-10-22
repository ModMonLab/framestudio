import { describe, expect, it } from 'vitest';
import {
  captionItems, DEFAULT_CAPTION_STYLE, estimateSpeechSeconds, parseScript, scheduleSceneAudio, scriptImportCommands, scriptRows, scriptText, secondsToTicks, stripPauseMarkers,
} from '../src/index.js';
import { addCharacter, newSession } from './helpers.js';

const MEDIA = { hash: 'sha256-' + 'b'.repeat(64), mime: 'audio/wav', ext: 'wav', bytes: 100, durationS: 2 };

describe('script import and export (FR-PRJ-04, FR-DLG-02)', () => {
  it('parses plain NAME: lines with emotions', () => {
    expect(parseScript('Maya: Hi there.\nLeo (Excited): Hello!\n\nhttp://example.com')).toEqual([
      { speaker: 'Maya', text: 'Hi there.' },
      { speaker: 'Leo', text: 'Hello!', emotion: 'excited' },
    ]);
  });

  it('parses Fountain dialogue blocks, headings and parentheticals, ignoring action lines', () => {
    const f = ['Title: Test', '', 'INT. CAFE - DAY', '', 'Maya walks in.', '', 'MAYA', '(happy)', 'Morning!', 'Is it open?', '', "LEO (V.O.)", 'It is.', ''].join('\n');
    expect(parseScript(f)).toEqual([
      { speaker: 'MAYA', text: 'Morning! Is it open?', emotion: 'happy', heading: 'INT. CAFE - DAY' },
      { speaker: 'LEO', text: 'It is.', heading: 'INT. CAFE - DAY' },
    ]);
  });

  it('imports lines in order for matching characters and reports unknown speakers', () => {
    const { session, scene } = newSession();
    addCharacter(session, scene, 'Maya Lopez');
    addCharacter(session, scene, 'Leo', 900);
    const r = scriptImportCommands(session.state, scene, parseScript('MAYA: One two three four five six seven eight nine ten eleven twelve thirteen fourteen.\nLeo (happy): Yes.\nZed: Who?'), { emotions: ['neutral', 'happy'] });
    expect(r.lines).toBe(2);
    expect(r.unknown).toEqual(['Zed']);
    session.apply({ commands: r.commands });
    const rows = scriptRows(session.state);
    expect(rows.map((x) => [x.speaker, x.emotion, x.take])).toEqual([['Maya Lopez', undefined, 'Missing'], ['Leo', 'happy', 'Missing']]);
    const lines = session.state.scenes[scene]!.clips.filter((c) => c.line).sort((a, b) => a.start - b.start);
    expect(lines[1]!.start).toBeGreaterThan(lines[0]!.end);
    // Lines longer than the scene grow it.
    expect(session.state.scenes[scene]!.duration).toBeGreaterThanOrEqual(lines[1]!.end);
    // A second import follows the last line.
    const again = scriptImportCommands(session.state, scene, parseScript('Leo: Again.'));
    session.apply({ commands: again.commands });
    expect(scriptRows(session.state).map((x) => x.text)).toEqual([lines[0]!.line!.text, 'Yes.', 'Again.']);
  });

  it('exports text and Fountain that parse back to the same lines', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    session.apply({ commands: [
      { name: 'line.add', params: { scene, speaker: maya, text: 'First.', start: 0 } },
      { name: 'line.add', params: { scene, speaker: maya, text: 'Second!', start: secondsToTicks(3), delivery: { emotion: 'happy' } } },
    ] });
    const text = scriptText(session.state, 'text');
    expect(text).toContain('Maya (happy): Second!');
    expect(parseScript(text).map((l) => l.text)).toEqual(['First.', 'Second!']);
    const fountain = scriptText(session.state, 'fountain');
    expect(fountain.startsWith('Title: Test\n')).toBe(true);
    expect(parseScript(fountain)).toEqual([
      expect.objectContaining({ speaker: 'MAYA', text: 'First.' }),
      expect.objectContaining({ speaker: 'MAYA', text: 'Second!', emotion: 'happy' }),
    ]);
  });
});

describe('dialogue details (FR-DLG-04/07)', () => {
  it('pause markers lengthen the estimate and never reach captions', () => {
    expect(estimateSpeechSeconds('Well [pause 1.5s] okay.') - estimateSpeechSeconds('Well okay.')).toBeCloseTo(1.5, 1);
    expect(stripPauseMarkers('Well [pause 1.5s] okay.')).toBe('Well okay.');
  });

  it('overlapping speech mixes both takes and stacks both captions', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const leo = addCharacter(session, scene, 'Leo', 900);
    const ids = session.apply({ commands: [
      { name: 'line.add', params: { scene, speaker: maya, text: 'I was saying that', start: secondsToTicks(1), durationS: 2 } },
      { name: 'line.add', params: { scene, speaker: leo, text: 'Wait, wait!', start: secondsToTicks(2), durationS: 2 } },
    ] }).commands.map((c) => c.params.id as string);
    for (const line of ids) {
      const take = session.apply({ commands: [{ name: 'take.add', params: { take: { line, lineRevision: 1, source: 'generated', fixture: true, status: 'ready', durationS: 2, media: MEDIA, engine: 'fixture' } } }] }).commands[0]!.params.id as string;
      session.apply({ commands: [{ name: 'line.chooseTake', params: { scene, id: line, take } }] });
    }
    const plan = scheduleSceneAudio(session.state, session.state.scenes[scene]!);
    const dlg = plan.events.filter((e) => e.bus === 'dialogue');
    expect(dlg.map((e) => e.start)).toEqual([1, 2]);
    expect(plan.speech).toEqual([[1, 4]]);
    const items = captionItems([
      { speaker: 'Maya', text: 'I was saying that', local: 1.5, duration: 2 },
      { speaker: 'Leo', text: 'Wait, wait!', local: 0.5, duration: 2 },
    ], DEFAULT_CAPTION_STYLE, 1920, 1080, true);
    expect(items).toHaveLength(1);
    const text = (items[0] as { text: string }).text;
    expect(text.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(text.indexOf('Maya:')).toBeLessThan(text.indexOf('Leo:'));
  });

  it('choosing a longer take ripples the following lines', () => {
    const { session, scene } = newSession();
    const maya = addCharacter(session, scene, 'Maya');
    const [a, b] = session.apply({ commands: [
      { name: 'line.add', params: { scene, speaker: maya, text: 'One.', start: 0, durationS: 1 } },
      { name: 'line.add', params: { scene, speaker: maya, text: 'Two.', start: secondsToTicks(1.5), durationS: 1 } },
    ] }).commands.map((c) => c.params.id as string);
    const take = session.apply({ commands: [{ name: 'take.add', params: { take: { line: a!, lineRevision: 1, source: 'generated', fixture: true, status: 'ready', durationS: 3, media: MEDIA, engine: 'fixture' } } }] }).commands[0]!.params.id as string;
    session.apply({ commands: [{ name: 'line.chooseTake', params: { scene, id: a!, take, ripple: true } }] });
    const clips = session.state.scenes[scene]!.clips;
    expect(clips.find((c) => c.id === a)!.end).toBe(secondsToTicks(3));
    expect(clips.find((c) => c.id === b)!.start).toBe(secondsToTicks(3.5));
  });
});
