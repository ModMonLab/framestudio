# Frame — Software Requirements Specification

| | |
|---|---|
| Document | 04 of 4 — Software Requirements Specification (SRS) |
| Version | 1.0 |
| Date | 22 October 2026 |
| Status | Implementation contract for version 1 |
| Audience | Product owner, AI implementation agents, developers, artists, testers |
| Companion documents | 01 Vision and Philosophy · 02 Design System · 03 Catalog |

---

## 0 How to use this document

### 0.1 Purpose

This SRS defines **what Frame version 1 must do and how each requirement is verified**. It is written so that an implementation agent can build the product from it without undocumented decisions, and so that a reviewer can tell from evidence whether each requirement is met.

### 0.2 The document set and precedence

| Document | Owns | Precedence when in conflict |
|---|---|---|
| 01 Vision and Philosophy | Why; principles P1–P14; art direction | Decides intent and trade-offs |
| 02 Design System | How the UI looks and behaves; tokens; components; reference screens | Binding for all UI |
| 03 Catalog | Every v1 building block and its ID | Binding list of content |
| 04 SRS (this) | Systems, behaviour, data, interfaces, quality, acceptance | Binding for behaviour |

If the SRS and the Design System disagree about appearance, the Design System wins; about behaviour or data, the SRS wins. If anything conflicts with a Vision principle, raise it as an issue rather than silently choosing.

### 0.3 Normative language

- **shall** — mandatory for version 1.
- **should** — the default; deviation requires a recorded reason in the decision log.
- **may** — optional.
- **Future** — direction only; excluded from version 1 acceptance.

Every requirement has a stable ID (`FR-<AREA>-<NN>` functional, `NFR-<NN>` quality, `CAT-<NN>` catalog, `UI-<NN>` interface, `API-…` interface contracts, `AC-<NN>` acceptance scenarios). IDs are never reused.

### 0.4 Scope decisions already made

These were decided with the product owner and are not open questions:

| # | Decision |
|---|---|
| D-01 | Frame is **2D**. The earlier 3D prototype is scrapped; Frame is built in a **new repository**. |
| D-02 | Two **style families** at launch: **Flat** and **Illustrated** (semi-realistic), sharing one rig and part contract. |
| D-03 | Characters are created in a **parametric character builder** (sliders, presets, part editing) and can be **imported and exported**. |
| D-04 | Four **views** per character: Front, Three-quarter, Side, Back; left/right by mirroring. |
| D-05 | **Everything in the Catalog is required in version 1.** Delivery is ordered by milestones (§15) but no catalog item is optional. |
| D-06 | Speech is **self-hosted**. The first engine is **Qwen3-TTS** (VoiceDesign and Base/clone models). No external speech provider is used by default. |
| D-07 | Voice lines can be **recorded in the browser, uploaded, or generated** through Frame's own documented **Voice API**, served by a separate **Voice Worker** the owner hosts and may expose on their network. |
| D-08 | A reusable **voice asset library** with design, cloning (with consent), auditions and an **emotional range bank**. |
| D-09 | **Lip sync** uses forced alignment to phonemes mapped to a standard 9-shape mouth set, with an amplitude fallback, editable on the timeline. |
| D-10 | A first-class **CLI** and an **MCP agent server** operate on the same engine and project files as the Studio. |
| D-11 | Runtime: **local server with a browser UI**; projects are **folders on disk**. English UI and English speech first. |
| D-12 | UI follows the **Design System**: neutral professional chrome, dark and light themes, trees, collapsible sections, lists and search. |

### 0.5 Reference environment

| Item | Reference |
|---|---|
| Owner's machine | Windows 11 laptop, NVIDIA GeForce RTX 5060 Laptop GPU with **8 GB dedicated VRAM** (shared memory is not counted), ≥ 16 GB system RAM |
| Voice Worker runtime | WSL2 Ubuntu or Docker Desktop with NVIDIA GPU support; Python 3.11+; CUDA and PyTorch builds that support RTX 50-series (Blackwell) GPUs, pinned in the worker's lockfile |
| Studio browsers | Current Chrome and Edge (Chromium ≥ 130) on desktop; Firefox and Safari current versions should work for editing (see NFR-14) |
| Server runtime | Node.js 22 LTS |
| Displays | Reference 1440 × 900; minimum 1280 × 720; usable at 125 % zoom |

---

## 1 Product overview

Frame is a 2D animation directing studio (Vision §2). Creators build reusable characters and voices, stage scenes from location kits and props, direct performances with expressions, actions, gaze, dialogue and recipes, choose shots and camera moves, add effects, sound and captions, and export finished video. The same capabilities are available headlessly through the CLI and the agent interface.

### 1.1 Primary journeys (all shall work end to end)

1. **Template to video.** Open the two-person podcast template → change a character's look → re-voice a line with a designed voice → adjust a cut → export MP4 with captions.
2. **Build a character.** Create a character in the builder across both families and four views → give it a designed voice with an emotional range bank → save a version → export a `.framechar` package.
3. **Scene from scratch.** New project → choose a location kit → place cast and props → write dialogue → generate takes → direct with recipes, expressions and gaze → shots and moves → effects and sound → export.
4. **Series continuity.** Reopen a series → duplicate an episode → update one character to a new version in one scene only → render.
5. **Agent production.** An agent, through the CLI or MCP, creates a project from a brief, assembles scenes, generates voice takes, validates, renders a preview, and leaves an editable project that a person refines in the Studio.
6. **Import.** Import an image, a layered PSD/SVG character drawing, a `.framechar`, a `.frameasset` pack, audio, and a project package; prepare an imported drawing with the rigging assistant.

### 1.2 Out of scope for version 1

Frame-by-frame drawing tools; 3D; generative video; multi-user real-time collaboration; cloud hosting and accounts; a public marketplace; user-installed code plugins; non-English UI and speech (architecture shall allow them, NFR-16).

---

## 2 Architecture

### 2.1 Components

```
┌──────────── Browser ────────────┐        ┌──────── Owner's machine ─────────────────────────────┐
│  Studio (React UI)              │  HTTP  │  Frame Server (Node)                                  │
│   · @frame/ui, design tokens     │◄──────►│   · Project store (folders on disk)                   │
│   · Canvas preview (renderer)    │  WS    │   · Engine (@frame/core, @frame/render)               │
│   · Timeline, builder, library   │        │   · Job queue (render, import, voice, alignment)      │
└──────────────────────────────────┘        │   · Asset library (bundled + user + imported)         │
                                            │   · REST + WebSocket API (same contract as CLI)       │
 ┌───────────── CLI (`frame`) ─────────┐    │   · Export: renderer + ffmpeg                         │
 │  local mode (engine in process) or   │───►│                                                       │
 │  server mode (talks to Frame Server) │    └──────────────┬────────────────────────────────────────┘
 └──────────────────────────────────────┘                   │ HTTPS + token (Voice API)
 ┌──── MCP server (`frame mcp`) ───────┐                   ▼
 │  typed tools over the same engine    │    ┌──────── Voice Worker (Python, GPU) ───────────────────┐
 └──────────────────────────────────────┘    │  · Engines: Qwen3-TTS VoiceDesign / Base (clone)      │
                                             │  · Aligner: WhisperX / Montreal Forced Aligner        │
                                             │  · Transcriber: Whisper (for unscripted audio)        │
                                             │  · Job queue, model manager (one GPU model at a time) │
                                             └───────────────────────────────────────────────────────┘
```

### 2.2 Packages (monorepo)

| Package | Responsibility |
|---|---|
| `@frame/schema` | JSON Schemas and TypeScript types for every file format and API payload; validators; migrations. |
| `@frame/core` | Pure, deterministic engine: project model, commands (edits), undo/redo, validation, timeline evaluation, performance composition, camera evaluation, audio scheduling, lip-sync evaluation. No DOM, no I/O. |
| `@frame/rig` | Character assembly: families, parts, parametric shapes, views, rig solving, attachments, expressions, mouth shapes, deformation. Pure. |
| `@frame/render` | Scene graph to pixels. Same code in browser and Node. |
| `@frame/assets` | Asset manifests, library index, validators (rig check, asset validator), thumbnails, search index. |
| `@frame/io` | Project store, packages (`.frameproj`, `.framechar`, `.frameasset`, `.framevoice`), importers (image, SVG, PSD, audio), exporters. |
| `@frame/voice-client` | Typed Voice API client, job tracking, take management. |
| `@frame/server` | Local HTTP/WS server, job queue, file watching, serving the Studio. |
| `@frame/cli` | `frame` command. |
| `@frame/mcp` | MCP server exposing agent tools. |
| `@frame/design-tokens`, `@frame/ui` | Design System implementation (Design System §11). |
| `apps/studio` | The browser application. |
| `services/voice-worker` | Python Voice Worker. |
| `catalog/` | Machine-readable catalog source (generates document 03). |
| `content/` | Bundled assets: parts, props, kits, sounds, voices, templates. |

### 2.3 Technology decisions

The following are **recommended** and should be used unless a recorded decision replaces them. Outcomes they enable are mandatory.

