# Frame — implementation progress
Last updated: 2026-10-22 · Session 1

## Current milestone: M0 — Foundations

## Status by milestone
| Milestone | Status | Exit evidence |
|---|---|---|
| M0 Foundations | In progress | — |
| M1 Vertical slice | Not started | — |
| M2 Builder and assets | Not started | — |
| M3 Direction | Not started | — |
| M4 Agents | Not started | — |
| M5 Catalog completion | Not started | — |
| M6 Hardening | Not started | — |

## Requirement status
Status values: Not started / In progress / Done / Not verified / Blocked. "Done" requires passing evidence (test file or report).
The Notes column starts with the requirement's short title from the SRS.

| ID | Status | Evidence | Notes |
|---|---|---|---|
| FR-ARC-01 | Not started | — | The project files on disk are the source of truth |
| FR-ARC-02 | Not started | — | Every edit is a command with a name, parameters, inverse, and the proj |
| FR-ARC-03 | Not started | — | The server publishes project changes over WebSocket |
| FR-ARC-04 | Not started | — | Optimistic concurrency: a command carries the base revision |
| FR-ARC-05 | Not started | — | Long work (render, import, generation, alignment, thumbnailing) runs a |
| FR-ARC-06 | Not started | — | The engine knows no bundled names: no runtime branch may depend on a s |
| FR-DAT-01 | Not started | — | IDs: assets use catalog-style dotted IDs (`hair |
| FR-DAT-02 | Not started | — | Asset versions are integers |
| FR-DAT-03 | Not started | — | Project time is stored as **integer ticks** at 48 000 ticks per second |
| FR-DAT-04 | Not started | — | Project frame rate is chosen at creation (24, 25, 30 |
| FR-DAT-05 | Not started | — | Every file carries `schemaVersion` |
| FR-DAT-06 | Not started | — | A project folder is self-describing: `locks/` lists every referenced l |
| FR-DAT-07 | Not started | — | Media is content-addressed (SHA-256) |
| FR-DAT-08 | Not started | — | JSON files are written atomically (temp file + rename), pretty-printed |
| FR-DAT-09 | Not started | — | A project may contain multiple **episodes** |
| FR-DAT-10 | Not started | — | Packages are zip archives with a `manifest |
| FR-DAT-11 | Not started | — | Importing a package never overwrites existing assets of the same `id@v |
| FR-DAT-12 | Not started | — | Every format has a published JSON Schema in `@frame/schema` and docume |
| FR-PRJ-01 | Not started | — | Create |
| FR-PRJ-02 | Not started | — | Episodes |
| FR-PRJ-03 | Not started | — | Scenes |
| FR-PRJ-04 | Not started | — | Notes and script |
| FR-PRJ-05 | Not started | — | Project settings |
| FR-PRJ-06 | Not started | — | Browser |
| FR-PRJ-07 | Not started | — | Open folder |
| FR-PER-01 | Not started | — | Autosave |
| FR-PER-02 | Not started | — | Undo/redo |
| FR-PER-03 | Not started | — | Versions (snapshots) |
| FR-PER-04 | Not started | — | Crash recovery |
| FR-PER-05 | Not started | — | External changes |
| FR-PER-06 | Not started | — | Validation |
| FR-PER-07 | Not started | — | Clipboard |
| FR-AST-01 | Not started | — | Library sources |
| FR-AST-02 | Not started | — | Manifests |
| FR-AST-03 | Not started | — | Browser |
| FR-AST-04 | Not started | — | Compatibility |
| FR-AST-05 | Not started | — | Versions |
| FR-AST-06 | Not started | — | Favourites and collections |
| FR-AST-07 | Not started | — | Thumbnails |
| FR-AST-08 | Not started | — | Rig check and asset validator |
| FR-IMP-01 | Not started | — | Imports validate type, size and content before acceptance and report p |
| FR-IMP-02 | Not started | — | Imported assets record provenance (file name, date, user statement of |
| FR-IMP-03 | Not started | — | Rigging assistant |
| FR-IMP-04 | Not started | — | Export assets |
| FR-CHR-01 | Not started | — | Families |
| FR-CHR-02 | Not started | — | Parametric parts |
| FR-CHR-03 | Not started | — | Views |
| FR-CHR-04 | Not started | — | View changes |
| FR-CHR-05 | Not started | — | Rig |
| FR-CHR-06 | Not started | — | Anchors |
| FR-CHR-07 | Not started | — | Layering |
| FR-CHR-08 | Not started | — | Expressions and mouth |
| FR-CHR-09 | Not started | — | Identity vs appearance |
| FR-CHR-10 | Not started | — | Versioning |
| FR-CHR-11 | Not started | — | Inclusive options |
| FR-BLD-01 | Not started | — | Layout |
| FR-BLD-02 | Not started | — | Sections |
| FR-BLD-03 | Not started | — | Live preview |
| FR-BLD-04 | Not started | — | Testing |
| FR-BLD-05 | Not started | — | Randomise and suggest |
| FR-BLD-06 | Not started | — | Save |
| FR-BLD-07 | Not started | — | Looks |
| FR-BLD-08 | Not started | — | Rig check |
| FR-PED-01 | Not started | — | Part editor |
| FR-PED-02 | Not started | — | New part from existing |
| FR-PED-03 | Not started | — | AI drafting |
| FR-PED-04 | Not started | — | Family conversion assist |
| FR-PED-05 | Not started | — | Validation |
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
| FR-CAM-07 | Not started | — | Conflict rules |
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
| FR-SND-01 | Not started | — | Add music, ambience and SFX from Catalog N or imports |
| FR-SND-02 | Not started | — | Gain (dB), pan, fade in/out with curve, mute/solo per clip and track |
| FR-SND-03 | Not started | — | Ducking |
| FR-SND-04 | Not started | — | Sound cues |
| FR-SND-05 | Not started | — | Meters |
| FR-SND-06 | Not started | — | Room tone and silence |
| FR-TXT-01 | Not started | — | Captions are generated from dialogue text and word timings (aligned ta |
| FR-TXT-02 | Not started | — | Word-highlight ("karaoke") and animated-word caption styles use word t |
| FR-TXT-03 | Not started | — | Speech and thought bubbles attach to a character's mouth/head anchor w |
| FR-TXT-04 | Not started | — | Titles, lower thirds, cards, credits and graphics (Catalog O1) with co |
| FR-TXT-05 | Not started | — | World text (signs, screens) renders in scene space and moves with the |
| FR-TXT-06 | Not started | — | Export subtitles as SRT and WebVTT (FR-RND-06) |
| FR-TPL-01 | Not started | — | Catalog P1 templates create complete projects or scenes |
| FR-TPL-02 | Not started | — | Users can save any project or scene as a template (with optional place |
| FR-TPL-03 | Not started | — | "Replace cast" swaps a template's characters with the user's character |
| FR-DLG-01 | Not started | — | Lines are created from the timeline, the Script view, a character's Di |
| FR-DLG-02 | Not started | — | A line has one canonical record (speaker, text, revision, delivery, ch |
| FR-DLG-03 | Not started | — | Editing a line's text increments its revision and marks takes generate |
| FR-DLG-04 | Not started | — | Take states: Missing, Queued, Generating, Ready, Failed, Outdated, Mut |
| FR-DLG-05 | Not started | — | Multiple takes per line are kept |
| FR-DLG-06 | Not started | — | A line's clip length follows the chosen take's measured duration |
| FR-DLG-07 | Not started | — | Overlapping speech between different speakers is allowed and mixed |
| FR-DLG-08 | Not started | — | Pauses and beats: lines may contain explicit pause markers (`[pause 0 |
| FR-VOI-01 | Not started | — | Voice library |
| FR-VOI-02 | Not started | — | Design a voice |
| FR-VOI-03 | Not started | — | Emotional range bank |
| FR-VOI-04 | Not started | — | Clone a voice |
| FR-VOI-05 | Not started | — | Record in browser |
| FR-VOI-06 | Not started | — | Upload |
| FR-VOI-07 | Not started | — | Generate takes |
| FR-VOI-08 | Not started | — | Honest capabilities |
| FR-VOI-09 | Not started | — | Stale results |
| FR-VOI-10 | Not started | — | Versions |
| FR-VOI-11 | Not started | — | Starter voices |
| FR-VOI-12 | Not started | — | Worker status |
| FR-VWK-01 | Not started | — | The Voice Worker is a separate service the owner runs (WSL2/Docker on |
| FR-VWK-02 | Not started | — | Engines |
| FR-VWK-03 | Not started | — | GPU budget |
| FR-VWK-04 | Not started | — | Model sizes |
| FR-VWK-05 | Not started | — | Caching |
| FR-VWK-06 | Not started | — | Exposure |
| FR-VWK-07 | Not started | — | Installation |
| FR-VWK-08 | Not started | — | Licences |
| FR-LIP-01 | Not started | — | Pipeline |
| FR-LIP-02 | Not started | — | Fallback |
| FR-LIP-03 | Not started | — | Composition |
| FR-LIP-04 | Not started | — | Editing |
| FR-LIP-05 | Not started | — | Views |
| FR-LIP-06 | Not started | — | Accuracy |
| FR-RND-01 | Not started | — | One renderer |
| FR-RND-02 | Not started | — | Determinism |
| FR-RND-03 | Not started | — | Preview |
| FR-RND-04 | Not started | — | Export settings |
| FR-RND-05 | Not started | — | Snapshot |
| FR-RND-06 | Not started | — | Outputs |
| FR-RND-07 | Not started | — | Lifecycle |
| FR-RND-08 | Not started | — | Validation before export |
| FR-RND-09 | Not started | — | Quality |
| FR-RND-10 | Not started | — | Batch |
| FR-CLI-01 | Not started | — | A `frame` command provides every Studio capability that does not requi |
| FR-CLI-02 | Not started | — | Global options: `--project <path>`, `--json` (structured output on std |
| FR-CLI-03 | Not started | — | Discoverability: `frame help`, `frame <cmd> --help`, `frame schema <ty |
| FR-CLI-04 | Not started | — | Exit codes: 0 success |
| FR-CLI-05 | Not started | — | Command groups |
| FR-CLI-06 | Not started | — | Every mutating command accepts `--dry-run` and returns the list of res |
| FR-CLI-07 | Not started | — | Output of `--json` commands conforms to published schemas and is stabl |
| FR-AGT-01 | Not started | — | `frame mcp` starts a Model Context Protocol server exposing typed tool |
| FR-AGT-02 | Not started | — | Minimum tools: `describe_capabilities`, `list_projects`, `open_project |
| FR-AGT-03 | Not started | — | Resources: JSON Schemas, the Catalog (IDs, names, groups, capabilities |
| FR-AGT-04 | Not started | — | Safety: agents cannot delete projects or voice assets, clone voices, o |
| FR-AGT-05 | Not started | — | Agent sessions appear in the Studio's activity log with the commands a |
| FR-ONB-01 | Not started | — | First run: choose theme, check the voice worker connection (or skip), |
| FR-ONB-02 | Not started | — | Contextual help: every panel has a help link |
| FR-ONB-03 | Not started | — | Command palette (Ctrl/⌘ K) searches commands, assets, layers, scenes, |
| FR-SET-01 | Not started | — | Settings: theme (Dark, Light, System), UI density (Comfortable, Compac |
| API-01 | Not started | — | Requests carry an idempotency key |
| API-02 | Not started | — | Frame stores all generated audio as project media immediately after do |
| API-03 | Not started | — | The capability report is authoritative for UI controls (FR-VOI-08) |
| API-04 | Not started | — | A **fixture worker** implementing the same API with deterministic cann |
| CAT-01 | Not started | — | Completeness |
| CAT-02 | Not started | — | Families and views |
| CAT-03 | Not started | — | Rig contract |
| CAT-04 | Not started | — | Manifests and previews |
| CAT-05 | Not started | — | Licensing and provenance |
| CAT-06 | Not started | — | Quality bar |
| CAT-07 | Not started | — | Content pipeline |
| CAT-08 | Not started | — | Sound assets |
| CAT-09 | Not started | — | Starter voices |
| CAT-10 | Not started | — | Coverage report |
| UI-01 | Not started | — | The Studio implements the shell, modes, rail, panels, canvas, timeline |
| UI-02 | Not started | — | The Studio workspace and Character builder match the reference screens |
| UI-03 | Not started | — | Every screen listed in 02 §7 |
| UI-04 | Not started | — | Organisation patterns: trees, collapsible sections, lists and search b |
| UI-05 | Not started | — | Selection, undo, autosave, keyboard, drag-and-drop and context-menu ru |
| UI-06 | Not started | — | Every visible control works or states its prerequisite |
| UI-07 | Not started | — | Visual regression tests cover every component state and both reference |
| NFR-01 | Not started | — | Responsiveness |
| NFR-02 | Not started | — | Preview performance |
| NFR-03 | Not started | — | Determinism |
| NFR-04 | Not started | — | A/V sync |
| NFR-05 | Not started | — | Export speed |
| NFR-06 | Not started | — | Voice speed |
| NFR-07 | Not started | — | Capacity |
| NFR-08 | Not started | — | Reliability |
| NFR-09 | Not started | — | Security |
| NFR-10 | Not started | — | Privacy |
| NFR-11 | Not started | — | Testability |
| NFR-12 | Not started | — | Accessibility |
| NFR-13 | Not started | — | Maintainability |
| NFR-14 | Not started | — | Compatibility |
| NFR-15 | Not started | — | Portability |
| NFR-16 | Not started | — | Internationalisation-ready |
| NFR-17 | Not started | — | Licensing |
| NFR-18 | Not started | — | Transparency |
| AC-01 | Not started | — | Template to video |
| AC-02 | Not started | — | Build a character in both families |
| AC-03 | Not started | — | Design a voice and range bank |
| AC-04 | Not started | — | Record and upload |
| AC-05 | Not started | — | Clone with consent |
| AC-06 | Not started | — | Scene from scratch |
| AC-07 | Not started | — | Interactive props |
| AC-08 | Not started | — | Locomotion and gaze |
| AC-09 | Not started | — | Lip-sync accuracy |
| AC-10 | Not started | — | Conflicts and validation |
| AC-11 | Not started | — | Versions and reuse |
| AC-12 | Not started | — | Import and rigging assistant |
| AC-13 | Not started | — | Agent production |
| AC-14 | Not started | — | Performance |
| AC-15 | Not started | — | Determinism and sync |
| AC-16 | Not started | — | Reliability |
| AC-17 | Not started | — | Worker resilience |
| AC-18 | Not started | — | Design System compliance |
| AC-19 | Not started | — | Catalog coverage |
| AC-20 | Not started | — | Packages and portability |
| AC-21 | Not started | — | Security and privacy |
| AC-22 | Not started | — | Templates |
| AC-23 | Not started | — | Captions and text |
| AC-24 | Not started | — | Fresh setup |

## Catalog coverage
Catalog source not yet created. 0 / 1254 items complete (CAT-10 report not yet generated).

## Next actions (ordered)
1. Scaffold the pnpm monorepo (SRS §2.2) with strict TypeScript, Vitest, lint and CI.
2. Machine-readable catalog source (`catalog/*.yaml`) and generator for document 03 (CAT-07).
3. Design tokens package and UI kit with stories in both themes.
4. Schemas, core command/undo engine, project store, CLI skeleton.
5. Golden-frame harness with the CanvasKit renderer.

## Open decisions and blockers
- No GPU in the cloud implementation container: live Voice Worker checks (NFR-06, AC-03, AC-17, AC-24) will be **Not verified — requires reference machine**.
