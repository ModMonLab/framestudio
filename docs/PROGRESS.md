# Frame — implementation progress
Last updated: 2026-10-22 · Session 5

## Current milestone: M3 Direction and M4 Agents — automated paths pass; owner runs pending (M1 real-engine run on the reference GPU; M2–M4 walkthroughs)

## Status by milestone
| Milestone | Status | Exit evidence |
|---|---|---|
| M0 Foundations | Done | Schemas published (`frame schema <type>`, packages/schema); component stories in both themes (apps/gallery, 40 screenshots + axe); `frame init` + `frame validate` (packages/cli/test/cli.test.ts); CI workflow with golden-frame harness (packages/render/test) |
| M1 Vertical slice | In progress | Fixture-worker path passes: tools/test/slice.test.ts (two designed voices, 4 aligned takes, export, server = CLI frames byte-identical) and apps/studio/e2e/studio.spec.ts (same flow in the Studio, preview pixels = server/CLI renderer). Real Qwen3-TTS run pending on the reference GPU. |
| M2 Builder and assets | In progress | Packages (packages/io/test/package.test.ts, cli + server package tests), character versions and update usages (packages/server/test/versions.test.ts, AC-11 path), editable builder with compare (Studio e2e “character builder…”), imports and rigging assistant for characters, props and sets (packages/io/test/import.test.ts, rigging.test.ts, Studio e2e, AC-12 path), part editor (Studio e2e “part editor…”), user library, favourites and collections, full-page library (Studio e2e), AC-02 and AC-20 automated paths (tools/test/m2-acceptance.test.ts). Pending for exit: owner runs of AC-02/AC-11/AC-12 (artist PSD) and AC-20 on a second OS; hand-pose supply; FR-PED-03 |
| M3 Direction | In progress | Automated paths for every M3 requirement: perform.test.ts, recipes.test.ts, timeline.test.ts, m3-acceptance (AC-06/07/08), m3-effects, m3-text (AC-23), m3-templates (AC-22), m3-identity, m3-motion, lipsync-accuracy (AC-09), content-audio, Studio e2e. Pending for exit: owner runs of AC-06..10/22/23 with real takes; scrub audio, pinch zoom, props timeline group |
| M4 Agents | In progress | `frame mcp` with the FR-AGT-02 tools plus apply_recipe, auto_coverage, apply_template, add_sound; FR-AGT-03 resources; agent tagging, session revert and Studio activity log; AC-13 through MCP (packages/mcp/test/mcp.test.ts: 3 scenes, 2 characters, takes, recipes, shots, music, conflict, frame and video). Pending: an owner run with a real agent from a written brief |
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
| FR-ARC-05 | Done | packages/server/src/jobs.ts: render, voice, thumbnails (POST /api/library/thumbnails/build, cancellable) and package import (`?job=true`) jobs with state, progress, logs and cancel; server.test.ts | Long work (render, import, generation, alignment, thumbnailing) runs a — Render and voice jobs with progress/cancel; import/thumbnail jobs later |
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
| FR-DAT-12 | Done | Every format has a JSON Schema in `@frame/schema` (`frame schema <type>`) and a generated page in `docs/formats/` (`pnpm docs:formats`); `tools/test/formats-docs.test.ts` fails when a schema is undocumented or the docs are stale | Format docs |
| FR-PRJ-01 | Done | Home “New project” form (empty, template, or project package); POST /api/projects/create `template`; /api/projects/import-package; `frame init --template --cast`; m3-templates.test.ts; Studio e2e “a new project starts from a template…” | Create — Empty or from a production template; from a project package pending |
| FR-PRJ-02 | Done | session.test.ts (duplicate/delete); cli episode group | Episodes |
| FR-PRJ-03 | Done | session.test.ts (duration safety); cli scene group | Scenes — Tree drag reorder in Studio M1 |
| FR-PRJ-04 | Done | core notes.ts (Markdown subset) + NotesEditor (project description, episode and scene notes; one undo step per edit); Script view (scene order, in-place edits, take states); export text/Fountain/PDF (io pdf.ts); script.test.ts, pdf.test.ts; e2e “the script view…”, “project settings, rich-text notes…” | Notes and script |
| FR-PRJ-05 | Done | File ▸ Project settings…: name, description, style family (refused with a list via styleFamilyBlockers), frame rate (re-snap report), default output, captions, worker endpoint, render folder, agent permissions; e2e “project settings…” | Project settings |
| FR-PRJ-06 | Done | Home browser: server recent list (io recent.ts) with thumbnails, last opened, episode/scene counts, pinned, templates; search and sort; open, reveal, duplicate (new id), export package, delete to OS trash; recent.test.ts; e2e “the project browser…” | Browser |
| FR-PRJ-07 | Done | store.test.ts “invalid folders”; Home validation report for unreadable folders and “opened with problems” dialog; e2e “the project browser…” | Open folder — Studio open-folder UI |
| FR-PER-01 | Done | io/project.ts autosave (debounced, journaled); Studio save badge Saved/Saving…/Unsaved/Not saved with the error and Retry | Autosave — Retry action in badge pending |
| FR-PER-02 | Done | session.test.ts (undo ≥200, labels); canvas drags, number fields and notes commit one command per gesture; undo never re-triggers generation | Undo/redo — Studio single-step drags in M1 |
| FR-PER-03 | Done | store.test.ts; server/test/versions.test.ts; Studio e2e “project versions…”; `frame versions compare|restore` | Versions (snapshots) — Save, list, compare summary (scenes, clips, character versions, assets), undoable restore and “open as a copy” (new folder, new project id) |
| FR-PER-04 | Done | store.test.ts recovery; crash.test.ts | Crash recovery |
| FR-PER-05 | Done | server.test.ts “detects edits made on disk…” and “holds autosave when files change on disk under unsaved work…”; Studio “Project changed on disk” dialog (load disk version / keep mine) | External changes — Merge UI when local changes are pending: event sent, dialog pending |
| FR-PER-06 | Done | core validate.ts problems with fix commands; Problems popover grouped by severity with Go to and one-click fixes (extend scene, cut shot, move line, end clip, generate take, relink media by hash); script.test.ts “one-click fixes” | Validation — One-click fixes pending |
| FR-PER-07 | Done | core clipboard.ts (copySelection/pasteCommands: new ids and tracks, group members, recipe groups onto same-named characters, local assets, media across open projects); POST /scenes/:sid/paste; Edit ▸ Cut/Copy/Paste and Ctrl+X/C/V; clipboard.test.ts; e2e “copy and paste…” | Clipboard |
| FR-AST-01 | Done | packages/io/src/user-library.ts; server/test/user-library.test.ts; Studio e2e “favourites, collections and the user library…” | Library sources — Bundled, user (profile folder, FRAME_USER_DIR), project-local and imported sources; “save to my library” and adopt-on-use keep projects self-contained |
| FR-AST-02 | Done | library.ts (invalid manifests reported and excluded); `frame assets validate`; GET /api/library/problems shown in the full-page library | Manifests |
| FR-AST-03 | Done | Assets panel and full-page library: search, categories with counts, filters by family/view/source, thumbnails; Studio e2e “full-page library…” | Browser |
| FR-AST-04 | Done | core/compat.ts; library `compat` reasons (family, rig, view, posture, draft); Studio e2e “favourites…” (incompatible items stay visible with a reason) | Compatibility |
| FR-AST-05 | Done | asset.updateUsages; /api/library/details and /usages; `frame assets usages|update-usages`; versions.test.ts; Studio e2e “full-page library…” | Versions — Details screen with versions, changes, usages and explicit update |
| FR-AST-06 | Done | UserLibrary prefs; /api/user/prefs; Studio e2e “favourites, collections…” | Favourites and collections |
| FR-AST-07 | Done | core/preview.ts covers every visual kind including mouth shapes, eye and brow states (held expressions) and face, eye and hair controls (the control away from its default; hair controls on the library's preview hair); `tools/test/previews.test.ts`; persistent content-keyed thumbnail cache (server/test/user-library.test.ts) | Thumbnails |
| FR-AST-08 | In progress | packages/rig/src/check.ts; packages/rig/test/check.test.ts; coverage validator column | Rig check and asset validator — Static contract check done; composition against reference characters and the action compatibility matrix pending |
| FR-IMP-01 | Done | packages/io/test/import.test.ts; Studio e2e “imports an SVG…”; decision 0018 | Imports validate type, size and content before acceptance and report p — PNG/JPEG/WebP sniffed and measured, SVG parsed safely, audio decoded and limited; precise errors |
| FR-IMP-02 | Done | import.test.ts (provenance, licence); rigging build requires a rights statement | Imported assets record provenance (file name, date, user statement of — File name, date, author, rights statement and licence recorded on every import |
| FR-IMP-03 | In progress | packages/io/test/rigging.test.ts; server/test/rigging.test.ts; Studio e2e “rigging assistant…” (character, prop); decision 0019 | Rigging assistant — Layered PSD/SVG → character (mapping, per-view frames, declared view gaps, library mouth, test gestures, rig check), prop with states, or location kit on depth planes. Pivot adjustment UI and hand-pose supply pending |
| FR-IMP-04 | Done | package.test.ts; `frame char|voice|assets export`; Studio builder Export… and File menu | Export assets — Characters (selected or all versions), voices (consent carried), any assets with dependencies; project packages |
| FR-CHR-01 | Done | tools/test/m2-acceptance.test.ts AC-02 (every builder section in both families); rig check requires both families | Families — Switching family changes only artwork; looks and performances carry over |
| FR-CHR-02 | Done | rig/src/geometry.ts point deltas per parameter; builder controls; rig/test/edit.test.ts bindings | Parametric parts |
| FR-CHR-03 | Done | rig check (four views or declared exemptions); AC-02 renders 4 views × 2 families; mirror/keep per part | Views |
| FR-CHR-04 | Done | tools/test/m3-acceptance.test.ts “FR-CHR-04/FR-CAM-03”; core/perform/locomotion.ts turnView | View changes — Turns pass through adjacent views (front, three, side, back); walking turns into its view over 0.24 s and back at the end |
| FR-CHR-05 | Done | rig/src/skeleton.ts (rig.biped@1 3D-lite skeleton, IK, postures); packages/core/test/perform.test.ts | Rig — Seated/wheelchair rig variants pending (FR-CHR-11) |
| FR-CHR-06 | Done | compose.ts anchors (head, face, eyes, mouth, wrists, grips …); props attach to grip anchors (tools/test/m3-acceptance.test.ts AC-07) | Anchors |
| FR-CHR-07 | Done | compose.ts SLOT_ORDER with near/far resolution per pose; rig check validates slots | Layering |
| FR-CHR-08 | Done | scene-render.test.ts lip sync with expressions; FaceState + mouth letter composited | Expressions and mouth |
| FR-CHR-09 | Done | looks in character data; instances reference id@version + look; look clips switch costume over time (wardrobe.test.ts) | Identity vs appearance — Look switching clips (FR-WRD-03) pending |
| FR-CHR-10 | Done | server/test/versions.test.ts; core/test/versions.test.ts; Studio e2e builder save | Versioning — New immutable version (or new character from a library one); update one instance, a scene or the project, undoable |
| FR-CHR-11 | Done | tools/content/parts/identity.ts; PartData.variant (decision 0020); tools/test/m3-identity.test.ts | Inclusive options — All 12 A20 options; wheelchair users stay seated and roll (act.push-wheelchair or any locomotion clip); limb difference and prosthetics; pregnancy and albinism variants |
| FR-BLD-01 | Done | apps/studio/src/components/Builder.tsx; Studio e2e “character builder…” (axe) | Layout — Parts tree with search over current values and changed dots, live canvas, turnaround, test bar, properties panel |
| FR-BLD-02 | In progress | BuilderProperties.tsx; accessories (C1), skin details (A13), makeup (A14) and identity options (A20) now in the library | Sections — Facial hair and patterns wait for content; voice auditions pending |
| FR-BLD-03 | Done | Builder preview uses the export renderer in both families and every view; turnaround sheet; “Compare” saved vs. draft | Live preview |
| FR-BLD-04 | Done | Builder test bar: any expression, any action, lip-sync test with mouth readout | Testing |
| FR-BLD-05 | In progress | Randomise (parts, build, colours); “Describe a character” states its prerequisite | Randomise and suggest — Constraint choices (life stage, palette) in the UI pending |
| FR-BLD-06 | Done | Studio e2e builder save; leave-with-changes confirmation; Export… .framechar | Save |
| FR-BLD-07 | Done | Looks: new, duplicate, rename, default, delete; garments, colours, per-garment options (sleeves, hood, front) and patterns (pattern, scale, rotation, colours) per look; wardrobe.test.ts | Looks — Patterns (B6) and per-garment options pending |
| FR-BLD-08 | Done | POST /characters/check (core/character-check.ts); builder footer and drill-down dialog | Rig check — Views, styles, mouth shapes, action compatibility, per-part contract problems |
| FR-PED-01 | Done | apps/studio/src/components/PartEditor.tsx; rig/test/edit.test.ts; Studio e2e “part editor…” | Part editor — Points (drag, add, delete), parameter bindings, fills, strokes, slots, mirror view, live rig check |
| FR-PED-02 | Done | core/part-save.ts; server/test/parts.test.ts; Studio e2e “part editor…” | New part from existing — New part from existing and new versions of project parts |
| FR-PED-03 | Not started | — | AI drafting — Needs an AI drafting backend; provenance value `ai-assisted-human-reviewed` is already supported |
| FR-PED-04 | Done | rig/src/edit.ts convertFamily; rig/test/edit.test.ts; part editor “Draft <family> from <other>” | Family conversion assist — Drafts are saved only after review (tagged draft until the rig check passes) |
| FR-PED-05 | Done | partManifest rig-check gate; server/test/parts.test.ts | Validation — Failing parts save only as drafts with review “changes requested” |
| FR-WRD-01 | Done | Garments and accessories compose per look in every view, posture and action (m2-acceptance AC-02 every builder section × 4 views × 2 families; wardrobe.test.ts) | Garments and accessories from Catalog B and C attach to the rig with l |
| FR-WRD-02 | Done | Look colours (palette + custom swatch), B6 patterns tiled over patternable garments with scale/rotation/colours (rig withPattern, 14 pattern assets incl. custom print from an image), per-garment options in the builder; wardrobe.test.ts | Colours (palette + custom), patterns (Catalog B6) with scale/rotation/ |
| FR-WRD-03 | Done | Instance look in Properties; look clips (params.look, transitionS) on the acting track dissolve into the new look and persist (lookAt); Acting ▸ Wardrobe “Change look”; wardrobe.test.ts; e2e “a ready-made set… costume change…” | A scene instance chooses a look |
| FR-WRD-04 | Done | Accessory taken off into a hand (held at the grip, rig heldIn), put back on or put away, via any hand action (accessoryOp/accessory params or ActionData.accessory); Acting ▸ Wardrobe; wardrobe.test.ts | Accessories may also be props (e |
| FR-EXP-01 | Done | packages/core/test/perform.test.ts (timed clips, intensity, blends, hold variation) | Apply any Catalog E1 expression as a timed clip with intensity, blend |
| FR-EXP-02 | Done | packages/core/test/perform.test.ts (per-clip tune without changing the preset) | Fine-tune per clip: eye state, brow states (L/R), mouth curvature, che |
| FR-EXP-03 | Done | packages/core/test/perform.test.ts (automatic, suppressed when eyes closed, blink clips add/remove) | Blinks are automatic (natural interval, suppressed during closed-eye e |
| FR-EXP-04 | Done | packages/core/test/perform.test.ts (cross-fade; overlaps beyond blends are CHANNEL_CONFLICT) | Expressions blend: consecutive clips cross-fade over their blend times |
| FR-EXP-05 | Done | packages/core/test/perform.test.ts (baseExpression applies when no clip is active) | Base expression per instance (resting face) applies when no clip is ac |
| FR-ACT-01 | Done | packages/core/test/perform.test.ts; Acting tab and timeline drops; params hand/intensity/speed/prop/path | Apply any Catalog F1 action as a clip to a compatible character |
| FR-ACT-02 | Done | packages/core/test/perform.test.ts (channels from manifests, mirrored by hand; additive layering) | Channels |
| FR-ACT-03 | Done | packages/core/test/perform.test.ts (posture persists after sit/stand; POSTURE_MISMATCH warning) | Postures |
| FR-ACT-04 | Done | tools/test/m3-acceptance.test.ts AC-08 (curved path, waypoints, mark, facing, planted feet < 2 px, no drift) | Locomotion — Feet follow the path’s y; snapping paths to ground lines pending |
| FR-ACT-05 | Done | tools/test/m3-acceptance.test.ts AC-08 (gaze follows a walking character); evaluate.ts gaze clips (character, object, camera, point) | Gaze |
| FR-ACT-06 | Done | tools/test/m3-acceptance.test.ts AC-07 and AC-06 path (hold windows, hand-over → receive) | Object interactions |
| FR-ACT-07 | Done | packages/core/test/perform.test.ts auto clips; evaluate.ts idle/listening; Studio e2e “auto performance…” | Idle and listening behaviour — Generated as editable auto clips; bake keeps them |
| FR-ACT-08 | Done | core/perform/auto.ts; CLI test; Studio e2e | Talking gestures — Gesture size from performance defaults; line energy not used yet |
| FR-ACT-09 | Done | data.ts samplePrincipled/keySpeed; tools/test/m3-motion.test.ts; Properties “Motion” section | Motion principles — Anticipation, overshoot and squash/stretch per action clip, computed from the action’s own curves |
| FR-ACT-10 | Done | clip.params.pose offsets; tools/test/m3-motion.test.ts; Properties “Pose editor (advanced)”, hidden by default | Pose editing — Named controls keyed at clip-relative times and interpolated |
| FR-RCP-01 | Done | packages/core/test/recipes.test.ts; tools/test/m3-acceptance.test.ts AC-06 path; Studio e2e “applies a line-anchored recipe…” | Apply any Catalog G1 recipe to one or more characters — 18 recipes authored from existing assets |
| FR-RCP-02 | Done | recipes.test.ts (one group id, moves as one); clip.ungroup in the clip menu | Applying a recipe expands into ordinary clips on the right tracks (act |
| FR-RCP-03 | Done | recipes.test.ts (word anchors: aligned words, else estimated) | Recipes anchored to a line align to that line's words (e |
| FR-RCP-04 | Done | recipes.test.ts recipeFromClips; CLI recipe save; clip menu “Save selection as recipe…” | Users can save a selection of clips as a new recipe (with role placeho |
| FR-PRP-01 | Done | tools/test/m3-acceptance.test.ts AC-07 (states by events and clips, anchors, sound cues); anim.* loops in prop art | Props from Catalog H1 support transform, depth, layering, states (swit |
| FR-PRP-02 | Done | actionFitsProp; GET …/interactions; Studio e2e “uses an object from the Acting tab…” | Interactive props expose their actions in the Acting tab of characters |
| FR-ENV-01 | Done | 16 kits (I1) with layered parts and palettes; 32 ready-made sets (I2: kit pieces, props, marks, cameras, palette, time of day) applied in one undo step; Scene ▸ Save set… saves your own (user asset); sets.test.ts (all 32 place, validate, render, save back); e2e | Location kits (Catalog I1) provide layered parts with palettes |
| FR-ENV-02 | Done | Kit palettes (original, warm, cool, muted, pastel, bold) keyed by colour slot; time-of-day presets (content library.json) shift colours and set the lighting atmosphere; Properties ▸ kit section; sets.test.ts; e2e | Kit palettes recolour all kit parts consistently |
| FR-STG-01 | Done | scene stage schema (ground lines, marks, depth planes); stage.addMark; tools/test/m3-acceptance.test.ts AC-08 mark | Stage |
| FR-STG-02 | Done | evaluate.ts draw order by plane/order, parallax per instance through the lens; sets.test.ts “depth vs parallax” | Depth vs parallax — No dedicated test yet |
| FR-STG-03 | Done | Canvas drag with handles and smart guides/snapping (objects, stage centre, ground lines, marks; Alt skips), numeric transform, align/distribute toolbar, group/ungroup, lock, hide; core layout.ts + layout.test.ts | Placement — Smart guides, snapping, align/distribute pending |
| FR-STG-04 | Done | tools/test/m3-acceptance.test.ts seating test (hips on the seat anchor for each character); Studio e2e “dropping a character on a chair…” | Seating |
| FR-STG-05 | Done | Studio e2e “workspace opens a project…” (Layers → timeline/toolbar selection) | Selection sync |
| FR-CAM-01 | Done | camera.add/update/remove; framing presets from subjects; CLI camera frame; stage overview with the shot camera frame dragged to move and resized from the corner (EvalOptions.overview); e2e “the camera frame is dragged…” | Cameras — Manual framing by dragging the frame on the stage pending |
| FR-CAM-02 | Done | cameraAt (shot track → camera, default camera fallback); SHOT_OVERLAP blocks export (session.test.ts) | Shots |
| FR-CAM-03 | Done | cameraAt moves with easing/intensity; `follow` moves keep the framing on the walking subject (m3-acceptance “FR-CHR-04/FR-CAM-03”) | Moves — 18 moves authored including cam.follow-subject |
| FR-CAM-04 | Done | 6 shot recipes authored (cam.*); recipe engine frames shots from subjects | Shot recipes |
| FR-CAM-05 | Done | io/auto-coverage.ts; CLI test; tools/test/m3-acceptance.test.ts AC-06 path; Studio e2e | Auto-coverage |
| FR-CAM-06 | Done | ratioOverrides and headroom rule in viewMatrix; canvas previews every project ratio with action/title safe areas and the app-UI zone on vertical; dragging the frame on another ratio edits its override; e2e | Aspect ratios — Safe-area previews and per-ratio framing UI pending |
| FR-CAM-07 | Done | validate.ts (channels from manifests, speakers, shots, past end); Studio timeline hatching (e2e “auto performance…”) | Conflict rules |
| FR-FX-01 | Done | core/perform/fx.ts; tools/test/m3-effects.test.ts; Studio e2e “atmosphere, effects and a shot transition…” | Apply Catalog K1 effects as clips attached to screen, stage point, obj — 24 K1 effects as clips attached to the screen, a stage point or an object; silhouette and freeze |
| FR-FX-02 | Done | tools/test/m3-effects.test.ts; Studio e2e | Atmosphere (Catalog J1) as scene layers with intensity, colour and tim — 42 J1 atmospheres (weather, light, grades) with intensity, colour, timing; seeded particles |
| FR-FX-03 | Done | shot `transition`/`transitionS`; EvalOptions.before; m3-effects.test.ts; m3-templates.test.ts “blends from the previous scene”; Studio e2e | Transitions (Catalog K2) between shots and between scenes with duratio — 17 K2 transitions between shots and between scenes (episode exports and the Studio preview) |
| FR-FX-04 | Done | Studio e2e previewMatchesServer with atmosphere, effect and transition; m3-effects determinism checks | Effects and atmosphere render identically in preview and export (NFR-0 |
| FR-TML-01 | Done | Timeline.tsx groups: Camera, one per character, Props (prop state tracks, added from the prop's State section), Effects and text, Sound; collapsed groups show summary strips; Studio e2e “a prop state change lands in the Props group…” | Structure |
| FR-TML-02 | Done | Timeline.tsx; packages/core/test/timeline.test.ts; Studio e2e “timeline editing…” and “box selection…” | Editing — Select, Shift multi-select, box select, group moves, trim, split, duplicate, delete, ripple toggle, snapping to frames/clip edges/playhead/markers/word boundaries, numeric start and length |
| FR-TML-03 | Done | clip.trim moves the source in-point of media and lines; never stretches | Media trimming |
| FR-TML-04 | Done | marker.add/update/remove; double-click renames; I/O loop region; Studio e2e | Markers and regions |
| FR-TML-05 | Done | Play/pause, J/K/L, frame step, I/O loop, Shift+Space plays from the selection, Play episode crosses scenes; dragging the playhead plays a short slice of the same mix plan (playback.ts `scrubAudio`) | Playback |
| FR-TML-06 | Not verified | One production clock drives picture, audio, lip sync and captions (playback.ts) | Sync — A/V offset ≤ 40 ms needs the reference machine |
| FR-TML-07 | Done | Track header: mute, solo, lock, hide (hidden tracks do not draw); menu: rename and gain; text filter and All/Picture/Audio switch | Track controls |
| FR-TML-08 | Done | Zoom to fit, zoom to selection, zoom slider, trackpad pinch (ctrl + wheel) and two-finger touch pinch anchored under the fingers, overview strip on scenes over 90 s; Studio e2e pinch | Zoom and navigation |
| FR-TML-09 | Done | EpisodeView.tsx: scene cards with thumbnails, reorder, transition into each scene; Studio e2e “…episode view…” (axe) | Episode view |
| FR-SND-01 | Done | Assets panel adds music/ambience (looping to scene end), SFX and cues; content-audio.test.ts; templates place music and ambience | Add music, ambience and SFX from Catalog N or imports — 12 music beds, 12 cues, 20 ambience loops, 20 SFX (see CAT-08) |
| FR-SND-02 | Done | audio-captions.test.ts fades/pan; io/audio.ts limit(); export.test.ts peak ≤ −1 dBFS; Properties ▸ Sound per clip (gain, pan, fades, curve, mute, duck) and track M/S/gain | Gain (dB), pan, fade in/out with curve, mute/solo per clip and track — Gain/pan/fades/mute/solo/limiter done; clip gain UI pending |
| FR-SND-03 | Done | audio-captions.test.ts ducking + duckCurve; ducking curve drawn on music/ambience lanes from the mix plan; depth/attack/release in the scene Mix section | Ducking — Automatic ducking with attack/release; curve display on timeline pending |
| FR-SND-04 | Done | tools/test/m3-acceptance.test.ts AC-07 (cues at events, prop-state sounds, regeneration keeps baked cues); CLI scene sound-cues; Studio e2e | Sound cues |
| FR-SND-05 | Done | Level meter (peaks, 1.5 s hold, clip warning) on the preview master bus; export loudness readout and normalisation (preset, −14, −16, −23, off); export.test.ts BS.1770 reference | Meters — Loudness + normalisation in export report; live meters pending |
| FR-SND-06 | Done | scene.audio.roomTone: the scene ambience fills gaps between lines at −18 dB without ducking; audio-captions.test.ts “room tone…”; Mix toggle | Room tone and silence |
| FR-TXT-01 | In progress | core/captions.ts; scene-render.test.ts caption goldens; audio-captions.test.ts | Captions are generated from dialogue text and word timings (aligned ta — Captions from text + word timings, styles from txt.* assets, stacked speakers, safe areas; per-line style override pending |
| FR-TXT-02 | Done | audio-captions.test.ts karaoke/pop; golden captions-bold-karaoke-captions | Word-highlight ("karaoke") and animated-word caption styles use word t — Karaoke and animated-word styles follow word timings |
| FR-TXT-03 | Done | core/perform/text.ts bubbleItems; tools/test/m3-text.test.ts (tracks a walking character); Studio e2e “a speech bubble…” | Speech and thought bubbles attach to a character's mouth/head anchor w — Round, square, shout, whisper, thought and narration; tail to the mouth |
| FR-TXT-04 | Done | graphicItems; m3-text.test.ts (safe areas in every aspect ratio) | Titles, lower thirds, cards, credits and graphics (Catalog O1) with co — Titles, lower thirds, cards, credits, bugs, progress, countdown, callouts with in/out animation |
| FR-TXT-05 | Done | worldTextItems; m3-text.test.ts (moves with the camera) | World text (signs, screens) renders in scene space and moves with the — Signs, screens, chalkboards in scene space |
| FR-TXT-06 | Done | audio-captions.test.ts SRT/VTT; export.test.ts files | Export subtitles as SRT and WebVTT (FR-RND-06) — SRT and WebVTT share pages with burn-in |
| FR-TPL-01 | Done | tools/test/m3-templates.test.ts (all 16 P1 templates, 3 aspect ratios); `frame template apply`; Studio e2e “a template starts a new scene…” | Catalog P1 templates create complete projects or scenes — Templates add a scene with set, cast, framed cameras, shots, music, titles; suggested script in the scene notes |
| FR-TPL-02 | Done | templateFromScenes; POST …/templates/save scope=episode; `frame template save --episode`; Scene menu; m3-templates.test.ts | Users can save any project or scene as a template (with optional place — Scenes or whole episodes; cast roles shared across scenes; caption style kept |
| FR-TPL-03 | Done | replaceCastCommands; `frame cast replace`; Layers context menu “Replace cast…”; m3-templates.test.ts; Studio e2e | "Replace cast" swaps a template's characters with the user's character — Clips, gaze and shots stay with the instance; cameras framed on it are reframed |
| FR-DLG-01 | Done | Studio Audio tab “Add line at playhead”; Script view import; CLI `script import`; script.test.ts; e2e “the script view imports a script…” | Lines are created from the timeline, the Script view, a character's Di — Script view pending |
| FR-DLG-02 | Done | Script view, timeline and Properties all edit the same line clip (line.setText/setSpeaker/setDelivery); e2e “the script view…” | A line has one canonical record (speaker, text, revision, delivery, ch |
| FR-DLG-03 | Done | session.test.ts take outdated/confirm (take.confirm for recorded/uploaded takes) | Editing a line's text increments its revision and marks takes generate |
| FR-DLG-04 | Done | validate.ts lineTakeState + TAKE_* problems blocksExport; Script view take column | Take states: Missing, Queued, Generating, Ready, Failed, Outdated, Mut |
| FR-DLG-05 | Done | line.chooseTake (undoable), take.remove; Script view “Clean up unused takes” | Multiple takes per line are kept |
| FR-DLG-06 | Done | line.chooseTake clip length + ripple (script.test.ts); SPEAKER_OVERLAP problem | A line's clip length follows the chosen take's measured duration |
| FR-DLG-07 | Done | script.test.ts “overlapping speech mixes both takes and stacks both captions” | Overlapping speech between different speakers is allowed and mixed |
| FR-DLG-08 | Done | worker synth_with_pauses ([pause Ns] and mid-line … beats; test_api.py); estimateSpeechSeconds; stripPauseMarkers for captions | Pauses and beats: lines may contain explicit pause markers (`[pause 0 |
| FR-VOI-01 | Done | Voice library screen (`#/p/<pid>/voices`, Scene ▸ Voice library): project, user and bundled voices with description, method, language, versions, consent, users, a play button per reference, assign to a character; Studio e2e “records a take and clones a voice…” | Voice library |
| FR-VOI-02 | In progress | slice.test.ts; apps/studio/e2e/studio.spec.ts (fixture worker) | Design a voice — Design → candidates → audition → save works end to end; real Qwen3 output not verified here (no GPU) |
| FR-VOI-03 | Done (fixture path) | Worker /v1/voices/range; `POST /voices/range` job; Studio "Emotional range…" dialog (audition, similarity, accept); `tools/test/slice.test.ts` (happy delivery uses the happy reference) and Studio e2e M1 slice | Emotional range bank — real-engine quality Not verified — requires reference machine (AC-03) |
| FR-VOI-04 | Done (fixture path) | `POST /voices/clone` (consent statement and speaker name mandatory, agents need the `cloneVoices` permission, ≥3 s, auto-transcription on the worker when no transcript); Studio Clone dialog; `server.test.ts` “clones a voice only with consent…”; Studio e2e | Clone a voice — real-engine likeness Not verified — requires reference machine |
| FR-VOI-05 | Done | Studio Recorder: microphone choice, noise-floor check, count-in, level meter, numbered takes, auto-trim with manual trim, WAV encode; used for takes and cloning; Studio e2e with Chromium's fake microphone (test tones, not speech) | Record in browser |
| FR-VOI-06 | Done | server.test.ts upload (decode, measure, amplitude envelope, coded failure; `normalise=true` peaks to −1 dBFS keeping the original); slice.test.ts upload aligned by the worker; Studio “Upload take…” with the Normalise toggle | Upload |
| FR-VOI-07 | Done | slice.test.ts; studio e2e “Generate takes”; seed policy (random, fixed, reuse the chosen take's seed) in the Current line section | Generate takes |
| FR-VOI-08 | Done | `resolveDelivery` sends only reported controls (voice-client `client.test.ts`); 12 delivery presets (Q2) whose settings the line can override; Studio delivery shows only worker emotions and states unsupported pace/instruction | Honest capabilities |
| FR-VOI-09 | Done | session.test.ts outdated takes; workflow.ts never auto-selects stale; Studio “Previous text” badge | Stale results |
| FR-VOI-10 | Done | Accepting range references (`POST /voices/version`) or redesigning (`POST /voices` with `versionOf`) saves version n+1 (next free number); characters switch only when asked; existing takes keep their voice version. Evidence: `tools/test/slice.test.ts`, Studio e2e M1 slice | Versions |
| FR-VOI-11 | Blocked | Needs real voice-model output: starter voices must be generated and reviewed on the reference machine (no GPU here; fixture audio must never ship as a voice) | Starter voices |
| FR-VOI-12 | Done | server.test.ts worker status; Studio WorkerBadge (connected/busy/offline/not set up with hint) | Worker status |
| FR-VWK-01 | In progress | services/voice-worker (FastAPI), README, Dockerfile, setup-wsl.sh | The Voice Worker is a separate service the owner runs (WSL2/Docker on — Install not verified on the reference machine |
| FR-VWK-02 | Not verified | engines/qwen3.py against qwen-tts 0.1.1 API (decision 0006) | Engines — Requires reference GPU (owner checklist §1) |
| FR-VWK-03 | In progress | tests/test_models.py (one resident model, OOM recovery logic) | GPU budget — Real VRAM behaviour needs reference GPU |
| FR-VWK-04 | Not verified | benchmark command | Model sizes — Requires reference GPU |
| FR-VWK-05 | Done | blobs.py LRU; idempotency test | Caching |
| FR-VWK-06 | Done | test_api.py token + network-bind refusal | Exposure |
| FR-VWK-07 | In progress | `frame-voice-worker doctor` | Installation — Needs a run on the reference machine |
| FR-VWK-08 | Done | `fetch-models` refuses without --accept-licences; LICENSES.md | Licences |
| FR-LIP-01 | In progress | lipsync.ts mapping; slice.test.ts; lipsync-accuracy.test.ts | Pipeline — WhisperX path not verified without GPU |
| FR-LIP-02 | Done | alignment.envelope + evaluate amplitude fallback; server.test.ts upload without worker | Fallback |
| FR-LIP-03 | Done | compose.ts mouth with expression; tools/test/lipsync-accuracy.test.ts “FR-LIP-03/05” | Composition |
| FR-LIP-04 | Done | Lip-sync lane: click a block to change or reset its shape; line.setMouthOverrides; lipsync-accuracy.test.ts (edits survive re-alignment) | Editing |
| FR-LIP-05 | Done | No mouth from behind; profile shapes in side view (lipsync-accuracy.test.ts) | Views |
| FR-LIP-06 | In progress | lipSyncAccuracy/lipSyncSummary; `frame lipsync accuracy`; 50-line corpus: 100 % bilabials within ±1 frame, ≥ 99.5 % coverage at 24/25/30 fps on speech-like alignments | Accuracy — Owner run on generated, recorded and uploaded takes |
| FR-RND-01 | Done | export.test.ts video frame vs CLI still; slice.test.ts server vs CLI byte-identical; studio e2e preview vs server pixel-identical | One renderer |
| FR-RND-02 | Done | scene-render.test.ts determinism; seeded idle/blinks | Determinism |
| FR-RND-03 | In progress | Studio CanvasView (half resolution while playing, “Preview quality” shown) | Preview — Interactive-rate numbers need AC-14 |
| FR-RND-04 | Done | out.* presets; Export dialog: range (scene, episode, loop, markers, selection), captions, subtitles, stems, custom size, frame rate, quality, loudness, other ratios; server.test.ts “exports with custom fps…” | Export settings — Custom size/bitrate UI pending |
| FR-RND-05 | Done | server render jobs snapshot state at submit; CLI snapshot | Snapshot |
| FR-RND-06 | Done | export.test.ts (MP4, SRT/VTT, stems, report json+txt) | Outputs |
| FR-RND-07 | Done | server jobs with phases; Jobs popover with in-app player and Retry for failed/cancelled exports (POST /api/jobs/:id/retry); server.test.ts | Lifecycle — Retry button pending |
| FR-RND-08 | Done | export.test.ts blocked on missing media; Studio export dialog lists blocking problems | Validation before export |
| FR-RND-09 | Done | CanvasKit vector rendering at output resolution (sRGB); deterministic motion blur (sub-frame averaging, RenderOptions.motionBlur); server.test.ts | Quality |
| FR-RND-10 | Done | POST /renders/batch (queued one after another) and “Also export in” other ratios in the Export dialog; `frame render` without the Studio; server.test.ts | Batch |
| FR-CLI-01 | Done | cli tests (local); production.test.ts (every FR-CLI-05 group); packages/server/test/cli-server-mode.test.ts (server mode). Local and server mode share the engine and workflows; versions, packages and character edits run locally and say so with --server | A `frame` command provides every Studio capability that does not require a display |
| FR-CLI-02 | Done | framework.ts; cli-server-mode.test.ts (--server/--token, FRAME_AGENT_SESSION attribution) | Global options: `--project <path>`, `--json` (structured output on std |
| FR-CLI-03 | Done | cli.test.ts describe/schema/help | Discoverability: `frame help`, `frame <cmd> --help`, `frame schema <ty |
| FR-CLI-04 | Done | cli.test.ts exit codes | Exit codes: 0 success |
| FR-CLI-05 | Done | Every group of the SRS table: project (init, open, info, validate, settings, versions, diff, history, undo, redo, package), episodes and scenes, apply, assets, characters (create, set, look add/set, version save, sheet, export/import), staging (place, move, group, camera add/frame/set, kit apply, set apply), directing (line add/set, act add, face add, look-at, recipe apply, shot add, shot auto = scene coverage, fx add, sound add), voice (list, design, create from candidate or audio with consent, range build, takes generate/choose, align), render (frame, video, sheet), jobs (list, watch, cancel), services (server start, mcp start, worker status/doctor). Evidence: `packages/cli/test/production.test.ts` (local mode; voice group against the fixture worker), cli.test.ts | Command groups |
| FR-CLI-06 | Done | cli.test.ts dry-run | Every mutating command accepts `--dry-run` and returns the list of res |
| FR-CLI-07 | Done | Published `cli-envelope`, `cli-mutation` and `job` schemas (docs/formats/cli-*.md); production.test.ts validates every `--json` output against the envelope and edits against cli-mutation | Output schemas |
| FR-AGT-01 | Done | `frame mcp` (`@frame/mcp`, SDK 1.31.0, decision 0016): stdio; embedded loopback server or `--server`. Evidence: `packages/mcp/test/stdio.test.ts` (real CLI process) | `frame mcp` starts a Model Context Protocol server exposing typed tools over the same engine and permissions as the CLI |
| FR-AGT-02 | Done | All 17 tools + create_project, apply_recipe, auto_coverage, apply_template, add_sound; JSON Schema inputs; docs/reference/mcp-tools.md (generated). Evidence: packages/mcp/test/mcp.test.ts | Minimum tools |
| FR-AGT-03 | Done | `frame://schemas[/{type}]`, `frame://catalog` (refs, kinds, groups, capabilities), `frame://commands`, `frame://project/{id}/summary`; mcp.test.ts reads each | Resources |
| FR-AGT-04 | Done | Engine guard on permissions; server tags every agent change `agent:<session>` (commands, characters, voices, takes); agent undo limited to its own step, no redo, no revert-source, renders only inside the project; person-only `POST /revert-source` reverts a session as one step. Evidence: mcp.test.ts | Safety and tagging |
| FR-AGT-05 | Done | Studio Activity popover: agent sessions with their commands and "Revert session" (one undoable step), recent changes with source; agent-made clips marked in the timeline. Evidence: Studio e2e "agent changes are tagged…" (incl. axe on the popover) | Activity log |
| FR-ONB-01 | Done | Onboarding.tsx FirstRun (theme, worker check or skip, template or empty) and 8-step Tour (modes, Layers, assets, properties/builder, lines and takes, timeline, export, palette); e2e “first run…” | First run: choose theme, check the voice worker connection (or skip), |
| FR-ONB-02 | Done | Panel `help` link on every panel (Layers, Assets, Properties, Builder, Part editor, Library, Home, Settings) and the timeline; Help screen (help/topics.ts); tooltips via IconButton labels; empty states; e2e “command palette, settings and help” | Contextual help: every panel has a help link |
| FR-ONB-03 | Done | CommandPalette.tsx: Ctrl/⌘ K (rebindable) over commands (every menu item with shortcut), scenes, layers, assets (places the item), settings and help; `type:` filters; e2e “command palette…” | Command palette (Ctrl/⌘ K) searches commands, assets, layers, scenes, |
| FR-SET-01 | Done | Settings screen: theme, density, language (English), autosave delay, default frame rate/output, worker URL and token (stored 0600 beside the library, never echoed), worker engines, library locations and sizes, rebindable shortcuts, privacy (no telemetry), clear thumbnail cache; server.test.ts “keeps app settings…”; e2e. GPU/model options are set where the worker runs and shown read-only | Settings: theme (Dark, Light, System), UI density (Comfortable, Compac |
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
| CAT-08 | In progress | tools/content/sounds.ts, music.ts; tools/test/content-audio.test.ts (music −16 LUFS, ambience −30 LUFS, cues/SFX peak −3 dBFS, seamless loops) | Sound assets — Synthesised placeholders awaiting a listening review: 20/20 music, 12/12 cues, 20/20 ambience, 60/60 SFX |
| CAT-09 | Blocked | See FR-VOI-11: starter voices need real model output and review | Starter voices |
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
| AC-06 | In progress | tools/test/m3-acceptance.test.ts AC-06 path; coffee-shop kit, rain, music and ambience now in the library | Scene from scratch — Real takes and the two exports pending (owner run) |
| AC-07 | In progress | tools/test/m3-acceptance.test.ts AC-07 (mug with steam, contact cue, door, phone screen; mid-action seeks) | Interactive props — Studio walkthrough and listening check of the synthesised cues pending |
| AC-08 | In progress | tools/test/m3-acceptance.test.ts AC-08 (curved entry, mark, turn, sit, gaze follow, sliding < 2 px, no drift) | Locomotion and gaze — Studio walkthrough pending |
| AC-09 | In progress | tools/test/lipsync-accuracy.test.ts (corpus tools/test/fixtures/ac09-lines.json); `frame lipsync accuracy` | Lip-sync accuracy — Owner run with real takes |
| AC-10 | In progress | perform.test.ts and session.test.ts conflicts; Studio e2e hatching + validate; export blocked (export.test.ts) | Conflicts and validation — “Show” links from blocked export and the fix-to-unblock walkthrough pending |
| AC-11 | In progress | packages/server/test/versions.test.ts (two episodes, new version in one scene, reopen, snapshot restore) | Versions and reuse — Studio run of the full scenario pending |
| AC-12 | In progress | rigging.test.ts (character, prop, set); Studio e2e “rigging assistant…”, “imports an SVG…”; import.test.ts | Import and rigging assistant — Hand-pose supply and a real artist PSD pending |
| AC-13 | In progress | packages/mcp/test/mcp.test.ts “AC-13: an agent produces a 3-scene episode…” (MCP only: 2 characters, voices, takes, recipes, shots, music, dry runs, conflict resolved, frame and video); Studio e2e (agent-tagged clips, session revert) | Agent production — A run by a real agent from a written brief |
| AC-14 | Not started | — | Performance |
| AC-15 | Not started | — | Determinism and sync |
| AC-16 | In progress | crash.test.ts; store.test.ts disk-full retry | Reliability — External git merge pending |
| AC-17 | Not verified | test_models.py OOM logic | Worker resilience — Requires reference GPU |
| AC-18 | Not started | — | Design System compliance |
| AC-19 | Not started | — | Catalog coverage |
| AC-20 | In progress | package.test.ts; tools/test/m2-acceptance.test.ts AC-20 (new folder, no user library, identical frames) | Packages and portability — Second-machine (macOS/Linux) run pending |
| AC-21 | In progress | package.test.ts malicious archives (traversal, scripts, undeclared, oversized, hash mismatch); SVG safety tests | Security and privacy — Network audit and token-in-logs checks pending |
| AC-22 | In progress | tools/test/m3-templates.test.ts: every P1 template applies, validates with no problems and evaluates in 16:9, 9:16 and 1:1; replace cast retargets | Templates — Owner run: open, play and export each template in the Studio. Bundled looks naming unbuilt accessories log missing assets (content gap) |
| AC-23 | In progress | audio-captions.test.ts (karaoke, stacking, SRT/VTT); m3-text.test.ts (bubble tracks a walking character, safe areas in every ratio) | Captions and text — Owner check in the Studio |
| AC-24 | Not verified | — | Fresh setup — Requires clean Windows 11 laptop (owner checklist §3) |

## Catalog coverage
Report: [docs/catalog/coverage.md](catalog/coverage.md) (`pnpm catalog:coverage`). **Green: 0 / 1254 (0 %)**;
manifests present for 862 / 1254 (68.7 %). Nothing is green yet because no item has passed human visual review (CAT-06). All authored character parts pass
the static rig check (FR-AST-08); 426 of 446 manifests render previews in both families (hand poses pending). Lists with authored content:
A1–A20 face/body parts, controls, skin details, makeup and identity options (A11 facial hair pending), B1–B5 wardrobe, C1 accessories (40),
E1 expressions (83), F1 actions (34 of 118), D1 cast (14), H1 props (11 of 142), I1 kits (16), J1 atmosphere (42 of 54), K1 effects (24 of 38),
K2 transitions (17 of 18), N1 music (20), N2 cues (12), N3 ambience (20), N4 SFX (60), O1 text and graphics (36), P1 templates (16), R1 output presets (12).
Pending lists: A11 facial hair, B6 patterns, F1 actions (84), H1 props (131), J1 (12), K1 (14), K2 (1), L1 sets, Q1 starter voices (needs the worker).

## Next actions (ordered)
1. Keep CI green. Pull requests run typecheck, lint, unit, visual and worker on Linux (a few minutes); the browser suite (slice) and Windows/macOS run on main, by hand, or with the `full-ci` label. Run the Studio e2e locally before pushing, and push in batches.
2. Owner runs (they decide the M1–M4 exits): M1 Qwen3-TTS on the reference GPU; AC-02/11/12/20 (M2); Studio walkthroughs
   of AC-06..10/22/23 with real takes, including `frame lipsync accuracy` on generated, recorded and uploaded takes
   of the AC-09 corpus; an AC-13 run by a real agent from a written brief; a listening review of all synthesised sound
   and a visual review of content (CAT-06) (docs/acceptance/owner-checklist.md).
3. M3/M4 small remainders: scrub with audio (FR-TML-05), pinch zoom (FR-TML-08), a Props group in the timeline
   (FR-TML-01), projects from packages (FR-PRJ-01), clipboard (FR-PER-07).
4. M5 content: F1 actions (84), H1 props (131), A11 facial hair, B6 patterns, J1/K1/K2 remainders, L1 sets, Q1
   starter voices (with the worker).
5. M2 remainder: rigging pivot adjustment and hand-pose supply (FR-IMP-03); thumbnails for mouth shapes, eye/brow
   states and controls (FR-AST-07); builder constraint choices and patterns (FR-BLD-05/07).

## Open decisions and blockers
- Decision 0006: FR-VOI-03 interpretation (range bank via VoiceDesign + similarity check) — validated only by AC-03 on the reference machine.
- Decision 0013 (owner, 2026-10-22): ffmpeg is downloaded on first use (pinned, hash-checked, GPL notice in the profile); to implement in M6.
- No GPU in the cloud implementation container: live Voice Worker checks (NFR-06, AC-03, AC-17, AC-24) are
  **Not verified — requires reference machine**; steps in docs/acceptance/owner-checklist.md.
- Content gaps visible in the builder rig check: four bundled cast members reference accessories, skin details or a
  prop that are not authored yet; the cast's starter voices (Q1) are not authored, so exports of derived characters
  list them as unresolved references.

## Session report — 2026-10-22, session 5

**Completed (with evidence)**
- Accessories (40), skin details (20), makeup (12) and all 12 identity options; data-driven rig variants: wheelchair
  users stay seated and roll, limb difference, prosthetics, body and palette variants (decision 0020;
  tools/test/m3-identity.test.ts). The bundled cast now resolves with no missing parts.
- Timeline: box selection, group moves, ripple, word snapping, zoom to selection, marker rename, track hide/gain,
  overview strip, play from selection (packages/core/test/timeline.test.ts, Studio e2e).
- Motion principles (anticipation, overshoot, squash/stretch) and an advanced pose editor (tools/test/m3-motion.test.ts).
- Projects from templates, episode templates with shared cast, transitions between scenes, episode view and episode
  playback (m3-templates.test.ts, Studio e2e with axe).
- Lip-sync accuracy measures, a 50-line AC-09 corpus (100 % bilabials on time, ≥ 99.5 % coverage on speech-like
  alignments), `frame lipsync accuracy`, mouth-block editing in the timeline.
- Content: 8 more kits (I1 complete), 40 more SFX (N4 complete), 8 more music beds (N1 complete).
- MCP: apply_recipe, auto_coverage, apply_template, add_sound; the AC-13 production path through MCP only.
- CI made lighter: one run per change, superseded runs cancelled, browser suite and Windows/macOS on main.
- Bugs found and fixed: Delete in the Studio and the Properties panel's numeric Start/Length sent invalid command
  parameters; the seating e2e could map a drop through a canvas that was still resizing.

**Not verified (needs the reference machine or people)**: NFR-06, AC-03, AC-17, AC-24, FR-VWK-02/04, FR-TML-06 A/V
offset, CAT-06 visual review, a listening review of all synthesised sound, owner runs of AC-06..10/13/22/23.

## Session report — 2026-10-22, session 4 (archived)

**Completed (with evidence)**
- Smooth view turns (adjacent views, walking turns in and out) and camera moves that follow a walking subject
  (tools/test/m3-acceptance.test.ts “FR-CHR-04/FR-CAM-03”).
- Effects, atmosphere and transitions: 42 atmospheres, 24 effects, 17 transitions; grade, silhouette, freeze;
  preview equals export (tools/test/m3-effects.test.ts, Studio e2e).
- Speech and thought bubbles, titles, lower thirds, credits, callouts and world text (tools/test/m3-text.test.ts,
  Studio e2e).
- Timeline: trim handles with snapping, split, markers, loop region, J/K/L, zoom to fit (Studio e2e).
- Sound content: 12 music beds, 12 cues, 20 ambience loops, loudness-normalised and loop-checked
  (tools/test/content-audio.test.ts). All synthesised placeholders, not recordings.
- Kits: coffee shop, living room, classroom, office, newsroom, park, bedroom.
- Production templates: all 16 P1 templates; apply with any cast, save a scene as a template, replace cast with
  camera reframing; server, CLI and Studio (tools/test/m3-templates.test.ts AC-22 path, Studio e2e).
- Bugs found and fixed: kit parts drew in key order (the wall covered the menu board); `scene.add` created its
  default camera and tracks at apply time, so dry runs and replays got different ids (now reserved when prepared);
  camera framings could look past the edge of the stage (now kept on it).

**Not verified (needs the reference machine or people)**: NFR-06, AC-03, AC-17, AC-24, FR-VWK-02/04, CAT-06 visual
review, a listening review of all synthesised sound (CAT-08), the listening panel, and owner runs of AC-06..08/22/23.

## Session report — 2026-10-22, session 3 (archived)

**Completed (with evidence)**
- Owner decisions recorded and closed: 0007 (accent tokens kept), 0013 (ffmpeg downloaded on first use, M6),
  0019 (additive contract change; imported art used as drawn in both families).
- Direction engine: action channels/postures from manifests drive conflicts (timeline hatching, export blocked);
  blink clips, hold variation, action face/gaze keys; automatic talking/listening clips (packages/core/test/
  perform.test.ts, Studio e2e).
- Locomotion with distance-driven gait (planted feet < 2 px), curved paths, marks, facing and turns; gaze follows
  moving characters; seating on seat anchors (tools/test/m3-acceptance.test.ts AC-08 path, Studio e2e).
- Object interactions (hold windows, hand-over), prop states from events, sound cues as editable SFX clips, and 20
  procedurally synthesised SFX in the content pipeline (AC-07 path, Studio e2e).
- Recipes (18) and shot recipes (6), camera framings (16) and moves (18), automatic coverage; save clips as a recipe
  (packages/core/test/recipes.test.ts, AC-06 path, CLI test, Studio e2e).
- Bugs found and fixed: dragging a clip in the timeline sent invalid clip.move params; opening a copied project
  folder (same id) left the first one attached and broadcasting; posture reverted after a sit-down clip ended;
  a held prop was released at the next clip's start instead of when the next holder grips it.

**Not verified (needs the reference machine or people)** — NFR-06, AC-03, AC-17, AC-24, FR-VWK-02/04, CAT-06 visual
review, listening review of the synthesised SFX (CAT-08), listening panel.

## Session report — 2026-10-22, session 2 (archived)

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
