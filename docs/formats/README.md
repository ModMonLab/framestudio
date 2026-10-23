# Frame file formats

Generated from `@frame/schema` by `pnpm docs:formats` (FR-DAT-12). Every format has a JSON Schema here and from `frame schema <type>`; agents read them as MCP resources `frame://schemas/{type}`.

## Rules that apply to every file

- Every file carries `schemaVersion`. Older files are migrated in memory and written only after confirmation; newer files are refused unchanged (FR-DAT-05).
- JSON is written atomically, pretty-printed with a stable key order, so projects diff cleanly in git (FR-DAT-08).
- Time is integer ticks, 48 000 per second; clip intervals are half-open `[start, end)` (FR-DAT-03).
- Library asset ids are dotted (`hair.box-braids`), user assets `user.<uuid>`; project objects use prefixed random ids (`scn_…`, `ins_…`, `clp_…`, `tak_…`). References are `id@version`; a published version never changes (FR-DAT-01/02).
- Media is content-addressed by SHA-256 and stored once (FR-DAT-07).

## Project folder

```
MyShow.frame/
  project.json                     project
  episodes/<ep>/episode.json        episode
  episodes/<ep>/scenes/<scn>.json   scene (instances, cameras, tracks, clips)
  cast/                             characters used by the project
  assets/local/<ref>.json           project-local assets (asset)
  assets/media/sha256-<hash>.<ext>  media
  assets/takes/<tak>.json           take
  locks/assets.json                 locks
  history/commands.jsonl            history (one entry per line)
  history/journal.jsonl             crash journal (removed after each save)
  history/undo.json                 undo and redo kept between sessions
  versions/                         named project versions
  renders/                          exports and render reports
```

## Packages

Zip archives with a `manifest.json` (package). Readers accept only declared paths, reject path traversal, verify every hash and never execute content (FR-DAT-10); importing never overwrites a different asset with the same `id@version` (FR-DAT-11).

| Extension | Contents |
|---|---|
| `.frameproj` | A project folder plus every referenced non-bundled asset version |
| `.framechar` | A character (selected or all versions), its custom parts, looks and optional voice |
| `.framevoice` | A voice with its references, range bank, transcripts and consent record |
| `.frameasset` | One or more assets with manifests and previews |

## Command-line output (FR-CLI-07)

`frame <command> --json` prints exactly one cli-envelope. Commands that edit a project return a cli-mutation; other results are described per command by `frame describe`. Within a major version fields are only added, never renamed or removed. Exit codes: 0 success, 1 usage, 2 validation failed, 3 revision conflict, 4 not found, 5 voice worker unavailable, 6 render/export failed, 7 cancelled, 8 permission or consent required, 10 internal error.

## Schemas

| Type | What it is |
|---|---|
| [project](project.md) | `project.json` at the root of a project folder: name, settings, style family, frame rate, output, captions, cast and episode order. |
| [episode](episode.md) | `episodes/<id>/episode.json`: name, scene order and notes. |
| [scene](scene.md) | `episodes/<id>/scenes/<scn_id>.json`: stage, instances, cameras, tracks and clips (times in ticks, 48 000 per second; half-open intervals). |
| [instance](instance.md) | One object on a scene's stage (character, prop, image, set piece, group, text). |
| [camera](camera.md) | A scene camera: centre, width, rotation, lens, framing preset and subjects. |
| [track](track.md) | A timeline track (shot, camera move, dialogue, lip sync, acting, face, gaze, effect, music, ambience, sfx, text). |
| [clip](clip.md) | A timed item on a track; dialogue clips carry a line. |
| [line](line.md) | A line of dialogue inside a dialogue clip: speaker, text, revision, delivery, chosen take. |
| [take](take.md) | `assets/takes/<tak_id>.json`: one recording or generation of a line, with its media and alignment. |
| [alignment](alignment.md) | Word and phoneme timings of a take (forced, transcribed+forced, or amplitude). |
| [voice](voice.md) | The `data` of a voice asset: method, language, references, consent. |
| [consent](consent.md) | The consent record stored with every cloned voice and exported with it. |
| [media](media.md) | A content-addressed media reference (`assets/media/sha256-<hash>.<ext>`). |
| [asset](asset.md) | Every library or project-local asset manifest (parts, props, kits, actions, voices, templates, …). |
| [locks](locks.md) | `locks/assets.json`: every referenced library asset version with its content hash. |
| [package](package.md) | `manifest.json` inside a .frameproj, .framechar, .framevoice or .frameasset zip. |
| [command](command.md) | One engine command (name + params): the only way state changes. |
| [batch](batch.md) | A list of commands applied atomically (`frame apply`, `POST /commands`, MCP apply_commands). |
| [error](error.md) | A structured error (code, message, details, hint) used by the engine, CLI, server and MCP. |
| [problem](problem.md) | A validation problem with severity and an optional fix. |
| [history](history.md) | One entry of `history/commands.jsonl`: a committed change with its source and commands. |
| [cli-envelope](cli-envelope.md) | What every `frame … --json` command prints: `{ ok: true, result }` or `{ ok: false, error }`. |
| [cli-mutation](cli-mutation.md) | The `result` of every command that edits a project (applied, or planned with --dry-run). |
| [job](job.md) | A job on the Frame Server (exports, voice generation, imports, thumbnails). |