| Concern | Recommendation | Mandatory outcome |
|---|---|---|
| Language | TypeScript (strict) for all Node and browser code; Python for the Voice Worker | Typed contracts shared by UI, server, CLI and MCP |
| UI | React 19, Vite | Design System compliance |
| 2D rendering | **Skia via CanvasKit (WebAssembly)** in both browser and Node | Identical frames in preview, CLI and export (NFR-03) |
| Vector parts | SVG-path based part geometry with named control points, compiled to Skia paths | Parametric parts at any resolution |
| Deformation | Bone-based rigid transforms plus optional mesh/bend deformation for limbs and fabric | Clean bends without tearing in both families |
| Audio | Web Audio in the Studio; offline mixing in Node with the same gain automation | Matching preview and export mix |
| Encoding | **ffmpeg** (bundled static build) for MP4 (H.264/AAC), WebM (VP9/Opus), ProRes/alpha, GIF | Exports play in standard players |
| Storage | Plain files: JSON + media in project folders; SQLite only for derived indexes (search, thumbnails cache) | Projects are portable, diffable and owned by the user |
| Server | Fastify or Express, WebSockets for live updates | Studio and CLI share one API |
| Voice Worker | FastAPI, Qwen3-TTS (`qwen-tts`), WhisperX, Montreal Forced Aligner, ffmpeg | Self-hosted, GPU-accelerated, documented API |
| Tests | Vitest (unit), Playwright (E2E, visual), pytest (worker), golden-frame tests (renderer) | Requirements traceable to tests |

Every external dependency's capabilities and licence shall be verified against its official documentation at implementation time and recorded in `docs/decisions/`. A successful install is not evidence that a capability works.

### 2.4 Process and data flow rules

