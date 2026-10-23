/** Generates docs/formats/ from the published schemas in @frame/schema (`pnpm docs:formats`, FR-DAT-12, FR-CLI-07). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsonSchema, schemas } from '../../packages/schema/src/index.js';

type J = { type?: string | string[]; description?: string; properties?: Record<string, J>; required?: string[]; items?: J; anyOf?: J[]; const?: unknown; enum?: unknown[]; patternProperties?: Record<string, J>; additionalProperties?: boolean | J; pattern?: string; minimum?: number; maximum?: number };

const ABOUT: Record<string, string> = {
  project: '`project.json` at the root of a project folder: name, settings, style family, frame rate, output, captions, cast and episode order.',
  episode: '`episodes/<id>/episode.json`: name, scene order and notes.',
  scene: '`episodes/<id>/scenes/<scn_id>.json`: stage, instances, cameras, tracks and clips (times in ticks, 48 000 per second; half-open intervals).',
  instance: 'One object on a scene\'s stage (character, prop, image, set piece, group, text).',
  camera: 'A scene camera: centre, width, rotation, lens, framing preset and subjects.',
  track: 'A timeline track (shot, camera move, dialogue, lip sync, acting, face, gaze, effect, music, ambience, sfx, text).',
  clip: 'A timed item on a track; dialogue clips carry a line.',
  line: 'A line of dialogue inside a dialogue clip: speaker, text, revision, delivery, chosen take.',
  take: '`assets/takes/<tak_id>.json`: one recording or generation of a line, with its media and alignment.',
  alignment: 'Word and phoneme timings of a take (forced, transcribed+forced, or amplitude).',
  voice: 'The `data` of a voice asset: method, language, references, consent.',
  consent: 'The consent record stored with every cloned voice and exported with it.',
  media: 'A content-addressed media reference (`assets/media/sha256-<hash>.<ext>`).',
  asset: 'Every library or project-local asset manifest (parts, props, kits, actions, voices, templates, …).',
  locks: '`locks/assets.json`: every referenced library asset version with its content hash.',
  package: '`manifest.json` inside a .frameproj, .framechar, .framevoice or .frameasset zip.',
  command: 'One engine command (name + params): the only way state changes.',
  batch: 'A list of commands applied atomically (`frame apply`, `POST /commands`, MCP apply_commands).',
  error: 'A structured error (code, message, details, hint) used by the engine, CLI, server and MCP.',
  problem: 'A validation problem with severity and an optional fix.',
  history: 'One entry of `history/commands.jsonl`: a committed change with its source and commands.',
  'cli-envelope': 'What every `frame … --json` command prints: `{ ok: true, result }` or `{ ok: false, error }`.',
  'cli-mutation': 'The `result` of every command that edits a project (applied, or planned with --dry-run).',
  job: 'A job on the Frame Server (exports, voice generation, imports, thumbnails).',
};

function typeOf(s: J): string {
  if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
  if (s.anyOf) return s.anyOf.map(typeOf).join(' \\| ');
  if (s.enum) return s.enum.map((v) => `\`${JSON.stringify(v)}\``).join(' \\| ');
  if (s.type === 'array') return `${s.items ? typeOf(s.items) : 'any'}[]`;
  if (s.type === 'object' && !s.properties && s.patternProperties) return `map of ${typeOf(Object.values(s.patternProperties)[0]!)}`;
  if (Array.isArray(s.type)) return s.type.join(' \\| ');
  return s.type ?? 'any';
}

function table(s: J, prefix = '', depth = 0): string[] {
  const rows: string[] = [];
  const req = new Set(s.required ?? []);
  for (const [k, v] of Object.entries(s.properties ?? {})) {
    const range = [v.minimum !== undefined ? `≥ ${v.minimum}` : '', v.maximum !== undefined ? `≤ ${v.maximum}` : ''].filter(Boolean).join(', ');
    rows.push(`| \`${prefix}${k}\` | ${typeOf(v)} | ${req.has(k) ? 'yes' : 'no'} | ${[v.description ?? '', range].filter(Boolean).join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
    if (depth < 1 && v.type === 'object' && v.properties) rows.push(...table(v, `${prefix}${k}.`, depth + 1));
  }
  return rows;
}

export function formatDocs(): Record<string, string> {
  const files: Record<string, string> = {};
  const names = Object.keys(schemas);
  const index = [
    '# Frame file formats',
    '',
    'Generated from `@frame/schema` by `pnpm docs:formats` (FR-DAT-12). Every format has a JSON Schema here and from `frame schema <type>`; agents read them as MCP resources `frame://schemas/{type}`.',
    '',
    '## Rules that apply to every file',
    '',
    '- Every file carries `schemaVersion`. Older files are migrated in memory and written only after confirmation; newer files are refused unchanged (FR-DAT-05).',
    '- JSON is written atomically, pretty-printed with a stable key order, so projects diff cleanly in git (FR-DAT-08).',
    '- Time is integer ticks, 48 000 per second; clip intervals are half-open `[start, end)` (FR-DAT-03).',
    '- Library asset ids are dotted (`hair.box-braids`), user assets `user.<uuid>`; project objects use prefixed random ids (`scn_…`, `ins_…`, `clp_…`, `tak_…`). References are `id@version`; a published version never changes (FR-DAT-01/02).',
    '- Media is content-addressed by SHA-256 and stored once (FR-DAT-07).',
    '',
    '## Project folder',
    '',
    '```',
    'MyShow.frame/',
    '  project.json                     project',
    '  episodes/<ep>/episode.json        episode',
    '  episodes/<ep>/scenes/<scn>.json   scene (instances, cameras, tracks, clips)',
    '  cast/                             characters used by the project',
    '  assets/local/<ref>.json           project-local assets (asset)',
    '  assets/media/sha256-<hash>.<ext>  media',
    '  assets/takes/<tak>.json           take',
    '  locks/assets.json                 locks',
    '  history/commands.jsonl            history (one entry per line)',
    '  history/journal.jsonl             crash journal (removed after each save)',
    '  history/undo.json                 undo and redo kept between sessions',
    '  versions/                         named project versions',
    '  renders/                          exports and render reports',
    '```',
    '',
    '## Packages',
    '',
    'Zip archives with a `manifest.json` (package). Readers accept only declared paths, reject path traversal, verify every hash and never execute content (FR-DAT-10); importing never overwrites a different asset with the same `id@version` (FR-DAT-11).',
    '',
    '| Extension | Contents |',
    '|---|---|',
    '| `.frameproj` | A project folder plus every referenced non-bundled asset version |',
    '| `.framechar` | A character (selected or all versions), its custom parts, looks and optional voice |',
    '| `.framevoice` | A voice with its references, range bank, transcripts and consent record |',
    '| `.frameasset` | One or more assets with manifests and previews |',
    '',
    '## Command-line output (FR-CLI-07)',
    '',
    '`frame <command> --json` prints exactly one cli-envelope. Commands that edit a project return a cli-mutation; other results are described per command by `frame describe`. Within a major version fields are only added, never renamed or removed. Exit codes: 0 success, 1 usage, 2 validation failed, 3 revision conflict, 4 not found, 5 voice worker unavailable, 6 render/export failed, 7 cancelled, 8 permission or consent required, 10 internal error.',
    '',
    '## Schemas',
    '',
    '| Type | What it is |',
    '|---|---|',
    ...names.map((n) => `| [${n}](${n}.md) | ${ABOUT[n] ?? ''} |`),
    '',
  ];
  files['README.md'] = index.join('\n');
  for (const n of names) {
    const s = jsonSchema(n) as J;
    files[`schemas/${n}.schema.json`] = JSON.stringify(s, null, 2) + '\n';
    const rows = table(s);
    files[`${n}.md`] = [
      `# ${n}`,
      '',
      ABOUT[n] ?? '',
      '',
      `JSON Schema: [schemas/${n}.schema.json](schemas/${n}.schema.json) · \`frame schema ${n}\``,
      '',
      ...(rows.length ? ['| Field | Type | Required | Notes |', '|---|---|---|---|', ...rows] : [`Type: ${typeOf(s)}`]),
      '',
    ].join('\n');
  }
  return files;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/formats');
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [f, text] of Object.entries(formatDocs())) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  console.log(`Wrote ${dir}`);
}
