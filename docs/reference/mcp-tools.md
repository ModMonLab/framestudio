# Frame MCP tool reference

Generated from `packages/mcp/src/tools.ts` by `pnpm docs:mcp`. Start the server with `frame mcp` (stdio).

Resources: `frame://schemas`, `frame://schemas/{type}`, `frame://catalog`, `frame://commands`, `frame://project/{id}/summary`.

## `describe_capabilities` (read-only)

What this Frame server can do: engine commands, units, voice worker state (fixture or real engine), library size and agent permissions. Call first.

No arguments.

## `list_projects` (read-only)

Projects open on the Frame server (id, name, folder, revision).

No arguments.

## `create_project`

Create a new project folder with the library defaults and open it. The folder must not exist or be empty.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes | Folder to create, e.g. /work/MyShow.frame |
| `name` | string | no |  |
| `styleFamily` | union | no |  |
| `frameRate` | union | no |  |

## `open_project` (read-only)

Open a project folder (idempotent) and make it the current project. Returns its id and load problems.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `path` | string | yes |  |

## `get_project` (read-only)

Project summary: settings, episodes and scenes (ids, durations, characters, line and take counts), cast, project-local assets and revision.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `get_scene` (read-only)

Full scene data: instances, tracks, clips (with their source tags), cameras, markers and stage. Times are in ticks (48000/s).

| Argument | Type | Required | Notes |
|---|---|---|---|
| `scene` | string | yes |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `search_assets` (read-only)

Search the library (bundled, user and project assets) by words, synonyms and kind (chr, exp, act, prop, kit, top, hair, mus, sfx, out, txt, …). Returns refs to use in commands.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `query` | string | no |  |
| `kind` | string | no |  |
| `limit` | integer | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `get_asset` (read-only)

The full manifest of an asset ref (parameters, capabilities, data).

| Argument | Type | Required | Notes |
|---|---|---|---|
| `ref` | string | yes |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `apply_commands`

Apply engine commands as one undoable change. dry_run validates and returns the resulting commands without writing. base_revision makes the call fail with REVISION_CONFLICT if someone changed overlapping data since that revision. Characters and lines are edited with apply_commands (see the frame://commands resource for every command and its parameters).

| Argument | Type | Required | Notes |
|---|---|---|---|
| `commands` | array | yes |  |
| `label` | string | no | History label shown to people, e.g. "Block scene 2". |
| `dry_run` | boolean | no |  |
| `base_revision` | integer | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `apply_recipe`

Apply a performance or shot recipe (search_assets kind "rcp" or "cam") to a scene: roles map to instance ids; line-anchored recipes take a line clip id, others a start time. Adds ordinary grouped clips (one undo step); warnings name steps whose assets are missing.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `scene` | string | yes |  |
| `ref` | string | yes | Recipe ref |
| `roles` | object | yes | Role key → instance id |
| `at` | number | no | Start in seconds (time-anchored recipes) |
| `line` | string | no | Line clip id (line-anchored recipes) |
| `dry_run` | boolean | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `auto_coverage`

Generate editable shots from a scene's dialogue: an establishing wide, speaker close-ups, reactions; replaces earlier automatic shots and keeps hand-placed ones.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `scene` | string | yes |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `apply_template`

Add the scene(s) of a production template (search_assets kind "tpl") to an episode with any characters in its cast roles (role key → character ref); the suggested script is in the scene notes.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `ref` | string | yes |  |
| `cast` | object | no |  |
| `episode` | string | no |  |
| `name` | string | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `add_sound`

Put a library sound on a scene's sound tracks: music (kind "music") and ambience ("amb") loop from the start time to the scene end unless a duration is given; sound effects ("sfx") and cues ("cue") play once. Music ducks under dialogue automatically.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `scene` | string | yes |  |
| `ref` | string | yes |  |
| `at` | number | no | Start in seconds (default 0) |
| `duration` | number | no | Seconds |
| `gain_db` | number | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `validate` (read-only)

Problems in the project (missing assets or media, lines without takes, export blockers) with fixes.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `create_character`

Create a project character from a base character (search_assets kind "chr"), changing parts, body, colours, looks, voice and performance; adds it to the cast and optionally places it in a scene. Part keys: head, eyes, brows, nose, mouth, ears, hair, fringe, facialHair, feet. Every ref is checked.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes |  |
| `from` | string | yes | Base character ref, e.g. from search_assets kind "chr" |
| `role` | string | no |  |
| `bodyBase` | string | no |  |
| `body` | object | no |  |
| `parts` | object | no |  |
| `colors` | object | no |  |
| `looks` | array | no |  |
| `voice` | string | no |  |
| `place` | object | no |  |
| `dry_run` | boolean | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `design_voice`

Design a voice from a description on the Voice Worker: renders candidates, then saves the chosen one (default the first) as a project voice and assigns it to characters. Fixture workers return test signals, not speech (results say so).

| Argument | Type | Required | Notes |
|---|---|---|---|
| `description` | string | yes |  |
| `name` | string | yes | Voice name |
| `sample_text` | string | no | Test line (long enough for a reference of at least the worker minimum, usually 3 s). |
| `candidates` | integer | no |  |
| `choose` | integer | no | Index of the candidate to save (default 0). |
| `assign_to` | array | no |  |
| `seed` | integer | no |  |
| `language` | string | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `generate_takes`

Synthesise and align takes for dialogue lines with each speaker's voice; the newest ready take is chosen. Waits up to the tool wait limit, otherwise returns a job id for job_status.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `scene` | string | yes |  |
| `lines` | array | yes |  |
| `takes` | integer | no |  |
| `seed` | integer | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `render_frame` (read-only)

Render one frame of a scene with the export renderer and return it as a PNG image.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `scene` | string | yes |  |
| `t` | number | no | Time in seconds (default 0). |
| `width` | integer | no |  |
| `height` | integer | no |  |
| `captions` | boolean | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `render_video`

Export scenes to video with the export pipeline (renders into the project's render folder). Returns a job; follow it with job_status. The report flags fixture audio.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `scenes` | array | no |  |
| `from` | number | no | Start in seconds (single scene). |
| `to` | number | no | End in seconds (single scene). |
| `preset` | string | no | Output preset ref (search_assets kind "out"). |
| `width` | integer | no |  |
| `height` | integer | no |  |
| `captions` | boolean | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `job_status` (read-only)

State, progress and result of a job (voice design, takes, renders). Waits up to wait_seconds for it to finish.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `job` | string | yes |  |
| `wait_seconds` | number | no |  |

## `undo`

Undo this agent session's latest change. Refused (CONFLICT) when the latest change was made by a person or another agent.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |

## `diff_revisions` (read-only)

What changed between two revisions: each history step after `from` up to `to` (default now) with its label, source (user, cli, agent:<session>) and commands.

| Argument | Type | Required | Notes |
|---|---|---|---|
| `from` | integer | yes |  |
| `to` | integer | no |  |
| `project` | string | no | Project id from open_project/create_project; defaults to the last opened project. |
