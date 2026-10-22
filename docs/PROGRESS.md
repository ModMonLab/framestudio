# Frame — implementation progress
Last updated: 2026-10-22 · Session 2

## Current milestone: M2 — Builder and assets (M1 signed off on the fixture path; real-engine run pending on the reference GPU)

## Status by milestone
| Milestone | Status | Exit evidence |
|---|---|---|
| M0 Foundations | Done | Schemas published (`frame schema <type>`, packages/schema); component stories in both themes (apps/gallery, 40 screenshots + axe); `frame init` + `frame validate` (packages/cli/test/cli.test.ts); CI workflow with golden-frame harness (packages/render/test) |
| M1 Vertical slice | In progress | Fixture-worker path passes: tools/test/slice.test.ts (two designed voices, 4 aligned takes, export, server = CLI frames byte-identical) and apps/studio/e2e/studio.spec.ts (same flow in the Studio, preview pixels = server/CLI renderer). Real Qwen3-TTS run pending on the reference GPU. |
| M2 Builder and assets | In progress | Packages (packages/io/test/package.test.ts, cli + server package tests), character versions and update usages (packages/server/test/versions.test.ts, AC-11 path), editable builder with compare (Studio e2e “character builder…”), imports and rigging assistant for characters, props and sets (packages/io/test/import.test.ts, rigging.test.ts, Studio e2e, AC-12 path), part editor (Studio e2e “part editor…”), user library, favourites and collections, full-page library (Studio e2e), AC-02 and AC-20 automated paths (tools/test/m2-acceptance.test.ts). Pending for exit: owner runs of AC-02/AC-11/AC-12 (artist PSD) and AC-20 on a second OS; hand-pose supply; FR-PED-03 |
| M3 Direction | Not started | — |
| M4 Agents | In progress | `frame mcp` with all FR-AGT-02 tools and FR-AGT-03 resources (packages/mcp/test); agent tagging, session revert and Studio activity log (apps/studio/e2e). AC-13 needs recipes and music (M3) |
| M5 Catalog completion | Not started | — |
| M6 Hardening | Not started | — |

## Requirement status
Status values: Not started / In progress / Done / Not verified / Blocked. "Done" requires passing evidence (test file or report).
The Notes column starts with the requirement's short title from the SRS.

