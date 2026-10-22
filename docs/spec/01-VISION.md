# Frame — Vision and Product Philosophy

| | |
|---|---|
| Document | 01 of 4 — Vision and Philosophy |
| Version | 1.0 |
| Date | 22 October 2026 |
| Status | Baseline for implementation |
| Companion documents | 02 Design System · 03 Catalog · 04 Software Requirements Specification |
| Supersedes | The "Virtual Film Studio Prototype SRS" (3D direction), retained only as history |

This document explains **why Frame exists, who it serves, and the principles that decide every trade-off**. It is deliberately short and stable. The Design System says how Frame looks and behaves, the Catalog lists every reusable building block, and the SRS states what must be built and how it is verified. When those documents leave room for judgement, or appear to conflict, this document decides.

Principles are numbered (`P1`…`P14`) so the other documents can cite them.

---

## 1 The problem

Many people can imagine a story, write a conversation or script a joke, but cannot animate it. Producing even a one-minute animated scene traditionally requires drawing, rigging, timing, lip sync, camera work, sound design and editing — each a profession in its own right. Existing tools either assume that expertise (professional animation suites) or remove creative control (template video generators that produce generic results).

The people Frame serves want to **make the decisions a director makes** — who is in the scene, what they say, how they feel, what the audience sees and when — without making the thousands of decisions an animator makes.

## 2 The product

**Frame is a 2D animation directing studio.** A creator builds a reusable cast, stages scenes from reusable sets and props, directs performances through expressions, actions, gaze and dialogue, chooses shots, and exports a finished video with sound.

Frame has three faces onto one engine:

1. **The Studio** — a polished browser application for directing (Stage, Direct, Edit).
2. **The CLI and agent interface** — the same operations, scriptable, so people and AI agents can assemble, validate and render productions headlessly.
3. **The Voice Worker** — a self-hosted speech service that designs, stores and performs reusable character voices on the creator's own hardware.

Everything Frame produces stays editable. A generated voice line, an applied recipe or an agent-assembled scene is ordinary project content that a person can open and refine.

## 3 Who it is for

**Primary creator.** An individual with no animation training who is comfortable with modern web tools such as Canva, Figma or a video editor. They can write and make creative choices. They value speed, good defaults and results that look intentional.

**Secondary creators.**
- *Series creators* returning to the same cast and locations every episode.
- *Educators and explainers* presenting with a recurring character.
- *Podcasters* turning audio conversations into animated segments.
- *Automators and agents* producing variants, translations or batches through the CLI.

**Not the target (for now).** Professional animators who need frame-by-frame drawing, studios that need multi-seat collaboration, and users who want photorealism or generative video.

## 4 What Frame is used to make

- Two- to four-character conversations, interviews and podcasts.
- Comedy sketches with reactions, interruptions and physical beats.
- Explainers and lessons presented by a character.
- Short narrative scenes and recurring series episodes.
- Social clips in landscape, portrait and square formats.

These share one scene and timeline model; Frame does not contain separate engines for each.

## 5 Why 2D

The project began as a 3D studio and changed direction deliberately. 2D is the foundation because:

- **Quality is achievable.** Well-designed 2D artwork looks finished and intentional; procedural 3D without production assets looks crude.
- **The creator manages less.** No orbiting cameras, lighting rigs or intersecting geometry. Directing becomes composition, performance and timing.
- **Expressiveness is cheaper.** Expressions, motion effects, emotional symbols, squash and stretch and comic timing are native to 2D.
- **Assets are faster to make and to customise** — provided they follow a shared part and rig contract.

The cost of 2D is camera freedom: the creator directs compositions, not a free-flying camera. Depth is recovered through layered planes and parallax. For the productions in §4, this trade is worth it.

## 6 Product principles

**P1 — Directing, not animating.**
The primary vocabulary is the director's: cast, scene, line, beat, expression, gesture, look at, shot, cut. Technical operations (bones, keyframes, curves) exist underneath and may be exposed for advanced refinement, but no common task requires them.

**P2 — Strong defaults, deliberate control.**
Every new character, scene and template is immediately playable and looks good. Defaults accelerate; they never lock. Every important property can be changed, and every automatic result can be overridden.

**P3 — Everything is a reusable building block.**
Content follows one hierarchy: **parts → assets → presets → instances → clips → templates**. Eye artwork becomes an expression-capable face, which becomes Maya's on-air look, placed in a scene, performing a timed reply, saved in a podcast template. Each level is reusable on its own.

**P4 — Identity is separate from appearance, performance and voice.**
Maya is Maya in any outfit, any scene and any mood. A character's identity, its looks, its voice and its performances are separately controllable resources.

