/**
 * Scripts (FR-PRJ-04, FR-DLG-01/02): import a written script (plain `NAME: line` or Fountain) as lines in order,
 * and export every line in scene order as plain text or Fountain. Lines keep one canonical record; the script is a
 * view of it.
 */
import type { Command } from '@frame/schema';
import type { ProjectState } from './state.js';
import { formatTimecode, TICKS_PER_SECOND } from './time.js';
import { lineTakeState } from './validate.js';
import { estimateSpeechSeconds } from './commands/timeline.js';

export interface ScriptLine {
  speaker: string;
  text: string;
  /** Fountain parenthetical or `NAME (emotion):` → a delivery emotion hint. */
  emotion?: string;
  /** Scene heading the line follows (Fountain INT./EXT.), when present. */
  heading?: string;
}

const HEADING = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const TITLE_KEY = /^(title|credit|author|authors|source|draft date|date|contact|copyright|notes)\s*:/i;
const CUE = /^([A-Z][A-Z0-9 .'-]*[A-Z0-9])(\s*\(([^)]*)\))?\s*(\^)?$/;

/** Parses `NAME: text` lines, or Fountain dialogue blocks (an all-caps cue line, optional parenthetical, dialogue). */
export function parseScript(text: string): ScriptLine[] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const out: ScriptLine[] = [];
  let heading: string | undefined;
  // A Fountain title page (`Title:`, `Author:`, …) runs to the first blank line and is not dialogue.
  let start = rows.findIndex((r) => r.trim());
  if (start >= 0 && TITLE_KEY.test(rows[start]!.trim())) while (start < rows.length && rows[start]!.trim()) start++;
  for (let i = Math.max(0, start); i < rows.length; i++) {
    const raw = rows[i]!.trim();
    if (!raw) continue;
    if (HEADING.test(raw) || raw.startsWith('.')) {
      heading = raw.replace(/^\./, '').trim();
      continue;
    }
    // Plain form: "Name: text" or "Name (happy): text".
    const plain = /^([^:()]{1,40}?)\s*(?:\(([^)]*)\))?\s*:\s*(.+)$/.exec(raw);
    if (plain && !/^\s*https?$/i.test(plain[1]!)) {
      out.push({ speaker: plain[1]!.trim(), text: plain[3]!.trim(), ...(plain[2] ? { emotion: plain[2].trim().toLowerCase() } : {}), ...(heading ? { heading } : {}) });
      continue;
    }
    // Fountain: a cue line in capitals followed by dialogue lines until a blank line.
    const cue = CUE.exec(raw);
    const prevBlank = i === 0 || !rows[i - 1]!.trim();
    if (cue && prevBlank && rows[i + 1]?.trim()) {
      let emotion = cue[3]?.trim().toLowerCase();
      const lines: string[] = [];
      let j = i + 1;
      for (; j < rows.length && rows[j]!.trim(); j++) {
        const l = rows[j]!.trim();
        if (/^\(.*\)$/.test(l)) emotion ??= l.slice(1, -1).trim().toLowerCase();
        else lines.push(l);
      }
      if (lines.length) {
        const name = cue[1]!.replace(/\s+(V\.O\.|O\.S\.|CONT'D)$/i, '').trim();
        out.push({ speaker: name, text: lines.join(' '), ...(emotion && !/^(v\.o\.|o\.s\.|cont'd)$/i.test(emotion) ? { emotion } : {}), ...(heading ? { heading } : {}) });
      }
      i = j;
    }
    // Anything else (action lines, transitions) is not dialogue.
  }
  return out;
}

export interface ScriptImport {
  commands: Command[];
  /** Speakers in the script with no character of that name in the scene. */
  unknown: string[];
  lines: number;
}

/**
 * Lines for a scene from a parsed script: speakers match the scene's characters by name (case-insensitive, or by
 * first name); lines follow each other after the scene's last line with estimated placeholder durations.
 */
export function scriptImportCommands(state: ProjectState, sceneId: string, script: ScriptLine[], o: { at?: number; gapS?: number; emotions?: string[] } = {}): ScriptImport {
  const scene = state.scenes[sceneId];
  if (!scene) throw new Error(`Scene ${sceneId} not found`);
  const chars = scene.instances.filter((i) => i.kind === 'character');
  const find = (name: string) => {
    const n = name.toLowerCase();
    return chars.find((c) => c.name.toLowerCase() === n) ?? chars.find((c) => c.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
  };
  const unknown = [...new Set(script.filter((l) => !find(l.speaker)).map((l) => l.speaker))];
  const lastEnd = Math.max(0, ...scene.clips.filter((c) => c.line).map((c) => c.end));
  let t = o.at ?? (lastEnd ? lastEnd + 0.3 * TICKS_PER_SECOND : 0.5 * TICKS_PER_SECOND);
  const gap = Math.round((o.gapS ?? 0.35) * TICKS_PER_SECOND);
  const commands: Command[] = [];
  for (const l of script) {
    const who = find(l.speaker);
    if (!who) continue;
    const durationS = estimateSpeechSeconds(l.text);
    const emotion = l.emotion && (!o.emotions || o.emotions.includes(l.emotion)) ? l.emotion : undefined;
    commands.push({ name: 'line.add', params: { scene: sceneId, speaker: who.id, text: l.text, start: Math.round(t), durationS, ...(emotion ? { delivery: { emotion } } : {}) } });
    t += durationS * TICKS_PER_SECOND + gap;
  }
  const end = Math.ceil(t / TICKS_PER_SECOND) * TICKS_PER_SECOND;
  if (end > scene.duration) commands.unshift({ name: 'scene.setDuration', params: { id: sceneId, durationS: end / TICKS_PER_SECOND } });
  return { commands, unknown, lines: commands.filter((c) => c.name === 'line.add').length };
}

export interface ScriptRow { scene: string; sceneName: string; line: string; at: string; speaker: string; text: string; emotion?: string; take: string }

/** Every line in scene order (episodes in order), with take state (FR-PRJ-04 Script view). */
export function scriptRows(state: ProjectState): ScriptRow[] {
  const rows: ScriptRow[] = [];
  for (const e of state.project.episodes) for (const id of state.episodes[e]?.scenes ?? []) {
    const sc = state.scenes[id];
    if (!sc) continue;
    for (const c of sc.clips.filter((x) => x.line).sort((a, b) => a.start - b.start)) {
      rows.push({ scene: sc.id, sceneName: sc.name, line: c.id, at: formatTimecode(c.start), speaker: sc.instances.find((i) => i.id === c.line!.speaker)?.name ?? '?', text: c.line!.text, ...(c.line!.delivery.emotion ? { emotion: c.line!.delivery.emotion } : {}), take: lineTakeState(state, c) });
    }
  }
  return rows;
}

/** The script as plain text (`NAME: line`) or Fountain-compatible text. */
export function scriptText(state: ProjectState, format: 'text' | 'fountain' = 'text'): string {
  const rows = scriptRows(state);
  const out: string[] = format === 'fountain' ? [`Title: ${state.project.name}`, ''] : [];
  let scene = '';
  for (const r of rows) {
    if (r.scene !== scene) {
      scene = r.scene;
      out.push(format === 'fountain' ? `.${r.sceneName.toUpperCase()}` : `# ${r.sceneName}`, '');
    }
    if (format === 'fountain') out.push(r.speaker.toUpperCase(), ...(r.emotion && r.emotion !== 'neutral' ? [`(${r.emotion})`] : []), r.text, '');
    else out.push(`${r.speaker}${r.emotion && r.emotion !== 'neutral' ? ` (${r.emotion})` : ''}: ${r.text}`);
  }
  return out.join('\n').trimEnd() + '\n';
}