| ID | Status | Evidence | Notes |
|---|---|---|---|
| FR-ARC-01 | Done | packages/server/test/server.test.ts; CLI local mode tests | The project files on disk are the source of truth — Studio, CLI and server edit only through @frame/core commands |
| FR-ARC-02 | Done | packages/core/test/session.test.ts | Every edit is a command with a name, parameters, inverse, and the proj — Commands serialisable, inverse patches, revision |
| FR-ARC-03 | Done | server.test.ts “publishes deltas over WebSocket that rebuild the same state” | The server publishes project changes over WebSocket — Entity deltas (core/sync.ts); Studio mirror applies them |
| FR-ARC-04 | Done | session.test.ts; server.test.ts REVISION_CONFLICT 409; cli exit 3 | Optimistic concurrency: a command carries the base revision |
| FR-ARC-05 | In progress | packages/server/src/jobs.ts; server.test.ts export job | Long work (render, import, generation, alignment, thumbnailing) runs a — Render and voice jobs with progress/cancel; import/thumbnail jobs later |
| FR-ARC-06 | Done | tools/test/architecture.test.ts | The engine knows no bundled names: no runtime branch may depend on a s |
| FR-DAT-01 | Done | packages/schema/src/common.ts; core ids.ts | IDs: assets use catalog-style dotted IDs (`hair |
| FR-DAT-02 | In progress | AssetRef schema | Asset versions are integers — Library immutability enforced with asset library (M2) |
| FR-DAT-03 | Done | packages/core/src/time.ts; session tests | Project time is stored as **integer ticks** at 48 000 ticks per second |
| FR-DAT-04 | Done | session.test.ts “changing frame rate re-snaps”; CLI settings test | Project frame rate is chosen at creation (24, 25, 30 |
| FR-DAT-05 | Done | packages/io/test/store.test.ts “refuses a newer schema”; packages/schema/src/migrate.ts | Every file carries `schemaVersion` |
| FR-DAT-06 | Done | packages/io/src/locks.ts; package.test.ts “locks”; LOCK_MISMATCH in validate.ts | A project folder is self-describing: `locks/` lists every referenced l — Computed at every save (bundled + user sources, transitive); pins kept while used; drift reported |
| FR-DAT-07 | Done | store.test.ts “stores media content-addressed” | Media is content-addressed (SHA-256) |
| FR-DAT-08 | Done | store.test.ts “stable key order”; fsutil.ts atomic writes | JSON files are written atomically (temp file + rename), pretty-printed |
| FR-DAT-09 | Done | core structure commands; store tests | A project may contain multiple **episodes** |
| FR-DAT-10 | Done | packages/io/test/package.test.ts (malicious archives); cli/test/packages.test.ts; server/test/packages.test.ts; decision 0017 | Packages are zip archives with a `manifest — Declared paths only, safe names, type allow-list, size limits, hashes verified, nothing executed |
| FR-DAT-11 | Done | package.test.ts “refuses different content … new ID” | Importing a package never overwrites existing assets of the same `id@v — Identical skipped; conflicts refused or imported under new user IDs with references rewritten |
| FR-DAT-12 | In progress | `frame schema <type>`; packages/schema | Every format has a published JSON Schema in `@frame/schema` and docume — docs/formats/ pending |
| FR-PRJ-01 | In progress | `frame init` | Create — Templates/package sources in M2/M3 |
| FR-PRJ-02 | Done | session.test.ts (duplicate/delete); cli episode group | Episodes |
| FR-PRJ-03 | Done | session.test.ts (duration safety); cli scene group | Scenes — Tree drag reorder in Studio M1 |
| FR-PRJ-04 | Not started | — | Notes and script |
| FR-PRJ-05 | Not started | — | Project settings |
| FR-PRJ-06 | Not started | — | Browser |
| FR-PRJ-07 | In progress | store.test.ts “invalid folders” | Open folder — Studio open-folder UI |
| FR-PER-01 | In progress | io/project.ts autosave; Studio save badge (Saved/Saving…/Unsaved/Not saved) | Autosave — Retry action in badge pending |
| FR-PER-02 | In progress | session.test.ts (undo ≥200, labels) | Undo/redo — Studio single-step drags in M1 |
| FR-PER-03 | Done | store.test.ts; server/test/versions.test.ts; Studio e2e “project versions…”; `frame versions compare|restore` | Versions (snapshots) — Save, list, compare summary (scenes, clips, character versions, assets), undoable restore and “open as a copy” (new folder, new project id) |
| FR-PER-04 | Done | store.test.ts recovery; crash.test.ts | Crash recovery |
| FR-PER-05 | In progress | server.test.ts “detects edits made on disk and reloads”; hub.checkExternal | External changes — Merge UI when local changes are pending: event sent, dialog pending |
| FR-PER-06 | In progress | core validate.ts; Studio Problems badge + list with “Go to” (selects and seeks) | Validation — One-click fixes pending |
| FR-PER-07 | Not started | — | Clipboard |
| FR-AST-01 | Done | packages/io/src/user-library.ts; server/test/user-library.test.ts; Studio e2e “favourites, collections and the user library…” | Library sources — Bundled, user (profile folder, FRAME_USER_DIR), project-local and imported sources; “save to my library” and adopt-on-use keep projects self-contained |
| FR-AST-02 | Done | library.ts (invalid manifests reported and excluded); `frame assets validate`; GET /api/library/problems shown in the full-page library | Manifests |
| FR-AST-03 | Done | Assets panel and full-page library: search, categories with counts, filters by family/view/source, thumbnails; Studio e2e “full-page library…” | Browser |
| FR-AST-04 | Done | core/compat.ts; library `compat` reasons (family, rig, view, posture, draft); Studio e2e “favourites…” (incompatible items stay visible with a reason) | Compatibility |
| FR-AST-05 | Done | asset.updateUsages; /api/library/details and /usages; `frame assets usages|update-usages`; versions.test.ts; Studio e2e “full-page library…” | Versions — Details screen with versions, changes, usages and explicit update |
| FR-AST-06 | Done | UserLibrary prefs; /api/user/prefs; Studio e2e “favourites, collections…” | Favourites and collections |
| FR-AST-07 | In progress | core/preview.ts; persistent content-keyed thumbnail cache (server/test/user-library.test.ts “thumbnail cache”, server.test.ts) | Thumbnails — Mouth shapes, eye/brow states and controls have no preview yet |
| FR-AST-08 | In progress | packages/rig/src/check.ts; packages/rig/test/check.test.ts; coverage validator column | Rig check and asset validator — Static contract check done; composition against reference characters and the action compatibility matrix pending |
| FR-IMP-01 | Done | packages/io/test/import.test.ts; Studio e2e “imports an SVG…”; decision 0018 | Imports validate type, size and content before acceptance and report p — PNG/JPEG/WebP sniffed and measured, SVG parsed safely, audio decoded and limited; precise errors |
| FR-IMP-02 | Done | import.test.ts (provenance, licence); rigging build requires a rights statement | Imported assets record provenance (file name, date, user statement of — File name, date, author, rights statement and licence recorded on every import |
| FR-IMP-03 | In progress | packages/io/test/rigging.test.ts; server/test/rigging.test.ts; Studio e2e “rigging assistant…” (character, prop); decision 0019 | Rigging assistant — Layered PSD/SVG → character (mapping, per-view frames, declared view gaps, library mouth, test gestures, rig check), prop with states, or location kit on depth planes. Pivot adjustment UI and hand-pose supply pending |
| FR-IMP-04 | Done | package.test.ts; `frame char|voice|assets export`; Studio builder Export… and File menu | Export assets — Characters (selected or all versions), voices (consent carried), any assets with dependencies; project packages |
| FR-CHR-01 | Not started | — | Families |
| FR-CHR-02 | Not started | — | Parametric parts |
| FR-CHR-03 | Not started | — | Views |
| FR-CHR-04 | Not started | — | View changes |
| FR-CHR-05 | Not started | — | Rig |
| FR-CHR-06 | Not started | — | Anchors |
| FR-CHR-07 | Not started | — | Layering |
| FR-CHR-08 | Not started | — | Expressions and mouth |
| FR-CHR-09 | In progress | looks in character data; instances reference id@version + look; builder looks section | Identity vs appearance — Look switching clips (FR-WRD-03) pending |
| FR-CHR-10 | Done | server/test/versions.test.ts; core/test/versions.test.ts; Studio e2e builder save | Versioning — New immutable version (or new character from a library one); update one instance, a scene or the project, undoable |
| FR-CHR-11 | Not started | — | Inclusive options |
| FR-BLD-01 | Done | apps/studio/src/components/Builder.tsx; Studio e2e “character builder…” (axe) | Layout — Parts tree with search over current values and changed dots, live canvas, turnaround, test bar, properties panel |
| FR-BLD-02 | In progress | BuilderProperties.tsx | Sections — All sections present with library-driven options; accessories, makeup, facial hair and patterns wait for content; voice auditions pending |
| FR-BLD-03 | Done | Builder preview uses the export renderer in both families and every view; turnaround sheet; “Compare” saved vs. draft | Live preview |
| FR-BLD-04 | Done | Builder test bar: any expression, any action, lip-sync test with mouth readout | Testing |
| FR-BLD-05 | In progress | Randomise (parts, build, colours); “Describe a character” states its prerequisite | Randomise and suggest — Constraint choices (life stage, palette) in the UI pending |
| FR-BLD-06 | Done | Studio e2e builder save; leave-with-changes confirmation; Export… .framechar | Save |
| FR-BLD-07 | In progress | Looks: new, duplicate, rename, default, delete; garments and colours per look | Looks — Patterns (B6) and per-garment options pending |
| FR-BLD-08 | Done | POST /characters/check (core/character-check.ts); builder footer and drill-down dialog | Rig check — Views, styles, mouth shapes, action compatibility, per-part contract problems |
| FR-PED-01 | Done | apps/studio/src/components/PartEditor.tsx; rig/test/edit.test.ts; Studio e2e “part editor…” | Part editor — Points (drag, add, delete), parameter bindings, fills, strokes, slots, mirror view, live rig check |
| FR-PED-02 | Done | core/part-save.ts; server/test/parts.test.ts; Studio e2e “part editor…” | New part from existing — New part from existing and new versions of project parts |
| FR-PED-03 | Not started | — | AI drafting — Needs an AI drafting backend; provenance value `ai-assisted-human-reviewed` is already supported |
| FR-PED-04 | Done | rig/src/edit.ts convertFamily; rig/test/edit.test.ts; part editor “Draft <family> from <other>” | Family conversion assist — Drafts are saved only after review (tagged draft until the rig check passes) |
| FR-PED-05 | Done | partManifest rig-check gate; server/test/parts.test.ts | Validation — Failing parts save only as drafts with review “changes requested” |
| FR-WRD-01 | Not started | — | Garments and accessories from Catalog B and C attach to the rig with l |
| FR-WRD-02 | Not started | — | Colours (palette + custom), patterns (Catalog B6) with scale/rotation/ |
| FR-WRD-03 | Not started | — | A scene instance chooses a look |
| FR-WRD-04 | Not started | — | Accessories may also be props (e |
| FR-EXP-01 | Not started | — | Apply any Catalog E1 expression as a timed clip with intensity, blend |
| FR-EXP-02 | Not started | — | Fine-tune per clip: eye state, brow states (L/R), mouth curvature, che |
| FR-EXP-03 | Not started | — | Blinks are automatic (natural interval, suppressed during closed-eye e |
| FR-EXP-04 | Not started | — | Expressions blend: consecutive clips cross-fade over their blend times |
| FR-EXP-05 | Not started | — | Base expression per instance (resting face) applies when no clip is ac |
| FR-ACT-01 | Not started | — | Apply any Catalog F1 action as a clip to a compatible character |
| FR-ACT-02 | Not started | — | Channels |
| FR-ACT-03 | Not started | — | Postures |
| FR-ACT-04 | Not started | — | Locomotion |
| FR-ACT-05 | Not started | — | Gaze |
| FR-ACT-06 | Not started | — | Object interactions |
| FR-ACT-07 | Not started | — | Idle and listening behaviour |
| FR-ACT-08 | Not started | — | Talking gestures |
| FR-ACT-09 | Not started | — | Motion principles |
| FR-ACT-10 | Not started | — | Pose editing |
| FR-RCP-01 | Not started | — | Apply any Catalog G1 recipe to one or more characters |
| FR-RCP-02 | Not started | — | Applying a recipe expands into ordinary clips on the right tracks (act |
| FR-RCP-03 | Not started | — | Recipes anchored to a line align to that line's words (e |
| FR-RCP-04 | Not started | — | Users can save a selection of clips as a new recipe (with role placeho |
| FR-PRP-01 | Not started | — | Props from Catalog H1 support transform, depth, layering, states (swit |
| FR-PRP-02 | Not started | — | Interactive props expose their actions in the Acting tab of characters |
| FR-ENV-01 | Not started | — | Location kits (Catalog I1) provide layered parts with palettes |
| FR-ENV-02 | Not started | — | Kit palettes recolour all kit parts consistently |
| FR-STG-01 | Not started | — | Stage |
| FR-STG-02 | Not started | — | Depth vs parallax |
| FR-STG-03 | Not started | — | Placement |
| FR-STG-04 | Not started | — | Seating |
| FR-STG-05 | Not started | — | Selection sync |
| FR-CAM-01 | Not started | — | Cameras |
| FR-CAM-02 | Not started | — | Shots |
| FR-CAM-03 | Not started | — | Moves |
| FR-CAM-04 | Not started | — | Shot recipes |
| FR-CAM-05 | Not started | — | Auto-coverage |
| FR-CAM-06 | Not started | — | Aspect ratios |
| FR-CAM-07 | In progress | validate.ts + session.test.ts conflict rules | Conflict rules — Timeline hatching in M1 |
| FR-FX-01 | Not started | — | Apply Catalog K1 effects as clips attached to screen, stage point, obj |
| FR-FX-02 | Not started | — | Atmosphere (Catalog J1) as scene layers with intensity, colour and tim |
| FR-FX-03 | Not started | — | Transitions (Catalog K2) between shots and between scenes with duratio |
| FR-FX-04 | Not started | — | Effects and atmosphere render identically in preview and export (NFR-0 |
| FR-TML-01 | Not started | — | Structure |
| FR-TML-02 | Not started | — | Editing |
| FR-TML-03 | Not started | — | Media trimming |
| FR-TML-04 | Not started | — | Markers and regions |
| FR-TML-05 | Not started | — | Playback |
| FR-TML-06 | Not started | — | Sync |
| FR-TML-07 | Not started | — | Track controls |
| FR-TML-08 | Not started | — | Zoom and navigation |
| FR-TML-09 | Not started | — | Episode view |
| FR-SND-01 | In progress | core/audio.ts scheduleSceneAudio; audio-captions.test.ts | Add music, ambience and SFX from Catalog N or imports — Music/ambience/SFX from imports scheduled and looped; Catalog N sounds not yet authored |
| FR-SND-02 | In progress | audio-captions.test.ts fades/pan; io/audio.ts limit(); export.test.ts peak ≤ −1 dBFS | Gain (dB), pan, fade in/out with curve, mute/solo per clip and track — Gain/pan/fades/mute/solo/limiter done; clip gain UI pending |
| FR-SND-03 | In progress | audio-captions.test.ts ducking + duckCurve | Ducking — Automatic ducking with attack/release; curve display on timeline pending |
| FR-SND-04 | Not started | — | Sound cues |
| FR-SND-05 | In progress | export.test.ts BS.1770 reference (±0.1 LU) and −14 LUFS normalisation | Meters — Loudness + normalisation in export report; live meters pending |
| FR-SND-06 | Not started | — | Room tone and silence |
| FR-TXT-01 | In progress | core/captions.ts; scene-render.test.ts caption goldens; audio-captions.test.ts | Captions are generated from dialogue text and word timings (aligned ta — Captions from text + word timings, styles from txt.* assets, stacked speakers, safe areas; per-line style override pending |
| FR-TXT-02 | Done | audio-captions.test.ts karaoke/pop; golden captions-bold-karaoke-captions | Word-highlight ("karaoke") and animated-word caption styles use word t — Karaoke and animated-word styles follow word timings |
| FR-TXT-03 | Not started | — | Speech and thought bubbles attach to a character's mouth/head anchor w |
| FR-TXT-04 | Not started | — | Titles, lower thirds, cards, credits and graphics (Catalog O1) with co |
| FR-TXT-05 | Not started | — | World text (signs, screens) renders in scene space and moves with the |
| FR-TXT-06 | Done | audio-captions.test.ts SRT/VTT; export.test.ts files | Export subtitles as SRT and WebVTT (FR-RND-06) — SRT and WebVTT share pages with burn-in |
| FR-TPL-01 | Not started | — | Catalog P1 templates create complete projects or scenes |
| FR-TPL-02 | Not started | — | Users can save any project or scene as a template (with optional place |
| FR-TPL-03 | Not started | — | "Replace cast" swaps a template's characters with the user's character |
| FR-DLG-01 | In progress | Studio Audio tab “Add line at playhead”; CLI apply line.add | Lines are created from the timeline, the Script view, a character's Di — Script view pending |
| FR-DLG-02 | Not started | — | A line has one canonical record (speaker, text, revision, delivery, ch |
| FR-DLG-03 | In progress | session.test.ts take outdated/confirm | Editing a line's text increments its revision and marks takes generate |
| FR-DLG-04 | In progress | validate.ts lineTakeState | Take states: Missing, Queued, Generating, Ready, Failed, Outdated, Mut |
| FR-DLG-05 | In progress | line.chooseTake, take.remove | Multiple takes per line are kept |
| FR-DLG-06 | In progress | line.chooseTake clip length | A line's clip length follows the chosen take's measured duration |
| FR-DLG-07 | Not started | — | Overlapping speech between different speakers is allowed and mixed |
| FR-DLG-08 | Not started | — | Pauses and beats: lines may contain explicit pause markers (`[pause 0 |
| FR-VOI-01 | In progress | project-local voice assets (asset.addLocal); Layers Voice row | Voice library — Voice library screen pending |
| FR-VOI-02 | In progress | slice.test.ts; apps/studio/e2e/studio.spec.ts (fixture worker) | Design a voice — Design → candidates → audition → save works end to end; real Qwen3 output not verified here (no GPU) |
| FR-VOI-03 | Done (fixture path) | Worker /v1/voices/range; `POST /voices/range` job; Studio "Emotional range…" dialog (audition, similarity, accept); `tools/test/slice.test.ts` (happy delivery uses the happy reference) and Studio e2e M1 slice | Emotional range bank — real-engine quality Not verified — requires reference machine (AC-03) |
| FR-VOI-04 | Not started | — | Clone a voice |
| FR-VOI-05 | Not started | — | Record in browser |
| FR-VOI-06 | In progress | server.test.ts upload (decode, measure, amplitude envelope, coded failure); slice.test.ts upload aligned by the worker; Studio “Upload take…” | Upload — Optional loudness normalisation on upload pending |
| FR-VOI-07 | In progress | slice.test.ts; studio e2e “Generate takes” | Generate takes — Generation, takes list, choose; seed policy UI pending |
| FR-VOI-08 | In progress | voice-client workflow sends only reported controls; Studio delivery shows only worker emotions and states unsupported pace/instruction | Honest capabilities — Delivery presets (Q2) pending |
| FR-VOI-09 | Done | session.test.ts outdated takes; workflow.ts never auto-selects stale; Studio “Previous text” badge | Stale results |
| FR-VOI-10 | Done | Accepting range references (`POST /voices/version`) or redesigning (`POST /voices` with `versionOf`) saves version n+1 (next free number); characters switch only when asked; existing takes keep their voice version. Evidence: `tools/test/slice.test.ts`, Studio e2e M1 slice | Versions |
| FR-VOI-11 | Not started | — | Starter voices |
| FR-VOI-12 | Done | server.test.ts worker status; Studio WorkerBadge (connected/busy/offline/not set up with hint) | Worker status |
| FR-VWK-01 | In progress | services/voice-worker (FastAPI), README, Dockerfile, setup-wsl.sh | The Voice Worker is a separate service the owner runs (WSL2/Docker on — Install not verified on the reference machine |
| FR-VWK-02 | Not verified | engines/qwen3.py against qwen-tts 0.1.1 API (decision 0006) | Engines — Requires reference GPU (owner checklist §1) |
| FR-VWK-03 | In progress | tests/test_models.py (one resident model, OOM recovery logic) | GPU budget — Real VRAM behaviour needs reference GPU |
| FR-VWK-04 | Not verified | benchmark command | Model sizes — Requires reference GPU |
| FR-VWK-05 | Done | blobs.py LRU; idempotency test | Caching |
| FR-VWK-06 | Done | test_api.py token + network-bind refusal | Exposure |
| FR-VWK-07 | In progress | `frame-voice-worker doctor` | Installation — Needs a run on the reference machine |
| FR-VWK-08 | Done | `fetch-models` refuses without --accept-licences; LICENSES.md | Licences |
| FR-LIP-01 | In progress | lipsync.ts mapping; slice.test.ts (alignment → >3 mouth shapes) | Pipeline — WhisperX path not verified without GPU |
| FR-LIP-02 | Done | alignment.envelope + evaluate amplitude fallback; server.test.ts upload without worker | Fallback |
| FR-LIP-03 | Not started | — | Composition |
| FR-LIP-04 | Not started | — | Editing |
| FR-LIP-05 | Not started | — | Views |
| FR-LIP-06 | Not started | — | Accuracy |
| FR-RND-01 | Done | export.test.ts video frame vs CLI still; slice.test.ts server vs CLI byte-identical; studio e2e preview vs server pixel-identical | One renderer |
| FR-RND-02 | Done | scene-render.test.ts determinism; seeded idle/blinks | Determinism |
| FR-RND-03 | In progress | Studio CanvasView (half resolution while playing, “Preview quality” shown) | Preview — Interactive-rate numbers need AC-14 |
| FR-RND-04 | In progress | out.* presets; renderExport options; Studio Export dialog | Export settings — Custom size/bitrate UI pending |
| FR-RND-05 | Done | server render jobs snapshot state at submit; CLI snapshot | Snapshot |
| FR-RND-06 | Done | export.test.ts (MP4, SRT/VTT, stems, report json+txt) | Outputs |
| FR-RND-07 | In progress | server jobs + Studio Jobs popover with in-app player | Lifecycle — Retry button pending |
| FR-RND-08 | Done | export.test.ts blocked on missing media; Studio export dialog lists blocking problems | Validation before export |
| FR-RND-09 | Not started | — | Quality |
| FR-RND-10 | Not started | — | Batch |
| FR-CLI-01 | In progress | cli tests (local); packages/server/test/cli-server-mode.test.ts (server mode) | A `frame` command provides every Studio capability that does not requi — Local and server mode share the engine; versions/script are local-only with a hint; MCP and remaining groups pending |
| FR-CLI-02 | Done | framework.ts; cli-server-mode.test.ts (--server/--token, FRAME_AGENT_SESSION attribution) | Global options: `--project <path>`, `--json` (structured output on std |
| FR-CLI-03 | Done | cli.test.ts describe/schema/help | Discoverability: `frame help`, `frame <cmd> --help`, `frame schema <ty |
| FR-CLI-04 | Done | cli.test.ts exit codes | Exit codes: 0 success |
| FR-CLI-05 | In progress | project/episode/scene/apply/versions/history/render/server groups | Command groups |
| FR-CLI-06 | Done | cli.test.ts dry-run | Every mutating command accepts `--dry-run` and returns the list of res |
| FR-CLI-07 | In progress | JSON envelope {ok,result|error} | Output of `--json` commands conforms to published schemas and is stabl — Output schemas to publish |
| FR-AGT-01 | Done | `frame mcp` (`@frame/mcp`, SDK 1.31.0, decision 0016): stdio; embedded loopback server or `--server`. Evidence: `packages/mcp/test/stdio.test.ts` (real CLI process) | `frame mcp` starts a Model Context Protocol server exposing typed tools over the same engine and permissions as the CLI |
| FR-AGT-02 | Done | All 17 tools + `create_project`; JSON Schema inputs; reference `docs/reference/mcp-tools.md` (generated, checked). Evidence: `packages/mcp/test/mcp.test.ts` (in CI with the fixture worker for design_voice/generate_takes/render_video) | Minimum tools |
| FR-AGT-03 | Done | `frame://schemas[/{type}]`, `frame://catalog` (refs, kinds, groups, capabilities), `frame://commands`, `frame://project/{id}/summary`; mcp.test.ts reads each | Resources |
| FR-AGT-04 | Done | Engine guard on permissions; server tags every agent change `agent:<session>` (commands, characters, voices, takes); agent undo limited to its own step, no redo, no revert-source, renders only inside the project; person-only `POST /revert-source` reverts a session as one step. Evidence: mcp.test.ts | Safety and tagging |
| FR-AGT-05 | Done | Studio Activity popover: agent sessions with their commands and "Revert session" (one undoable step), recent changes with source; agent-made clips marked in the timeline. Evidence: Studio e2e "agent changes are tagged…" (incl. axe on the popover) | Activity log |
| FR-ONB-01 | Not started | — | First run: choose theme, check the voice worker connection (or skip), |
| FR-ONB-02 | Not started | — | Contextual help: every panel has a help link |
| FR-ONB-03 | Not started | — | Command palette (Ctrl/⌘ K) searches commands, assets, layers, scenes, |
| FR-SET-01 | Not started | — | Settings: theme (Dark, Light, System), UI density (Comfortable, Compac |
| API-01 | Done | voice-client test (Idempotency-Key); worker test_idempotency | Requests carry an idempotency key |
| API-02 | Done | workflow.ts stores audio as project media before alignment; slice.test.ts | Frame stores all generated audio as project media immediately after do |
| API-03 | In progress | Studio delivery controls from capabilities | The capability report is authoritative for UI controls (FR-VOI-08) — Range/voice-design screens to follow the same rule |
| API-04 | Done | fixture engine; every response fixture:true; Studio/CLI/report label “not real speech” | A **fixture worker** implementing the same API with deterministic cann |
| CAT-01 | In progress | docs/catalog/coverage.md | Completeness — 446 / 1254 items have manifests |
| CAT-02 | In progress | coverage.md families/views columns | Families and views — Authored items carry both families and four views or exemptions; per-list status in the report |
| CAT-03 | In progress | rig check in coverage report (all authored character parts pass the static check) | Rig contract — Action compatibility matrix not generated |
| CAT-04 | In progress | coverage report renders every previewable item in both families (pnpm catalog:coverage) | Manifests and previews — 426 of 446 manifests have rendered previews; hand poses need a close-up hand preview; body bases differ too subtly (art) |
| CAT-05 | In progress | coverage.md licence column | Licensing and provenance — Every bundled manifest records licence LicenseRef-Frame-Bundled and provenance |
| CAT-06 | Not verified | — | Quality bar — Human visual review (owner); all items review: pending |
| CAT-07 | In progress | catalog/*.yaml; packages/assets/test/catalog.test.ts | Content pipeline — Content pipeline pending |
| CAT-08 | Not started | — | Sound assets |
| CAT-09 | Not started | — | Starter voices |
| CAT-10 | Done | packages/assets/src/coverage.ts; packages/assets/test/coverage.test.ts; `pnpm catalog:coverage` → docs/catalog/coverage.md | Coverage report — Report exists; currently 0 % green (release needs 100 %) |
| UI-01 | In progress | apps/studio (shell, rail, resizable panels, canvas, timeline, properties); studio e2e | The Studio implements the shell, modes, rail, panels, canvas, timeline — Panel collapse shortcuts exist (\\ and View menu); 125 % zoom check pending |
| UI-02 | In progress | apps/studio Workspace + Builder | The Studio workspace and Character builder match the reference screens — Visual comparison with mockups pending owner sign-off |
| UI-03 | In progress | Versions dialog, import dialog, rigging assistant, full-page library, part editor (Studio e2e with axe) | Every screen listed in 02 §7 — Template gallery, voice library, settings, palette and help pending |
| UI-04 | In progress | packages/ui tree/sections/lists/search | Organisation patterns: trees, collapsible sections, lists and search b |
| UI-05 | In progress | shared selection, undo labels, autosave badge, keyboard shortcuts, drag on canvas/timeline, context menus (canvas, layers, clips), library drag-and-drop to canvas and Face/Acting lanes | Selection, undo, autosave, keyboard, drag-and-drop and context-menu ru — Tree drag-and-drop reparenting pending |
| UI-06 | In progress | disabledReason on buttons/menus/selects | Every visible control works or states its prerequisite |
| UI-07 | In progress | apps/gallery/e2e (40 screenshots) | Visual regression tests cover every component state and both reference — Reference screens pending |
| NFR-01 | Not started | — | Responsiveness |
| NFR-02 | Not started | — | Preview performance |
| NFR-03 | In progress | golden frames; preview/CLI/export identity tests | Determinism — AC-15 20-frame run pending |
| NFR-04 | Not started | — | A/V sync |
| NFR-05 | Not started | — | Export speed |
| NFR-06 | Not verified | benchmark command | Voice speed — Requires reference GPU |
| NFR-07 | Not started | — | Capacity |
| NFR-08 | Done | packages/io/test/crash.test.ts (≥1000 edits, SIGKILL) | Reliability |
| NFR-09 | In progress | Package reader and SVG parser refuse unsafe content; tokens never stored in projects | Security — Security suite and dependency audit pending |
| NFR-10 | Not started | — | Privacy |
| NFR-11 | In progress | Vitest suites, golden harness, Playwright | Testability |
| NFR-12 | In progress | gallery axe checks (WCAG 2.2 AA), decision 0007 | Accessibility |
| NFR-13 | In progress | architecture.test.ts | Maintainability |
| NFR-14 | Not started | — | Compatibility |
| NFR-15 | In progress | CI run 12: typecheck, lint and tests green on ubuntu, macOS and Windows | Portability — Voice Worker on the reference GPU (WSL2/Docker) not verified |
| NFR-16 | In progress | packages/ui/src/i18n.ts | Internationalisation-ready |
| NFR-17 | Not started | — | Licensing |
| NFR-18 | In progress | fixture labels in worker, voice assets, takes, reports, Studio | Transparency — AI-generated provenance on real takes pending |
| AC-01 | Not started | — | Template to video |
| AC-02 | In progress | tools/test/m2-acceptance.test.ts AC-02 (every builder section, 4 views × 2 families identical after .framechar into a fresh profile) | Build a character in both families — Owner run in the Studio and visual sign-off pending |
| AC-03 | Not verified | — | Design a voice and range bank — Requires reference GPU and listening panel (owner checklist) |
| AC-04 | Not started | — | Record and upload |
| AC-05 | Not started | — | Clone with consent |
| AC-06 | Not started | — | Scene from scratch |
| AC-07 | Not started | — | Interactive props |
| AC-08 | Not started | — | Locomotion and gaze |
| AC-09 | Not started | — | Lip-sync accuracy |
| AC-10 | Not started | — | Conflicts and validation |
| AC-11 | In progress | packages/server/test/versions.test.ts (two episodes, new version in one scene, reopen, snapshot restore) | Versions and reuse — Studio run of the full scenario pending |
| AC-12 | In progress | rigging.test.ts (character, prop, set); Studio e2e “rigging assistant…”, “imports an SVG…”; import.test.ts | Import and rigging assistant — Hand-pose supply and a real artist PSD pending |
| AC-13 | In progress | MCP path evidenced in `packages/mcp/test/mcp.test.ts` (create project, character, lines, dry run, conflict after human edit resolved by re-reading, voice → takes → frame and video) and Studio e2e (agent-tagged clips, session revert). Missing: recipes and music via MCP (recipes are M3), a 3-scene/2-character run by a real agent | Agent production |
| AC-14 | Not started | — | Performance |
| AC-15 | Not started | — | Determinism and sync |
| AC-16 | In progress | crash.test.ts; store.test.ts disk-full retry | Reliability — External git merge pending |
| AC-17 | Not verified | test_models.py OOM logic | Worker resilience — Requires reference GPU |
| AC-18 | Not started | — | Design System compliance |
| AC-19 | Not started | — | Catalog coverage |
| AC-20 | In progress | package.test.ts; tools/test/m2-acceptance.test.ts AC-20 (new folder, no user library, identical frames) | Packages and portability — Second-machine (macOS/Linux) run pending |
| AC-21 | In progress | package.test.ts malicious archives (traversal, scripts, undeclared, oversized, hash mismatch); SVG safety tests | Security and privacy — Network audit and token-in-logs checks pending |
| AC-22 | Not started | — | Templates |
| AC-23 | Not started | — | Captions and text |
| AC-24 | Not verified | — | Fresh setup — Requires clean Windows 11 laptop (owner checklist §3) |

## Catalog coverage
Report: [docs/catalog/coverage.md](catalog/coverage.md) (`pnpm catalog:coverage`). **Green: 0 / 1254 (0 %)**;
manifests present for 446 / 1254 (35.6 %). Nothing is green yet because no item has passed human visual review (CAT-06). All authored character parts pass
the static rig check (FR-AST-08); 426 of 446 manifests render previews in both families (hand poses pending). Lists with authored content:
A1–A19 face/body parts and controls, B1–B5 wardrobe (part), E1 expressions (83), F1 actions (19 of 118), D1 cast (14),
H1 props (8 of 142), I1 kits (1 of 16), O1 caption styles (6 of 36), R1 output presets (12).

## Next actions (ordered)
1. Keep CI green (typecheck, lint, unit, visual, worker, slice + Studio e2e).
2. M2 remainder: rigging assistant pivot adjustment and hand-pose supply (FR-IMP-03); thumbnails for mouth shapes,
   eye/brow states and controls (FR-AST-07); builder constraint choices and patterns (FR-BLD-05/07).
3. M2 exit runs with the owner: AC-02 in the Studio, AC-11, AC-12 with an artist PSD, AC-20 on a second OS
   (docs/acceptance/owner-checklist.md).
4. M3 Direction: recipes, music, camera direction (start from docs/spec milestone list; AC-13 needs recipes and music).
5. M1 owner run with Qwen3-TTS on the reference GPU (docs/acceptance/owner-checklist.md §1).
6. Content track (M5): accessories (C1), skin details/makeup (A13/A14), facial hair (A11), starter voices (Q1) — the
   bundled cast references some of these and the builder's rig check reports the gaps.

## Open decisions and blockers
- Decision 0006: FR-VOI-03 interpretation (range bank via VoiceDesign + similarity check) — validated only by AC-03 on the reference machine.
- Decision 0013 (owner, 2026-10-22): ffmpeg is downloaded on first use (pinned, hash-checked, GPL notice in the profile); to implement in M6.
- No GPU in the cloud implementation container: live Voice Worker checks (NFR-06, AC-03, AC-17, AC-24) are
  **Not verified — requires reference machine**; steps in docs/acceptance/owner-checklist.md.
- Decision 0019: additive part-contract change accepted by the owner (2026-10-22); using imported artwork for both
  style families still awaits the owner's answer.
- Content gaps visible in the builder rig check: four bundled cast members reference accessories, skin details or a
  prop that are not authored yet; the cast's starter voices (Q1) are not authored, so exports of derived characters
  list them as unresolved references.

## Session report — 2026-10-22, session 2

**Completed (with evidence)**
- Packages `.frameproj`, `.framechar`, `.frameasset`, `.framevoice` with a safe reader, conflict handling and consent
  rules (decision 0017; `packages/io/test/package.test.ts`, CLI and server tests); CLI `assets search/show/validate/
  import/export/usages/update-usages`, `char create/export/import/version save`, `voice export/import`, `package
  export/import`, `versions compare`.
- Locks computed at every save with drift detection (FR-DAT-06).
- Character versions and “update usages” per instance, scene or project; asset usages; project version compare and
  undoable restore (server, CLI and Studio Versions dialog).
- Editable character builder: library-driven sections, looks management, live rig check (views, styles, mouth shapes,
  action compatibility), local undo/redo, randomise, save version / save as new with update scope, `.framechar` export
  (Studio e2e with axe).
- Imports: PNG/JPEG/WebP sniffed and measured, SVG parsed safely into vector layers, audio decoded onto music/ambience/
  SFX tracks, rights statement and licence recorded; images render through the one renderer in preview, CLI and
  export (decision 0018).
- Rigging assistant: layered PSD/SVG → character with mapping suggestions, per-view frames, declared view gaps and a
  library mouth for missing shapes, live preview with test gestures (decision 0019; tests and Studio e2e).
- Fixes found by tests: CLI renders ignored project-local assets; the Layers tree omitted image instances; dropdowns
  opened behind dialogs; Windows path in a new test.

- Part editor (FR-PED-01/02/04/05): point and binding editing, mirror view, family drafting, new part from existing,
  rig-check gate with drafts (Studio e2e, rig/test/edit.test.ts, server/test/parts.test.ts).
- User library in the profile folder with save/adopt, favourites and collections, compatibility reasons, full-page
  library with filters, details, versions, usages and problems; persistent thumbnail cache (server tests, Studio e2e).
- “Open as a copy” for project versions; builder Compare; AC-02 and AC-20 automated paths (tools/test/m2-acceptance).
- Rigging assistant outputs for props with states and location kits; the prop evaluator draws placed artwork
  (io/server rigging tests, Studio e2e “…prop with states…”). PR ModMonLab/framestudio#1 merged mid-session.

**In progress** — see Next actions (pivot adjustment and hand poses, remaining thumbnails, M2 exit runs, then M3).

**Not verified (needs the reference machine or people)** — unchanged from session 1: NFR-06, AC-03, AC-17, AC-24,
FR-VWK-02/04, CAT-06 visual review, listening panel.

## Session report — 2026-10-22, session 1 (archived)

**Completed (with evidence)**
- M0 foundations (see the milestone table).
- M1 engine path: rig v1 and part contract, scene evaluation, first content set (446 catalog items + caption styles
  and output presets), golden frames (tools/test/scene-render.test.ts).
- Voice Worker (FastAPI; fixture + Qwen3-TTS engines; WhisperX + g2p-en aligner): 15 pytest tests on CPU
  (services/voice-worker/tests); typed `@frame/voice-client` with design/take/align workflows.
- Audio and export: pure audio plan with fades/pan/ducking, offline mixer, BS.1770 loudness (EBU reference within
  0.1 LU), limiter, ffmpeg MP4/WebM/ProRes/GIF/PNG/WAV, SRT/WebVTT, stems, render report
  (tools/test/export.test.ts); `frame render frame|video|presets`.
- Frame Server: REST + WebSocket entity deltas, job queues, media, library, frames, voice endpoints, external change
  reload, host/token checks (packages/server/test); CLI server mode (`--server`, cli-server-mode.test.ts).
- Studio: workspace (app bar, modes, rail, layers, library browser, canvas with selection/drag, properties
  Properties/Acting/Audio, timeline with lip-sync lane, export dialog, jobs with player, worker status, voice designer)
  and builder screen (M1 scope). apps/studio/e2e: preview pixels identical to the server/CLI renderer; full voice →
  takes → export flow with the fixture worker; axe WCAG A/AA clean on the workspace.
- M1 exit evidence on the fixture path: tools/test/slice.test.ts and the Studio e2e (CI job `slice`).
- Bugs found and fixed by tests this session: stale MISSING_FILE problems after crash recovery; Windows path handling
  (`fileURLToPath`); CRLF checkouts; library kind filter matching by prefix; per-frame 8 MB raster allocations that made
  long full-HD exports fail.

**In progress**
- M1 sign-off: CI run 12 is green on every job (incl. the Studio e2e slice); the real-engine run on the reference GPU remains (owner checklist §1).
- Studio polish for UI-02 (panel resizing, context menus, drag-and-drop from the library, Problems panel, range bank,
  record/upload takes).

**Not verified (needs the reference machine or people)** — NFR-06, AC-03, AC-17, AC-24, FR-VWK-02/04, CAT-06 visual
review, listening panel; steps in docs/acceptance/owner-checklist.md.