**P5 — Versions protect finished work.**
Library resources are immutable by version. Improving a character, voice or prop never silently changes a scene that already uses it; updating is an explicit, undoable choice.

**P6 — Results stay editable.**
Recipes, AI assistance, templates and agents produce ordinary clips and assets — never opaque "baked" output. If Frame created it, the creator can open it, see its parts and change them.

**P7 — Deterministic and honest.**
The same project at the same time renders the same frame, in the editor, on the command line and in export. Frame never pretends: a control that cannot work says why; a fixture is never presented as real speech; a preview is never presented as an export; an unverified integration is labelled as such.

**P8 — Local-first and private.**
Projects live as files the creator owns. Speech generation runs on the creator's own hardware through a self-hosted worker. Nothing leaves the machine unless the creator configures it to.

**P9 — One engine, many faces.**
The Studio, the CLI and the agent interface operate on the same project model through the same engine. Anything the Studio can do, the CLI can do; anything an agent does, a person can inspect and undo.

**P10 — Built for agents as first-class users.**
Commands are discoverable, schemas are published, results are structured, errors are coded, operations can be validated before they apply, and revision checks prevent an agent from overwriting newer human edits.

**P11 — Compatibility is explicit.**
Assets declare what they support — style family, views, rig capabilities, required anchors. The editor never offers a combination that cannot produce a good result, and explains why when something is unavailable.

**P12 — Performance includes more than speech.**
A speaking character has posture, expression, gaze, gestures and reactions; a listening character performs too. Frame coordinates these channels so a scene feels acted, not merely voiced.

**P13 — Professional craft, approachable surface.**
Frame looks and behaves like a professional creative tool — calm, dense, precise, fast — while remaining learnable in minutes. Organisation (trees, collapsible sections, lists and search) carries complexity so the canvas can stay the hero. (See Design System.)

**P14 — Extensible by contract, not by exception.**
New characters, parts, props, actions, effects, voices and engines are added through documented manifests and interfaces. Nothing in the engine knows the names of the bundled cast, sets or lines.

## 7 Art direction

Frame launches with **two style families** that share one rig and part contract:

| Family | Character | Intended use |
|---|---|---|
| **Flat** | Clean shapes, limited palette, cel shading with one shadow tone, no or minimal outlines, bold expressions. | Explainers, comedy, social clips, podcasts. |
| **Illustrated** | Semi-realistic proportions, soft painted shading, thin warm line work, nuanced faces and fabric folds. | Drama, storytelling, educational narrative, premium-looking series. |

Rules that apply to both:

- **One rig, two skins.** Animation data, actions, expressions and lip sync are style-independent; only artwork differs.
- **Four views.** Front, three-quarter, side and back, with left/right by mirroring.
- **Coherence over quantity.** Every part in a family shares line weight, shading model, palette logic and proportion system so any combination looks designed.
- **Readable at small sizes.** Faces and gestures must read on a phone screen in portrait format.
- **Inclusive by default.** Skin tones, body types, ages, hair textures, head coverings and assistive devices are first-class options, not afterthoughts.

The style family is chosen per project and may be switched; projects may not mix families within a scene.

## 8 What success looks like

Frame succeeds when a first-time creator can, within an hour and without a tutorial video:

1. Build a character they are proud of and give them a voice.
2. Stage a two-character scene in a ready-made location.
3. Direct an exchange that includes an interruption, a reaction, a gesture with a prop and two camera cuts.
4. Export a video with synchronised lip movement, captions and sound that they would share.

And when an agent, given the same goal in words, can produce an equivalent editable project through the CLI that the creator then refines in the Studio.

## 9 Non-goals

Frame does not aim to provide: frame-by-frame drawing, 3D scenes, photorealistic rendering, generative video, real-time multiplayer editing, a public asset marketplace, user-installed code plugins, or cloud hosting in this version. Several of these are plausible futures (see SRS §Future) and the architecture should not preclude them.

## 10 Vocabulary

| Term | Meaning |
|---|---|
| Asset | A reusable, versioned resource (part, character, prop, action, voice, effect, sound…). |
| Part | A piece of character artwork (a hairstyle, a nose) drawn for every supported view in a style family. |
| Rig | The named joint and control structure that parts attach to and actions drive. |
| Look | A named outfit and accessory combination belonging to a character. |
| Instance | One placement of an asset in a scene, owning its scene-specific settings. |
| Clip | A timed piece of performance, dialogue, camera, effect or sound on the timeline. |
| Recipe | A reusable combination of clips that expands into editable clips. |
| Voice | A reusable vocal identity, with reference recordings and engine data. |
| Take | One recording of one line. |
| Shot | A timed interval showing the scene through one camera framing. |
| Template | A ready-to-direct production assembled from other building blocks. |