- **FR-ARC-01** The project files on disk are the source of truth. The Studio, CLI and MCP read and write them only through `@frame/core` commands executed by the server (or the CLI's local mode with the same engine).
- **FR-ARC-02** Every edit is a command with a name, parameters, inverse, and the project revision it applies to. Commands are serialisable so agents can submit batches and so history can be inspected.
- **FR-ARC-03** The server publishes project changes over WebSocket; open Studio sessions update live when the CLI or an agent edits the same project.
- **FR-ARC-04** Optimistic concurrency: a command carries the base revision; if the project changed since, the server rejects it with `REVISION_CONFLICT` unless the command is declared commutative (e.g., independent clip edits), in which case it rebases.
- **FR-ARC-05** Long work (render, import, generation, alignment, thumbnailing) runs as jobs with id, state (`queued`, `running`, `succeeded`, `failed`, `cancelled`), progress, logs and cancellation.
- **FR-ARC-06** The engine knows no bundled names: no runtime branch may depend on a specific character, set, line, or asset ID (P14). A test scans runtime packages for catalog names.

---

## 3 Data model and file formats

### 3.1 Identifiers, versions and time

- **FR-DAT-01** IDs: assets use catalog-style dotted IDs (`hair.box-braids`, user assets `user.<uuid>`); project-local objects use prefixed random IDs (`scn_…`, `ins_…`, `clp_…`, `tak_…`). IDs are immutable.
- **FR-DAT-02** Asset versions are integers; a reference is `id@version`. A published version is immutable (P5).
- **FR-DAT-03** Project time is stored as **integer ticks** at 48 000 ticks per second (divisible by 24, 25, 30 and audio-friendly); display and editing snap to the project frame rate. Clip intervals are half-open `[start, end)`.
- **FR-DAT-04** Project frame rate is chosen at creation (24, 25, 30; default 24) and can be changed later by an explicit command that re-snaps clip boundaries and reports any clip whose boundaries moved.
- **FR-DAT-05** Every file carries `schemaVersion`. Loading an older schema runs migrations and writes the migrated file only after the user (or CLI flag) confirms; loading a newer schema than supported is refused without modifying the file.

### 3.2 Project folder

```
MyShow.frame/                      (a project folder; also zipped as .frameproj)
  project.json                     id, name, description, settings, style family, frame rate, output presets, cast list
  episodes/
    ep01/episode.json              name, order of scenes, notes
    ep01/scenes/scn_x1.json        stage, instances, cameras, tracks, clips, notes
  cast/                            character instances' chosen versions and looks used by this project
  assets/                          project-local assets (imports, custom parts, generated media)
    media/sha256-<hash>.<ext>      content-addressed media (audio, images)
    takes/tak_<id>.json            take metadata (+ media reference)
  locks/                           pinned versions of every library asset referenced (id@version → hash)
  history/                         command log (optional, for agents and audits)
  renders/                         exported files and render reports (may be outside project by setting)
```

- **FR-DAT-06** A project folder is self-describing: `locks/` lists every referenced library asset with version and content hash, so a project can be packaged with exactly what it needs.
- **FR-DAT-07** Media is content-addressed (SHA-256); identical media is stored once; references include hash, MIME type, measured duration (audio), dimensions (images).
- **FR-DAT-08** JSON files are written atomically (temp file + rename), pretty-printed with stable key order so they diff cleanly in git.
- **FR-DAT-09** A project may contain multiple **episodes**; an episode contains ordered **scenes**; global time is per episode.

### 3.3 Scene model

| Entity | Key fields |
|---|---|
| Scene | id, name, notes, duration, location kit ref, stage size and units, depth planes, ground lines, character marks, instances, cameras, tracks, default camera |
| Instance | id, kind (`character`, `prop`, `set-piece`, `effect`, `text`, `group`), asset ref `id@version`, name, transform (x, y, scale, rotation, flip), depth plane, parallax factor, layer order, parent group, visibility, lock, kind-specific state (look, view, base pose, prop state…) |
| Camera | id, name, framing rect (centre, width at stage scale), rotation, lens preset (affects parallax strength), safe-area policy |
| Track | id, kind (`shot`, `camera-move`, `dialogue`, `lipsync`, `acting`, `face`, `effect`, `music`, `ambience`, `sfx`, `text`), owner (scene, instance or group), name, mute, solo, lock, gain |
| Clip | id, track, start, end, asset ref (action, expression, effect, sound…), parameters, blend in/out, enabled, source (manual, recipe:<id>, agent:<session>), recipe group id |

### 3.4 Character model

| Entity | Key fields |
|---|---|
| Character | id, version, name, role, notes, life stage, family support, appearance (parameter values + part choices), looks[], default look, voice ref, performance defaults, signature actions, provenance |
| Part | id, version, category, family, views{front, three, side, back}: layered vector geometry with named control points, parameter bindings, anchors, mouth-shape and eye/brow state variants where applicable, layering rules |
| Rig | id `rig.biped@1`: joints, named controls, limits, rest pose per view, view-switch rules, anchors (head, eyes, mouth, ears, neck, hands L/R grip, wrists, back, waist, feet, seat, gaze origin) |
| Look | id, name, garments[], accessories[], colours, patterns |
| Expression | id, version, control targets (eye state, brow state, mouth curvature, cheek, overlays), intensity curve, default transition |
| Action | id, version, channels driven, supported views/postures/rigs, loop, default duration, parameters, keyframed control curves (style-independent), events (e.g., `contact` for sound cues), blend rules |

### 3.5 Voice and take model

| Entity | Key fields |
|---|---|
| Voice asset | id, version, name, description (design prompt), creation method (`design`, `clone`, `preset`, `recorded`), consent record (for clones), reference clips (audio + transcript) including emotional range bank entries keyed by emotion, engine data per engine/version (opaque, cache), audition samples, language, licence/provenance |
| Line (dialogue clip) | id, speaker instance, text, revision, delivery (preset ref or settings), chosen take, caption overrides |
| Take | id, line id, line revision, source (`generated`, `recorded`, `uploaded`), voice ref, engine + model version, seed, settings, media ref, measured duration, alignment ref, status, created at |
| Alignment | take id, words[{text, start, end}], phonemes[{symbol, start, end}], method (`forced`, `transcribed+forced`, `amplitude`), confidence |
| Mouth track | derived from alignment + mapping table; user edits stored as overrides |

### 3.6 Packages

| Package | Extension | Contents |
|---|---|---|
| Project | `.frameproj` | Zip of a project folder plus every referenced non-bundled asset version; bundled assets referenced by `id@version` and hash |
| Character | `.framechar` | Character definition (all versions or a selected version), custom parts it uses, looks, optional voice asset |
| Asset pack | `.frameasset` | One or more assets (parts, props, kits, actions, expressions, effects, sounds, templates) with manifests and previews |
| Voice | `.framevoice` | Voice asset with reference clips, range bank, transcripts, consent record; engine data optional |

- **FR-DAT-10** Packages are zip archives with a `manifest.json` (format, formatVersion, contents, hashes, app version). Readers accept only declared paths, reject path traversal, verify hashes, and never execute content.
- **FR-DAT-11** Importing a package never overwrites existing assets of the same `id@version` with different content; conflicts produce a new ID or are refused with a report.
- **FR-DAT-12** Every format has a published JSON Schema in `@frame/schema` and documentation in `docs/formats/`.

---

## 4 Functional requirements

### 4.1 Projects, episodes and scenes (PRJ)

- **FR-PRJ-01 Create.** Create a project from: empty, a production template (Catalog P1), or a project package. Choose name, style family, frame rate, default output preset and location on disk.
- **FR-PRJ-02 Episodes.** Add, rename, reorder, duplicate and delete episodes. Duplicating an episode copies scenes with new IDs and keeps references to the same character versions and assets.
- **FR-PRJ-03 Scenes.** Add, rename, reorder (drag in tree), duplicate, delete (undoable) and set duration. Shortening a scene shows affected clips before applying and never truncates content silently.
- **FR-PRJ-04 Notes and script.** Project description, episode notes and scene notes (rich text: headings, lists, bold, italic). A **Script view** lists every line in scene order with speaker, text, delivery and take status, editable in place, and exports to PDF/Fountain-compatible text.
- **FR-PRJ-05 Project settings.** Name, style family (switching re-renders all artwork; disallowed if any asset lacks the target family, with a list), frame rate (FR-DAT-04), default output, caption defaults, voice worker endpoint override, storage location of renders.
- **FR-PRJ-06 Browser.** Home screen lists recent projects (thumbnail, name, last opened, episodes count), pinned projects, templates; search and sort; open, reveal in folder, duplicate, export package, delete (move to OS trash).
- **FR-PRJ-07 Open folder.** Any valid project folder on disk can be opened; invalid ones produce a validation report.

### 4.2 Editing, history and persistence (PER)

- **FR-PER-01 Autosave.** Every committed command is written to disk within 1 s (debounced); the UI save badge shows Saved / Saving / Unsaved / Not saved (with Retry and the error).
- **FR-PER-02 Undo/redo.** Unlimited within a session (minimum 200 steps) per project; drags, scrubs and text-field edits are single steps; undo labels describe the action. Undo never re-triggers voice generation or deletes stored takes.
- **FR-PER-03 Versions (snapshots).** "Save version" creates a named, timestamped snapshot of the project; versions can be listed, compared (summary of changed scenes, clips, assets), restored or opened as a copy.
- **FR-PER-04 Crash recovery.** If the server or browser stops unexpectedly, reopening offers the last committed state; no committed command is lost.
- **FR-PER-05 External changes.** Changes made to project files by other processes (git pull, another tool) are detected; the Studio reloads affected scenes and reports conflicts with unsaved local work instead of overwriting.
- **FR-PER-06 Validation.** Loading validates schemas, references, locks/hashes and timing; problems appear in a **Problems panel** grouped by severity with "show" and "fix" actions (e.g., relink missing media).
- **FR-PER-07 Clipboard.** Copy/paste instances, clips and recipe groups within and across scenes and projects (assets are copied or referenced by version as needed).

### 4.3 Asset system and library (AST)

- **FR-AST-01 Library sources.** Bundled (read-only, versioned with the app), user library (per user profile folder), project-local, and imported packs. Each asset shows its source.
- **FR-AST-02 Manifests.** Every asset has a manifest per the Catalog item schema; the library index is built from manifests; invalid manifests are reported and excluded.
- **FR-AST-03 Browser.** The library browser (Design System §5.3) supports search across names, tags, synonyms and values; category grouping with counts; filters for family, view support, compatibility with selection, source, tags; list/grid; previews in the active family; drag to canvas, character or timeline.
- **FR-AST-04 Compatibility.** For a selection, each asset reports compatible / incompatible with reason (missing view, rig capability, posture, family). Incompatible assets cannot be applied.
- **FR-AST-05 Versions.** Asset details show versions, changes, and where each version is used across open projects; "update usages" is explicit and undoable per instance.
- **FR-AST-06 Favourites and collections.** Users can favourite assets and create named collections.
- **FR-AST-07 Thumbnails.** Generated by the renderer for both families and cached; regenerated when an asset version changes.
- **FR-AST-08 Rig check and asset validator.** Every asset (bundled, created or imported) passes automatic validation before use: schema, anchors, views, layering, parameter ranges, render without error in all views and families, action compatibility matrix. Results are shown in the asset's details and the builder footer.

### 4.4 Import and export of content (IMP)

| Import type | Behaviour |
|---|---|
| Image (PNG, JPG, WebP, SVG) | Placed as a static object, background or texture; transformable, layered, animatable by effects and camera |
| Layered artwork (PSD with groups, layered SVG) | Opens the **rigging assistant** (FR-IMP-03) to become a character, prop with states, or set |
| `.framechar` | Adds character versions, custom parts, looks and voice |
| `.frameasset` | Adds assets to user library or project |
| `.framevoice` | Adds a voice asset (consent record required for clones) |
| Audio (WAV, MP3, FLAC, OGG, M4A) | Takes, music, ambience or SFX; decoded and measured; ≤ 500 MB and ≤ 60 min per file |
| Project package | Opens as a new project or copy |

- **FR-IMP-01** Imports validate type, size and content before acceptance and report precise errors.
- **FR-IMP-02** Imported assets record provenance (file name, date, user statement of rights) and licence.
- **FR-IMP-03 Rigging assistant.** For layered artwork: map layers to rig parts by name convention (`head`, `eye_L`, `mouth_A`…) with auto-suggestions; set pivots and anchors; supply missing mouth shapes and hand poses from the family library or mark them missing; preview with test actions; run the rig check; save as a character or prop. Artwork lacking required views is usable only in the views provided, and the editor marks the gaps (P11).
- **FR-IMP-04 Export assets.** Any character, look, voice, prop, kit, action, expression, effect, recipe or template can be exported as a package with its dependencies.

### 4.5 Character system (CHR)

- **FR-CHR-01 Families.** Each character exists in both families (D-02). Switching family changes only artwork; all parameters, looks and performances carry over.
- **FR-CHR-02 Parametric parts.** Part geometry is driven by named parameters (Catalog A3b, A4b, A9b) with ranges; parameters are shared across views so a change is consistent in front, three-quarter, side and back.
- **FR-CHR-03 Views.** Front, three-quarter, side and back are drawn per part; left/right by mirroring with asymmetric details (parting, scars, accessories) mirrored correctly or kept, as the part declares.
- **FR-CHR-04 View changes.** A **turn** action blends between adjacent views using defined transition drawings or a quick blur-swap; arbitrary jumps (front→back) pass through intermediate views.
- **FR-CHR-05 Rig.** All characters use `rig.biped@1` (and the seated/wheelchair variants). Named controls include: root, hips, spine, chest, neck, head (yaw/pitch/tilt), eyes (aim, lids), brows L/R, mouth (shape, curvature, width), jaw, shoulders, upper/lower arms, hands (pose), legs, feet. Limits preserve appearance.
- **FR-CHR-06 Anchors.** Head, face, eyes, mouth, ears L/R, neck, chest, back, waist, wrists L/R, grip L/R, feet, seat, gaze origin; props and accessories attach to anchors and follow animation.
- **FR-CHR-07 Layering.** Parts declare draw order per view (e.g., back hair behind head, fringe over brows, near arm over torso in three-quarter); layering is validated.
- **FR-CHR-08 Expressions and mouth.** Faces composite expression controls with the current mouth shape (FR-LIP) so expression survives speech (P12).
- **FR-CHR-09 Identity vs appearance.** A character has one identity and many looks; scenes reference character `id@version` + look id (P4).
- **FR-CHR-10 Versioning.** Saving creates a new immutable version; instances keep their version until explicitly updated (single instance, all in scene, all in project — each undoable).
- **FR-CHR-11 Inclusive options.** All Catalog A20 options are supported by rig variants with appropriate actions (e.g., wheelchair users have roll, push, turn and seated-gesture support).

### 4.6 Character builder (BLD)

- **FR-BLD-01 Layout.** Matches Design System §7.2: parts tree with search (names and current values), live canvas with view, framing and turnaround sheet, bottom performance test bar, properties panel with collapsible sections.
- **FR-BLD-02 Sections.** Identity; Body (build, torso, arms and hands, legs and feet); Head and face (shape, eyes, brows, nose, mouth, ears, skin and details, makeup); Hair (style, fringe, colour, facial hair); Wardrobe (looks, tops, outerwear, bottoms, dresses, footwear, patterns); Accessories; Voice (asset, emotional range, auditions); Performance defaults (idle energy, gesture size, expression strength, signature actions).
- **FR-BLD-03 Live preview.** Every change updates the preview within one frame (NFR-01) in the selected family and view; "compare" shows before/after; the turnaround sheet shows all four views.
- **FR-BLD-04 Testing.** Expression test (any Catalog E1 expression), gesture test (any action compatible with standing), and lip-sync test (plays a sample line through the current mouth set with alignment).
- **FR-BLD-05 Randomise and suggest.** "Randomise" within chosen constraints (life stage, family, palette) and "Describe a character" (natural-language prompt → suggested parameter values via a local or configured model, always editable; if no model is configured, the control explains its prerequisite).
- **FR-BLD-06 Save.** Save version / Save as new character; unsaved changes are protected; export `.framechar`.
- **FR-BLD-07 Looks.** Create, rename, duplicate and delete looks; edit garments, accessories, colours and patterns per look; set default look.
- **FR-BLD-08 Rig check.** Footer shows the live rig check (views, families, mouth shapes, action compatibility) with drill-down to problems.

### 4.7 Part editor and AI-assisted creation (PED)

- **FR-PED-01 Part editor.** Edit a part's vector geometry per view: control points, curves, fills, shading layers, line weights (family rules), anchors and pivot points; parameter bindings (which control points each slider moves); onion-skin of other views; mirror tools.
- **FR-PED-02 New part from existing.** Duplicate any part (e.g., a hairstyle) as a starting point; save as user asset with provenance.
- **FR-PED-03 AI drafting.** "Draft from description" produces a candidate part (SVG geometry per view following the part schema) via a configured local or remote model; the candidate must pass the asset validator; the user reviews per view before saving; provenance records "AI-assisted, human-reviewed".
- **FR-PED-04 Family conversion assist.** Given a part in one family, generate a draft in the other family for review.
- **FR-PED-05 Validation.** Saving runs the rig check; failures block saving as a usable part but allow saving as a draft.

### 4.8 Wardrobe and accessories (WRD)

- **FR-WRD-01** Garments and accessories from Catalog B and C attach to the rig with layering and follow all actions, postures and views.
- **FR-WRD-02** Colours (palette + custom), patterns (Catalog B6) with scale/rotation/colours, and per-garment options (sleeves rolled, hood up, jacket open).
- **FR-WRD-03** A scene instance chooses a look; a clip may switch looks at a time (costume change) with a transition effect.
- **FR-WRD-04** Accessories may also be props (e.g., glasses removed and held): an accessory can detach to a hand anchor through an action.

### 4.9 Expressions and face (EXP)

- **FR-EXP-01** Apply any Catalog E1 expression as a timed clip with intensity, blend in/out, and optional hold variation (micro-movement).
- **FR-EXP-02** Fine-tune per clip: eye state, brow states (L/R), mouth curvature, cheek raise, overlays (Catalog E2) — without editing the library preset.
- **FR-EXP-03** Blinks are automatic (natural interval, suppressed during closed-eye expressions) and can be added or removed as clips.
- **FR-EXP-04** Expressions blend: consecutive clips cross-fade over their blend times; overlapping expression clips on one character are a conflict (§4.13 rules).
- **FR-EXP-05** Base expression per instance (resting face) applies when no clip is active.

### 4.10 Performance and actions (ACT)

- **FR-ACT-01** Apply any Catalog F1 action as a clip to a compatible character; parameters (target, hand, intensity, speed, path) editable in the Acting tab and contextual toolbar.
- **FR-ACT-02 Channels.** Actions declare channels (root, posture, torso, head, arms L/R, hands L/R, face, gaze). Compatible channels combine; overlapping clips on the same channel are conflicts unless the action declares additive blending (e.g., nod over talking).
- **FR-ACT-03 Postures.** Standing, seated, crouched, kneeling, lying; actions declare allowed postures; posture changes use transition actions (sit down, stand up).
- **FR-ACT-04 Locomotion.** Walk, run and other locomotion follow paths drawn on the stage (straight, curved, waypoints) with speed, foot contacts aligned to ground lines and automatic turn to face direction; after locomotion the character keeps the end position and facing until the next movement.
- **FR-ACT-05 Gaze.** Look at a character, object, camera (audience) or point; head and eyes share the motion within limits; gaze follows moving targets.
- **FR-ACT-06 Object interactions.** Actions that use props (drink, type, hand over) bind to a prop's anchors and states; the prop attaches to the hand anchor during the action and returns or stays as the action declares.
- **FR-ACT-07 Idle and listening behaviour.** Characters without active clips perform their idle (performance defaults) and listening behaviour automatically (blinks, breathing, subtle weight shifts, glancing at the speaker) — generated as visible, editable "auto" clips that can be baked or disabled per character.
- **FR-ACT-08 Talking gestures.** Optional automatic talking gestures during a character's lines, based on performance defaults and line energy, generated as editable clips.
- **FR-ACT-09 Motion principles.** Actions may apply anticipation, overshoot, squash and stretch (Catalog K1) per clip with an intensity control.
- **FR-ACT-10 Pose editing.** Advanced: a pose editor allows adjusting named controls at a keyframe on an action clip (stored as an override); hidden by default (P1).

### 4.11 Performance recipes (RCP)

- **FR-RCP-01** Apply any Catalog G1 recipe to one or more characters; multi-character recipes ask for role assignment (e.g., speaker, listener).
- **FR-RCP-02** Applying a recipe expands into ordinary clips on the right tracks (acting, face, gaze, camera, effects, sound) grouped with a recipe group id; the group can be moved as one, ungrouped, or edited clip by clip (P6).
- **FR-RCP-03** Recipes anchored to a line align to that line's words (e.g., "glance back on the last word").
- **FR-RCP-04** Users can save a selection of clips as a new recipe (with role placeholders) into their library.

### 4.12 Props, environments and stage (PRP / ENV / STG)

- **FR-PRP-01** Props from Catalog H1 support transform, depth, layering, states (switched by clips), animation loops, sound cues tied to states/events, and anchors for interaction.
- **FR-PRP-02** Interactive props expose their actions in the Acting tab of characters that can use them.
- **FR-ENV-01** Location kits (Catalog I1) provide layered parts with palettes; ready-made sets (I2) are editable arrangements; users can save their own sets.
- **FR-ENV-02** Kit palettes recolour all kit parts consistently; time-of-day presets combine palette shifts with lighting overlays.
- **FR-STG-01 Stage.** Scenes have a stage with defined units, ground lines (where feet stand), character marks (named standing/seating positions), and depth planes (Catalog I3).
- **FR-STG-02 Depth vs parallax.** Draw order and parallax are independent controls (each instance: depth plane, order within plane, parallax factor).
- **FR-STG-03 Placement.** Direct manipulation with handles, smart guides, snapping (ground lines, marks, anchors, other objects, stage centre), numeric entry, align/distribute, group/ungroup, lock, hide.
- **FR-STG-04 Seating.** Dropping a character on a seat anchor seats them correctly for the current view; seat anchors declare facing.
- **FR-STG-05 Selection sync.** Canvas, Layers tree and timeline selections are synchronised (Design System §8).

### 4.13 Cameras, shots and timeline evaluation (CAM)

- **FR-CAM-01 Cameras.** Add, name, duplicate, delete cameras; framing presets (Catalog M1 framings/angles) computed from selected subjects; manual framing by dragging the frame on the stage.
- **FR-CAM-02 Shots.** A shot track per scene; each shot references a camera; uncovered time uses the scene's default camera; shots may not overlap.
- **FR-CAM-03 Moves.** Camera-move clips (pan, tilt, push, pull, truck, follow, reframe, shake, zoom variants) with easing, intensity and target; parallax applies according to depth planes and lens preset.
- **FR-CAM-04 Shot recipes.** Catalog M1 shot recipes create coordinated shots and moves.
- **FR-CAM-05 Auto-coverage.** Optional: generate a shot list from dialogue (speaker close-ups, reactions, wide establishing) as editable shots.
- **FR-CAM-06 Aspect ratios.** Each camera previews all project output aspect ratios with safe areas; the framing adapts per ratio by a declared rule (keep subject centred / keep headroom) and can be overridden per ratio.
- **FR-CAM-07 Conflict rules.** For each character: at most one clip per exclusive channel at a time (posture, root movement, gesture unless additive, expression, gaze); same-speaker dialogue may not overlap; shots may not overlap; clips beyond scene end are flagged. Conflicts are shown at edit time (hatched clip, Problems panel) and block export until resolved.

### 4.14 Effects, atmosphere and transitions (FX)

- **FR-FX-01** Apply Catalog K1 effects as clips attached to screen, stage point, object or character anchor; attached effects follow their anchor.
- **FR-FX-02** Atmosphere (Catalog J1) as scene layers with intensity, colour and timing; weather and particles respect depth planes (rain in front of and behind characters).
- **FR-FX-03** Transitions (Catalog K2) between shots and between scenes with duration and direction.
- **FR-FX-04** Effects and atmosphere render identically in preview and export (NFR-03); particle systems are seeded and deterministic.

### 4.15 Timeline and playback (TML)

- **FR-TML-01 Structure.** Groups: Camera (shots, moves), one group per character (dialogue, lip sync, acting, face, gaze), Props, Effects and atmosphere, Text, Sound (music, ambience, SFX). Groups collapse to summary strips (Design System §6.2).
- **FR-TML-02 Editing.** Select, multi-select, marquee; move (drag, keyboard nudge by frame / second); trim; split at playhead; duplicate; delete; ripple (toggle); snapping to frames, clip edges, playhead, markers, word boundaries; numeric start/duration.
- **FR-TML-03 Media trimming.** Trimming dialogue and audio clips selects source intervals; it never time-stretches unless a "time stretch" option is explicitly used.
- **FR-TML-04 Markers and regions.** Named markers and a loop region.
- **FR-TML-05 Playback.** Play/pause, stop, J/K/L shuttle, frame step, loop, play from selection, scrub with audio; playback crosses scenes in episode mode; audio never continues from a stale position after seek or edit.
- **FR-TML-06 Sync.** One production clock drives visuals, audio, lip sync and captions; live playback maintains A/V offset ≤ 40 ms on the reference machine.
- **FR-TML-07 Track controls.** Mute, solo, lock, hide; per-track gain; track filter (text) and All/Picture/Audio switch.
- **FR-TML-08 Zoom and navigation.** Zoom to fit, zoom to selection, horizontal zoom slider and pinch; mini-map on long scenes.
- **FR-TML-09 Episode view.** A sequence view shows all scenes of an episode in order for reordering and transitions between scenes.

### 4.16 Sound and mixing (SND)

- **FR-SND-01** Add music, ambience and SFX from Catalog N or imports; loops honour loop points; music beds can auto-extend.
- **FR-SND-02** Gain (dB), pan, fade in/out with curve, mute/solo per clip and track; master limiter on export.
- **FR-SND-03 Ducking.** Music and ambience automatically duck under dialogue by a configurable amount and attack/release; ducking is visible as an automation curve and editable.
- **FR-SND-04 Sound cues.** Actions and prop states emit sound cues at events (e.g., door reaches closed state); cues appear as editable SFX clips.
- **FR-SND-05 Meters.** Level meter with peak hold and clipping warning; loudness readout (LUFS integrated) on export with normalisation option (−14 LUFS default for social, −16 for podcast).
- **FR-SND-06 Room tone and silence.** Optional automatic room tone fill under dialogue gaps from the scene's ambience.

### 4.17 Text, captions and graphics (TXT)

- **FR-TXT-01** Captions are generated from dialogue text and word timings (aligned takes); styles from Catalog O1; per-line overrides; speaker labels; concurrent speakers stacked; safe-area aware in every aspect ratio.
- **FR-TXT-02** Word-highlight ("karaoke") and animated-word caption styles use word timings.
- **FR-TXT-03** Speech and thought bubbles attach to a character's mouth/head anchor with a tail that tracks them.
- **FR-TXT-04** Titles, lower thirds, cards, credits and graphics (Catalog O1) with content, font (bundled licensed fonts), colours, timing and simple animations (in/out).
- **FR-TXT-05** World text (signs, screens) renders in scene space and moves with the camera.
- **FR-TXT-06** Export subtitles as SRT and WebVTT (FR-RND-06).

### 4.18 Templates (TPL)

- **FR-TPL-01** Catalog P1 templates create complete projects or scenes; every template plays and exports without errors on first open.
- **FR-TPL-02** Users can save any project or scene as a template (with optional placeholders for cast and text).
- **FR-TPL-03** "Replace cast" swaps a template's characters with the user's characters, retargeting all clips, gazes and shots.

### 4.19 Dialogue (DLG)

- **FR-DLG-01** Lines are created from the timeline, the Script view, a character's Direct toolbar, or by pasting/importing a script (plain text `NAME: line` or Fountain); importing a script creates lines in order with estimated placeholder durations.
- **FR-DLG-02** A line has one canonical record (speaker, text, revision, delivery, chosen take) shown consistently in the timeline, Script view and properties panel.
- **FR-DLG-03** Editing a line's text increments its revision and marks takes generated for older revisions **Outdated**; recorded/uploaded takes may be confirmed as matching the new text explicitly. Frame never claims an old recording speaks new words (P7).
- **FR-DLG-04** Take states: Missing, Queued, Generating, Ready, Failed, Outdated, Muted (intentional). Export is blocked by Missing/Failed/Outdated takes on unmuted lines, listing them with "show" links.
- **FR-DLG-05** Multiple takes per line are kept; choosing a take is undoable; unused takes can be cleaned up explicitly.
- **FR-DLG-06** A line's clip length follows the chosen take's measured duration; replacing a take keeps later clips in place unless ripple is on; resulting overlaps are flagged.
- **FR-DLG-07** Overlapping speech between different speakers is allowed and mixed; captions stack.
- **FR-DLG-08** Pauses and beats: lines may contain explicit pause markers (`[pause 0.5s]`, `…`) that drive generation where the engine supports it, and otherwise split generation into segments joined with silence.

### 4.20 Voice: library, creation and takes (VOI)

- **FR-VOI-01 Voice library.** A voice library (user profile + project-local) lists voice assets with name, description, method (designed, cloned, preset, recorded), language, versions, usage, and a play button for each reference.
- **FR-VOI-02 Design a voice.** The voice designer takes a natural-language description (age, gender presentation, timbre, accent, energy, character notes) and a test line, generates N candidates (default 4) on the worker, lets the user audition, regenerate with seeds, refine the description, and save a chosen candidate as a voice asset. The chosen candidate's audio and transcript become the voice's neutral reference.
- **FR-VOI-03 Emotional range bank.** For a voice, Frame generates reference clips for a configurable set of emotions (default: neutral, happy, sad, angry, nervous, whisper, excited, deadpan) using the design model with emotion instructions conditioned on the neutral reference; the user auditions and accepts or regenerates each. Accepted references are stored in the voice asset. Synthesis for a line selects the reference matching its delivery (P4, D-08).
- **FR-VOI-04 Clone a voice.** From an uploaded or in-browser recording (minimum 3 s, recommended 10–30 s, with transcript or auto-transcription), create a voice. **Consent is mandatory:** the user confirms it is their own voice or that they have documented consent of the speaker; the consent statement, name and date are stored in the voice asset and in exported `.framevoice` files.
- **FR-VOI-05 Record in browser.** Record takes or references with input device choice, level meter, count-in, take numbering, noise floor check, and automatic trim of leading/trailing silence (editable).
- **FR-VOI-06 Upload.** Upload audio takes (formats per §4.4); takes are decoded, measured, normalised optionally, and aligned.
- **FR-VOI-07 Generate takes.** For a line: choose voice (defaults to the speaker's voice), delivery (Catalog Q2 preset or custom: emotion, pace, instruction text where the engine supports it), number of takes (1–8) and seed policy; generation is explicit (never triggered by typing or playback), queued, cancellable, and results arrive as takes with metadata.
- **FR-VOI-08 Honest capabilities.** Delivery controls shown are exactly those reported by the worker's capabilities for the selected engine/model; unsupported controls are hidden or disabled with the reason.
- **FR-VOI-09 Stale results.** A take generated for an older line revision is stored but never auto-selected; the UI marks it as for the previous text.
- **FR-VOI-10 Versions.** Changing a voice (new references, redesigned) creates a new voice version; lines keep their takes; regenerating with the new version is explicit.
- **FR-VOI-11 Starter voices.** Catalog Q1 voices ship as voice assets with complete range banks.
- **FR-VOI-12 Worker status.** The app bar shows worker status (connected, busy with N jobs, offline, misconfigured) and a Jobs popover; when offline, generation controls explain how to start or configure the worker while recorded/uploaded workflows continue to work.

### 4.21 Voice Worker (VWK)

- **FR-VWK-01** The Voice Worker is a separate service the owner runs (WSL2/Docker on the reference machine) implementing the Voice API (§5). Frame never requires a cloud speech provider.
- **FR-VWK-02 Engines.** The first engine is Qwen3-TTS with: a VoiceDesign model (description → voice, emotion instructions) and a Base model for cloning from reference audio. Engines are plugins behind a common interface declaring capabilities.
- **FR-VWK-03 GPU budget.** On the reference GPU (8 GB VRAM) the worker loads **one large model at a time**, swapping between TTS, aligner and transcriber as jobs require; it reports VRAM use; jobs queue rather than run concurrently on the GPU.
- **FR-VWK-04 Model sizes.** The worker supports selecting model size per task (e.g., 1.7B for design, 0.6B for bulk takes if faster or if 1.7B exceeds memory) via configuration; the capability report includes the active choice. A benchmark command measures real-time factor and peak memory on the host and records the result.
- **FR-VWK-05 Caching.** Reference clips and engine conditioning data are cached by content hash; the worker is otherwise stateless and holds no project data.
- **FR-VWK-06 Exposure.** By default the worker binds to `127.0.0.1`. When exposed on a network it requires a bearer token and should be fronted by TLS (documented reverse-proxy setup). CORS is restricted to configured Frame Server origins.
- **FR-VWK-07 Installation.** A documented, scripted setup (WSL2 + CUDA or Docker with NVIDIA runtime) with pinned dependencies supporting RTX 50-series GPUs; a `doctor` command checks drivers, CUDA, model files and VRAM.
- **FR-VWK-08 Licences.** Model and library licences are recorded in the worker's `LICENSES.md`; the setup refuses to download models whose licence the owner has not accepted.

### 4.22 Lip sync (LIP)

- **FR-LIP-01 Pipeline.** For every ready take: (1) if the text is known, run **forced alignment** (WhisperX or Montreal Forced Aligner) to get word and phoneme timings; (2) if not, transcribe first, then align; (3) map phonemes to the 9-shape mouth set (Catalog A17) with a published mapping table; (4) apply coarticulation smoothing (minimum shape hold 2 frames at 24 fps, look-ahead for bilabials so M/B/P close on time); (5) store as the take's mouth track.
- **FR-LIP-02 Fallback.** If alignment fails or confidence is low, derive mouth openness from the audio amplitude envelope mapped to rest/B/C/D shapes, and mark the track "approximate".
- **FR-LIP-03 Composition.** At render time the mouth shape is drawn from the speaker's mouth part for the current view and family, modified by the active expression (curvature, width) (FR-CHR-08). During silence the mouth returns to rest; playback pause holds; seeking evaluates exactly.
- **FR-LIP-04 Editing.** The lip-sync lane shows shape blocks; users can change a block's shape, move boundaries, insert or delete blocks; edits are overrides stored separately so re-alignment can preserve or discard them (user choice).
- **FR-LIP-05 Views.** In back view the mouth is not drawn; in side view the profile mouth shapes are used.
- **FR-LIP-06 Accuracy.** On the acceptance corpus (AC-09), at least 90 % of bilabial closures (M/B/P) occur within ±1 frame of the aligned phoneme, and mouth activity covers ≥ 95 % of voiced time.

### 4.23 Rendering and export (RND)

- **FR-RND-01 One renderer.** Preview, thumbnails, CLI renders and export use `@frame/render` with the same evaluation (`@frame/core`); export never depends on a visible browser window.
- **FR-RND-02 Determinism.** Rendering a frame is a pure function of (project revision, scene, time, output settings). Particles, idle variation and randomised effects use seeds stored in the project.
- **FR-RND-03 Preview.** The canvas previews at interactive rate; it may reduce resolution or effect quality while playing (indicated) but never changes timing.
- **FR-RND-04 Export settings.** Presets from Catalog R1; custom width/height/aspect, frame rate, range (episode, scene, selection, markers), codec, quality/bitrate, captions burned-in or not, audio stems, alpha where supported.
- **FR-RND-05 Snapshot.** Export uses an immutable snapshot of the project revision at start; editing continues during export without affecting it.
- **FR-RND-06 Outputs.** Video file, optional SRT/WebVTT, optional audio stems (dialogue, music, ambience, SFX), and a **render report** (JSON + human summary: settings, revision, duration, frames, encoder, loudness, warnings, timings).
- **FR-RND-07 Lifecycle.** Jobs show Validating, Preparing, Rendering (frame n/N, fps), Encoding, Finalizing, Completed, Failed, Cancelled; cancel releases resources; failure keeps the project intact and offers retry; completed exports open in an in-app player and reveal in folder.
- **FR-RND-08 Validation before export.** Blocks on: missing/outdated takes, missing assets or media hash mismatches, conflicts, clips past scene end, unsupported settings; warnings for clipping audio, captions outside safe area, very long lines.
- **FR-RND-09 Quality.** Anti-aliased vector rendering at output resolution (no upscaled bitmaps for vector content), sRGB, optional motion blur (deterministic sub-frame sampling).
- **FR-RND-10 Batch.** Multiple exports (aspect ratios, episodes) can be queued; the CLI can render without the Studio.

### 4.24 Command-line interface (CLI)

- **FR-CLI-01** A `frame` command provides every Studio capability that does not require pointer interaction, operating on project folders directly (local mode) or through the Frame Server (server mode, `--server URL`). Both modes use the same engine and produce identical results.
- **FR-CLI-02** Global options: `--project <path>`, `--json` (structured output on stdout, logs on stderr), `--dry-run` (validate and show the effect without writing), `--base-revision <rev>` (optimistic concurrency), `--yes` (non-interactive), `--quiet`, `--verbose`, `--server <url>`, `--token <t>`.
- **FR-CLI-03** Discoverability: `frame help`, `frame <cmd> --help`, `frame schema <type>` (prints JSON Schema), `frame describe` (machine-readable list of commands, arguments, types and examples).
- **FR-CLI-04** Exit codes: 0 success; 1 usage error; 2 validation failed; 3 revision conflict; 4 not found; 5 voice worker unavailable; 6 render/export failed; 7 cancelled; 8 permission or consent required; 10 internal error. JSON errors include `code`, `message`, `details`, `hint`.
- **FR-CLI-05 Command groups** (minimum):

| Group | Commands |
|---|---|
| Project | `init`, `open`, `info`, `validate`, `settings get/set`, `versions list/save/restore`, `diff <revA> <revB>`, `history`, `undo`, `redo`, `package export/import` |
| Episodes and scenes | `episode add/list/rename/move/duplicate/delete`, `scene add/list/show/rename/move/duplicate/delete/duration` |
| Batch | `apply <commands.json\|->` — applies a list of engine commands atomically (all or none), with `--dry-run` |
| Assets | `assets search <query> [--type --family --compatible-with]`, `assets show <id>`, `assets import <file>`, `assets export <id>`, `assets validate <path>` |
| Characters | `char create --from <preset\|description>`, `char set <id> key=value…`, `char look add/set`, `char version save`, `char sheet <id> --out sheet.png` (turnaround), `char export/import` |
| Staging | `place <asset> --scene --at x,y --depth`, `move`, `group`, `camera add/frame/set`, `kit apply` |
| Directing | `line add --speaker --text`, `line set`, `act add <action> --who --at --dur`, `face add <expression>`, `look-at`, `recipe apply <id> --roles`, `shot add`, `shot auto`, `fx add`, `sound add` |
| Voice | `voice list`, `voice design --description --line --candidates`, `voice create --from-candidate\|--from-audio --consent`, `voice range build`, `takes generate <line…> --takes N --delivery`, `takes choose`, `align <take>` |
| Render | `render frame --scene --at --out frame.png`, `render video --preset --out`, `render sheet` |
| Jobs | `jobs list`, `jobs watch <id>`, `jobs cancel <id>` |
| Services | `server start`, `mcp start`, `worker status`, `worker doctor` (proxied) |

- **FR-CLI-06** Every mutating command accepts `--dry-run` and returns the list of resulting commands and validation results; agents use this to check work before applying.
- **FR-CLI-07** Output of `--json` commands conforms to published schemas and is stable across minor versions.

### 4.25 Agent interface (AGT)

- **FR-AGT-01** `frame mcp` starts a Model Context Protocol server exposing typed tools over the same engine and permissions as the CLI.
- **FR-AGT-02** Minimum tools: `describe_capabilities`, `list_projects`, `open_project`, `get_project`, `get_scene`, `search_assets`, `get_asset`, `apply_commands` (with `dry_run`, `base_revision`), `validate`, `create_character`, `design_voice`, `generate_takes`, `render_frame` (returns an image), `render_video` (job), `job_status`, `undo`, `diff_revisions`.
- **FR-AGT-03** Resources: JSON Schemas, the Catalog (IDs, names, groups, capabilities), the command reference, and the current project summary.
- **FR-AGT-04** Safety: agents cannot delete projects or voice assets, clone voices, or expose the worker without an explicit human-granted permission recorded in project settings; every agent change is tagged with its session id in history and on clips (`source: agent:<session>`) and can be reviewed and reverted as a group.
- **FR-AGT-05** Agent sessions appear in the Studio's activity log with the commands applied and a one-click revert.

### 4.26 Onboarding, help and settings (ONB / SET)

- **FR-ONB-01** First run: choose theme, check the voice worker connection (or skip), pick a template or start empty; a short guided tour (≤ 8 steps) introduces Stage/Direct/Edit, the Layers tree, the builder, lines and takes, the timeline and export.
- **FR-ONB-02** Contextual help: every panel has a help link; tooltips explain controls; empty states explain the next step.
- **FR-ONB-03** Command palette (Ctrl/⌘ K) searches commands, assets, layers, scenes, settings and help (Design System §5.4).
- **FR-SET-01** Settings: theme (Dark, Light, System), UI density (Comfortable, Compact), language (English), autosave interval, default frame rate/output, library locations, voice worker URL and token, GPU/model preferences (proxied to worker), keyboard shortcuts (rebindable), privacy (telemetry off by default; none is collected in v1), storage usage and cleanup.

---

## 5 Voice API (contract between Frame and the Voice Worker)

All endpoints are under `/v1`, JSON over HTTP(S) unless noted, bearer-token authenticated when not bound to localhost. Long operations return a job. The API is specified as OpenAPI 3.1 in `services/voice-worker/openapi.yaml`, which is normative; this section summarises it.

| Method & path | Purpose | Request (summary) | Response (summary) |
|---|---|---|---|
| `GET /v1/health` | Liveness | — | `{ ok, version }` |
| `GET /v1/capabilities` | What the worker can do | — | engines[{id, models[{id, size, task: design\|clone\|tts}], languages[], controls{emotion: [...], pace: {min,max}, instruction: bool, seed: bool, pauses: bool}}], aligner{available, languages}, transcriber{available}, gpu{name, vramTotal, vramUsed}, limits{maxTextChars, maxRefSeconds} |
| `POST /v1/blobs` | Upload reference audio by content | binary (multipart) | `{ hash }` (idempotent) |
| `POST /v1/voices/design` | Generate candidate voices | `{ description, language, sampleText, candidates, seed? }` | job → `candidates[{ audioHash, seed, durationS }]` |
| `POST /v1/voices/range` | Build emotional range references | `{ neutralRef{hash, transcript}, description, emotions[], text }` | job → `refs[{ emotion, audioHash, transcript, seed }]` |
| `POST /v1/voices/prepare` | Precompute engine conditioning for a voice | `{ refs[{hash, transcript, emotion}] , engine, model }` | `{ conditioningHash }` (cached) |
| `POST /v1/synthesize` | Generate takes | `{ text, language, voice{refs[...], conditioningHash?}, delivery{emotion?, pace?, instruction?}, takes, seed?, format: wav\|flac, sampleRate }` | job → `takes[{ audioHash, seed, durationS, settingsUsed }]` |
| `POST /v1/align` | Forced alignment | `{ audioHash, transcript, language }` | job → `{ words[{text,start,end}], phonemes[{p,start,end}], confidence, method }` |
| `POST /v1/transcribe` | Speech to text | `{ audioHash, language? }` | job → `{ text, words[...] }` |
| `GET /v1/blobs/{hash}` | Download generated audio | — | binary |
| `GET /v1/jobs/{id}` | Job status | — | `{ id, state, progress, queuePosition, result?, error? }` |
| `DELETE /v1/jobs/{id}` | Cancel | — | `{ cancelled }` |
| `GET /v1/events` (WebSocket) | Job progress stream | — | job events |
| `POST /v1/benchmark` | Measure speed and memory | `{ model }` | job → `{ rtf, peakVramMB, notes }` |

**Errors** use `{ error: { code, message, details } }` with codes: `UNAUTHORIZED`, `NOT_FOUND`, `UNSUPPORTED_CONTROL`, `TEXT_TOO_LONG`, `REFERENCE_TOO_SHORT`, `LANGUAGE_UNSUPPORTED`, `MODEL_NOT_INSTALLED`, `OUT_OF_MEMORY`, `BUSY`, `CANCELLED`, `ENGINE_ERROR`, `INVALID_AUDIO`.

- **API-01** Requests carry an idempotency key; retried requests with the same key return the same job.
- **API-02** Frame stores all generated audio as project media immediately after download; the worker's blob store is a cache with an eviction policy.
- **API-03** The capability report is authoritative for UI controls (FR-VOI-08).
- **API-04** A **fixture worker** implementing the same API with deterministic canned audio exists for tests and offline demos and identifies itself as `fixture` in `/v1/capabilities`; the UI labels fixture output as such.

---

## 6 Rendering model (summary)

1. Evaluate time `t` in the scene → active shot camera (+ camera moves), each instance's transform (+ locomotion), each character's composed pose (posture, gestures, gaze, expression, mouth shape), prop states, effects, atmosphere, text.
2. Build a display list: depth planes back to front; within a plane, layer order; within a character, part layering for the current view; attachments.
3. Apply camera: per-plane parallax transform; framing to output aspect.
4. Rasterise with Skia (vector paths, gradients for Illustrated shading, masks), effects passes (blur, grade, vignette) at output resolution.
5. Composite text/captions in screen space (title/action safe areas).
6. Audio: schedule all audio clips with automation (fades, ducking, gain) → offline mix → loudness normalise (optional) → encode with video via ffmpeg.

Golden-frame tests render reference frames for every catalog item in both families and compare against approved images (tolerance-based) to catch regressions (NFR-11).

---

## 7 Catalog requirements (CAT)

- **CAT-01 Completeness.** Every item in document 03 Catalog exists in version 1 with its listed ID (D-05).
- **CAT-02 Families and views.** Every visual item satisfies Catalog §0 rules 1–2 (both families, four views, documented view exemptions only).
- **CAT-03 Rig contract.** Every character-attached item passes the rig check (FR-AST-08); the action compatibility matrix (every action × every part/garment/accessory) is generated and published; incompatibilities are declared with reasons and are ≤ 2 % of pairs.
- **CAT-04 Manifests and previews.** Every item has a valid manifest and rendered previews in both families.
- **CAT-05 Licensing and provenance.** Every item records authorship, licence and provenance; licences permit redistribution and commercial use of exported videos; AI-assisted items are human-reviewed and labelled.
- **CAT-06 Quality bar.** Each item is reviewed against the art direction (Vision §7) and the family style guide (line weight, shading model, palette, proportions). A visual review sheet (all views × both families) is produced per item and signed off.
- **CAT-07 Content pipeline.** Bundled content is authored with the same part editor, importers and validators available to users (P14) and lives in `content/` with the catalog source in `catalog/`; document 03 is generated from the catalog source and checked in CI.
- **CAT-08 Sound assets.** Audio items are loudness-normalised per category (music −16 LUFS integrated, ambience −30, SFX peak −3 dBFS), loop seamlessly where marked, and are delivered as 48 kHz WAV/FLAC sources with compressed derivatives.
- **CAT-09 Starter voices.** Catalog Q1 voices ship complete with emotional range banks generated by the local engine and approved by listening review; none imitates a real person.
- **CAT-10 Coverage report.** A generated report lists each catalog ID with: families present, views present, validator status, preview present, review status, licence. Release requires 100 % green.

---

## 8 User interface requirements (UI)

- **UI-01** The Studio implements the shell, modes, rail, panels, canvas, timeline and components of the Design System (02 §4–§6), in both themes, using only design tokens.
- **UI-02** The Studio workspace and Character builder match the reference screens (02 §7.1, §7.2) in structure and behaviour.
- **UI-03** Every screen listed in 02 §7.3 exists and follows the system: Home and project browser, template gallery, episode/scene overview, full-page asset library, voice designer and voice library, part editor, rigging assistant (import), export dialog and jobs, settings, command palette, activity log, problems panel, help/tour.
- **UI-04** Organisation patterns: trees, collapsible sections, lists and search behave per 02 §5 everywhere they appear, including keyboard navigation and search-with-ancestors.
- **UI-05** Selection, undo, autosave, keyboard, drag-and-drop and context-menu rules of 02 §8 apply across the Studio.
- **UI-06** Every visible control works or states its prerequisite (P7); no placeholder controls ship.
- **UI-07** Visual regression tests cover every component state and both reference screens in both themes at 1440 × 900 and 1280 × 720.

### 8.1 Voice designer screen (pattern-level specification)

Left: voice library tree (My voices, Starter voices, Project voices) with search. Centre: the design workspace — description field, test line, language, candidate count, **Generate**; candidate cards (waveform, play, seed, keep/discard, "more like this"). Right: selected voice properties — name, description, method, consent record (clones), emotional range bank (list with play/regenerate/accept per emotion), auditions (any line, any delivery), engine and model used, versions, usage. Jobs show progress inline; worker status visible.

### 8.2 Part editor screen (pattern-level specification)

Left: part tree (views × layers) with search. Centre: canvas with the part on a reference head/body in the selected view, onion-skin other views, point editing tools (select, pen, convert, mirror), parameter scrubber to test bindings. Right: properties — layer fill/shading per family, anchors and pivots, parameter bindings, layering rules, validation results. Bottom: view strip (Front, ¾, Side, Back) and family toggle.

---

## 9 Non-functional requirements

| ID | Requirement | Measure (reference environment §0.5) |
|---|---|---|
| **NFR-01 Responsiveness** | Ordinary interactions (select, slider, tree expand, property edit) update the UI and canvas quickly. | p95 ≤ 100 ms over 50 interactions on the reference project (AC-14). |
| **NFR-02 Preview performance** | Playback of a scene with 4 characters, 30 props, atmosphere and captions at preview resolution. | ≥ 24 fps average over 30 s, no dropped audio. |
| **NFR-03 Determinism** | Same revision + time + settings → identical frame across Studio preview (at full quality), CLI render and export. | Pixel difference ≤ 0.5 % per golden frame; exported audio sample-identical for the same revision. |
| **NFR-04 A/V sync** | Exported audio and visual events (mouth closures, cuts, sound cues) aligned. | ≤ 1 frame offset at start, middle and end of a 10-minute export; output duration within ±1 frame of the episode duration. |
| **NFR-05 Export speed** | Offline export on the reference machine. | 1080p24 Flat: ≥ 1× real-time; Illustrated with effects: ≥ 0.5× real-time; progress and ETA shown. |
| **NFR-06 Voice speed** | Generation on the reference GPU. | Report measured real-time factor per model via benchmark; target ≤ 1.0 RTF for take generation with the selected model; UI never blocks. |
| **NFR-07 Capacity** | Supported project sizes without degradation beyond NFR-01/02. | Episodes ≥ 30 min; scenes ≥ 100 per project; ≥ 12 characters per scene; ≥ 200 instances per scene; ≥ 5 000 clips per episode; library ≥ 20 000 assets. |
| **NFR-08 Reliability** | No data loss. | Kill server/browser during 1 000 random edits: reopened project equals last committed state; no corrupt files. |
| **NFR-09 Security** | Local by default; tokens for exposed services; no secrets in projects, packages, logs or bundles; package import is safe (no path traversal, no code execution). | Security test suite and dependency audit pass. |
| **NFR-10 Privacy** | Nothing leaves the machine unless the owner configures an endpoint; no telemetry in v1. | Network audit during the acceptance run shows only localhost and the configured worker. |
| **NFR-11 Testability** | Engine, rig, renderer, IO, CLI, MCP and worker are testable headlessly; golden frames for all catalog items; E2E for all journeys. | Coverage report per requirement ID. |
| **NFR-12 Accessibility** | Design System §10 checklist; WCAG 2.2 AA for the chrome. | Automated axe checks plus manual keyboard and screen-reader pass. |
| **NFR-13 Maintainability** | Module boundaries per §2.2; no runtime dependence on bundled names (FR-ARC-06); documented extension points. | Static checks and architecture tests pass. |
| **NFR-14 Compatibility** | Chrome/Edge current: full support; Firefox/Safari current: editing supported, export via server unaffected. | Smoke suite on all four. |
| **NFR-15 Portability** | Server and CLI run on Windows (native or WSL2), macOS and Linux; the Voice Worker runs on the reference GPU via WSL2/Docker. | CI matrix + reference machine run. |
| **NFR-16 Internationalisation-ready** | All UI strings externalised; RTL-safe layouts; captions support Unicode; speech language is a field throughout. | String extraction check. |
| **NFR-17 Licensing** | All dependencies, models, fonts and content have recorded licences compatible with distribution and commercial output. | Licence report generated and reviewed. |
| **NFR-18 Transparency** | Known limitations, unverified integrations and skipped tests are documented; the final report distinguishes passed, failed, skipped and not verified. | Acceptance report format (§12). |

---

## 10 Acceptance scenarios

Each scenario is executed end to end on the reference environment with evidence (recordings, exported files, logs, reports). Unit and integration tests support but do not replace them.

| ID | Scenario | Verifies |
|---|---|---|
| **AC-01** | **Template to video.** Open the two-person podcast template; play it; change Maya's look and shirt colour; regenerate one line with her designed voice and a "nervous" delivery; shorten a shot; export 1080p MP4 with captions. The file plays in VLC and a browser, shows the new look, the new cut, synchronised lip sync and captions. | PRJ, BLD, VOI, LIP, CAM, TXT, RND |
| **AC-02** | **Build a character in both families.** Create a character from scratch using parts from every builder section; verify all four views and both families in the turnaround sheet; run expression and lip-sync tests; save; export `.framechar`; import into a fresh profile; identical rendering. | CHR, BLD, IMP, CAT-02 |
| **AC-03** | **Design a voice and range bank.** Describe a voice, generate 4 candidates, save one, build the 8-emotion range bank, generate takes for 5 lines with different deliveries; a listening panel (≥ 3 people) identifies all takes as the same speaker in ≥ 90 % of judgements. | VOI, VWK |
| **AC-04** | **Record and upload.** Record a line in the browser and upload another; both decode, measure, align and drive lip sync; editing the text marks them outdated until confirmed or replaced. | VOI-05/06, DLG-03, LIP |
| **AC-05** | **Clone with consent.** Attempt to clone without consent (blocked), then with consent; the consent record appears in the voice asset and in an exported `.framevoice`. | VOI-04, AGT-04 |
| **AC-06** | **Scene from scratch.** New project → coffee shop kit → place 3 characters and 10 props → write 8 lines → generate takes → apply 3 recipes (interruption, double take gag, hand over object) → auto shot coverage then adjust → add rain and music with ducking → export portrait and landscape. | ENV, STG, RCP, CAM, FX, SND, RND |
| **AC-07** | **Interactive props.** A character picks up a mug, drinks (steam on), puts it down with a sound cue at contact; opens and closes a door; uses a phone (screen on). Seeking to the middle of each action shows the correct state. | PRP, ACT-06, SND-04 |
| **AC-08** | **Locomotion and gaze.** A character enters along a curved path, stops on a mark, turns to face another, sits; a listener's gaze follows the walker; no foot sliding beyond 2 px at 1080p; repeated seeks show no drift. | ACT-04/05, STG-04 |
| **AC-09** | **Lip-sync accuracy.** On a corpus of 50 lines (generated, recorded, uploaded), measure FR-LIP-06 thresholds; edit mouth blocks; re-align preserving edits. | LIP |
| **AC-10** | **Conflicts and validation.** Create overlapping same-channel clips, same-speaker overlaps, overlapping shots, clips past scene end, missing media; each is flagged at edit time and blocks export with "show" links; fixing them unblocks export. | TML, PER-06, RND-08 |
| **AC-11** | **Versions and reuse.** Use a character in two episodes; save a new version; update only one scene's instance; reopen; versions and appearances correct; project versions (snapshots) restore correctly. | CHR-10, PER-03, AST-05 |
| **AC-12** | **Import and rigging assistant.** Import a layered PSD character with front and three-quarter views; map layers; supply missing mouth shapes from the family library; pass rig check (with declared view gaps); use in a scene. Import an image background and an audio file. | IMP |
| **AC-13** | **Agent production.** Given a written brief, an agent using only MCP tools creates a 3-scene episode with 2 characters, lines, generated takes, recipes, shots and music; validates with dry runs; renders a preview frame and a video; the human opens the project in the Studio, sees agent-tagged clips, reverts one agent change group and edits the rest. Concurrent human edit during agent work produces a revision conflict that the agent resolves by re-reading. | CLI, AGT, ARC-04 |
| **AC-14** | **Performance.** On the reference project (4 characters, 30 props, atmosphere, captions, 10-minute episode), measure NFR-01, NFR-02, NFR-05; record machine details. | NFR-01/02/05 |
| **AC-15** | **Determinism and sync.** Render 20 golden frames via Studio preview, CLI and export and compare (NFR-03); export a 10-minute episode with sync markers and measure NFR-04. | NFR-03/04 |
| **AC-16** | **Reliability.** Run the crash test (NFR-08); simulate disk-full during save (error shown, in-memory work preserved, retry succeeds); external git change detected and merged. | PER, NFR-08 |
| **AC-17** | **Worker resilience.** Stop the worker mid-generation: jobs fail visibly with retry; recorded/uploaded workflows continue; restart → retry succeeds; out-of-memory on the GPU is reported and the worker recovers by unloading models. | VWK, VOI-12 |
| **AC-18** | **Design System compliance.** Visual regression on both reference screens and all component states in both themes; keyboard-only completion of AC-01; screen-reader labels; 125 % zoom usability. | UI, NFR-12 |
| **AC-19** | **Catalog coverage.** CAT-10 report is 100 % green; spot-check 50 random items visually in both families and four views; action compatibility matrix within CAT-03 limit. | CAT |
| **AC-20** | **Packages and portability.** Export a project package with custom characters, voices and media; open on a second machine (macOS or Linux) without the original library; everything resolves; render identical frames. | DAT, IMP, NFR-15 |
| **AC-21** | **Security and privacy.** Malicious package (path traversal, oversized entries, script content) is rejected safely; network audit shows no unexpected traffic; tokens never appear in logs or packages. | NFR-09/10 |
| **AC-22** | **Templates.** Every Catalog P1 template opens, plays and exports without warnings; "Replace cast" retargets all clips and shots. | TPL |
| **AC-23** | **Captions and text.** Karaoke captions follow word timings within ±1 frame; concurrent speakers stack; bubbles track a walking character; captions stay inside safe areas in all Catalog R1 aspect ratios; SRT/VTT exports validate. | TXT |
| **AC-24** | **Fresh setup.** Following only the README on a clean Windows 11 reference laptop: install server, studio and Voice Worker (WSL2/Docker), run `worker doctor`, run the benchmark, run the test suites, complete AC-01. | Deliverables, VWK-07 |

---

## 11 Build order (milestones)

The scope is fixed by D-05; milestones order the work so a working product exists early and every later piece plugs into a proven core. A milestone is complete only with its exit evidence.

| Milestone | Content | Exit evidence |
|---|---|---|
| **M0 Foundations** | Monorepo, schemas, design tokens and UI kit (both themes), project store, command/undo engine, CLI skeleton with `--json`/`--dry-run`, CI with golden-frame harness. | Schemas published; component stories in both themes; CLI creates and validates a project. |
| **M1 Vertical slice** | Rig v1, one character per family (all views), one kit, timeline with dialogue/acting/face/shot tracks, Voice Worker with Qwen3-TTS design + clone + alignment, lip sync, renderer, MP4 export, Studio shell with reference screens. | A designed voice speaks two aligned lines in a two-character scene exported as MP4 from both Studio and CLI with identical frames. |
| **M2 Builder and assets** | Full character builder, part editor, asset system, library browser, importers and rigging assistant, packages, versions. | AC-02, AC-11, AC-12, AC-20. |
| **M3 Direction** | All action, expression, gaze, locomotion, prop interaction, recipes, cameras and moves, effects, atmosphere, sound and mixing, captions and text, templates system. | AC-06 – AC-10, AC-22, AC-23. |
| **M4 Agents** | Complete CLI, MCP server, activity log, concurrency. | AC-13. |
| **M5 Catalog completion** | All catalog content in both families and four views, starter voices, sounds, templates; coverage report. | AC-19, AC-22. |
| **M6 Hardening** | Performance, determinism, reliability, security, accessibility, documentation, fresh setup. | AC-14 – AC-18, AC-21, AC-24; final acceptance report. |

Content production (M5) runs in parallel with M2–M4 once the part contract is frozen at the end of M1.

---

## 12 Deliverables and reporting

1. Source code, lockfiles and build scripts for all packages, the Studio, the CLI, the MCP server and the Voice Worker.
2. `README.md` with installation for server/studio (Windows, macOS, Linux) and the Voice Worker (WSL2 or Docker on the reference GPU), first run, troubleshooting.
3. `docs/` — architecture, decision log, file formats and schemas, Voice API (OpenAPI), CLI reference (generated), MCP tool reference, extension guides (adding a part, garment, prop, action, expression, effect, kit, template, voice engine), family style guides, rig specification.
4. The catalog source, all content, the generated Catalog document and the coverage report.
5. Test suites (unit, integration, golden frames, E2E, worker) and their reports.
6. Sample projects for every template and a showcase episode with exported videos in landscape and portrait.
7. An **acceptance report** mapping every AC and NFR to Passed / Failed / Skipped / Not verified with evidence links, test environment details (hardware, OS, driver, browser versions) and known limitations. The product shall not be described as complete while any mandatory item is Failed or Not verified.

---

## 13 Risks and responses

| Risk | Impact | Response |
|---|---|---|
| Art volume (1 254 catalog items × 2 families × 4 views) | Schedule | Freeze part contract early; parametric parts reduce unique drawings; AI-assisted drafting with human review; per-item review sheets; parallel content track. |
| Voice identity drift across emotions | Characters sound inconsistent | Emotional range bank built from the neutral reference; listening tests (AC-03); fall back to clone-with-reference per emotion. |
| 8 GB VRAM limits | Slow or failing generation | One model at a time, model-size selection, queue, benchmark, OOM recovery (AC-17). |
| RTX 50-series software support | Worker install failures | Pinned CUDA/PyTorch builds verified on the reference machine; `worker doctor`. |
| Alignment errors on expressive speech | Poor lip sync | Text-known forced alignment, confidence scoring, amplitude fallback, editable mouth track. |
| Renderer parity browser vs Node | Preview ≠ export | Single CanvasKit renderer, golden-frame parity tests in CI. |
| Agent edits overwriting human work | Lost work | Revision checks, dry runs, agent-tagged change groups, one-click revert. |
| Licence ambiguity of models, fonts or audio | Distribution blocked | Licence verification at selection time; licence report (NFR-17). |
| Scope creep beyond catalog | Delay | Catalog is the content boundary; additions go to a post-v1 list. |

---

## 14 Future (not in version 1)

Additional speech engines and languages; translation and dubbing; cloud sync, accounts and collaboration; a marketplace for packs; additional style families (e.g., anime, paper cut-out); additional views; physics for hair and cloth; motion capture from webcam to drive performances; natural-language directing ("make Leo more sarcastic here") as a first-class mode; mobile review app.

---

## Appendix A — Requirement index

| Area | Prefix | Section |
|---|---|---|
| Architecture | FR-ARC | §2.4 |
| Data and formats | FR-DAT | §3 |
| Projects | FR-PRJ | §4.1 |
| Persistence | FR-PER | §4.2 |
| Assets | FR-AST | §4.3 |
| Import/export | FR-IMP | §4.4 |
| Characters | FR-CHR | §4.5 |
| Builder | FR-BLD | §4.6 |
| Part editor | FR-PED | §4.7 |
| Wardrobe | FR-WRD | §4.8 |
| Expressions | FR-EXP | §4.9 |
| Actions | FR-ACT | §4.10 |
| Recipes | FR-RCP | §4.11 |
| Props, environments, stage | FR-PRP / FR-ENV / FR-STG | §4.12 |
| Cameras | FR-CAM | §4.13 |
| Effects | FR-FX | §4.14 |
| Timeline | FR-TML | §4.15 |
| Sound | FR-SND | §4.16 |
| Text | FR-TXT | §4.17 |
| Templates | FR-TPL | §4.18 |
| Dialogue | FR-DLG | §4.19 |
| Voice | FR-VOI | §4.20 |
| Voice Worker | FR-VWK, API | §4.21, §5 |
| Lip sync | FR-LIP | §4.22 |
| Rendering | FR-RND | §4.23, §6 |
| CLI | FR-CLI | §4.24 |
| Agents | FR-AGT | §4.25 |
| Onboarding, settings | FR-ONB / FR-SET | §4.26 |
| Catalog | CAT | §7 |
| UI | UI | §8 |
| Quality | NFR | §9 |
| Acceptance | AC | §10 |

## Appendix B — Glossary

See Vision §10. Additional terms: **Fixture worker** — a test implementation of the Voice API returning deterministic audio; **Golden frame** — an approved reference render used to detect visual regressions; **Range bank** — a voice's set of per-emotion reference recordings; **Rig check** — automated validation of a part or character against the rig contract; **Mouth track** — timed mouth-shape blocks derived from alignment.
