# 0019 — Rigging assistant: placed artwork and limb-segment fit spaces (additive part-contract change)

Status: Accepted · Requirements: FR-IMP-03, AC-12, FR-CHR-03, P11 · Part contract: additive change after the M1 freeze

## Decision

- **Reading layered artwork:** PSD through `ag-psd` **31.0.3** (MIT; verified in the shipped `dist/psd.d.ts` and
  `psdReader.js`: `readPsd(buffer, { useImageData, skipCompositeImageData, skipThumbnail, … })` returns layers with
  `left/top/right/bottom`, `hidden`, `imageData` and nested `children`; `initializeCanvas` replaces the canvas hook,
  which Frame sets to plain pixel buffers so no canvas or native module is used). Each layer is encoded as PNG by
  Frame's own deterministic encoder and stored content-addressed. Layered SVG uses the safe SVG reader (decision
  0018); groups named like a view become view containers.
- **Views:** top-level groups named `front`, `three-quarter` (`3/4`, `3q`, `three`), `side`/`profile`, `back` give
  the layers their view; without view groups everything is the front view. Views the artwork lacks are declared as
  exemptions ("Not drawn in the imported artwork") on every generated part and on the character, so the rig check
  passes with documented gaps (P11) instead of inventing drawings.
- **Mapping:** layer names map to rig targets by convention (`head`, `eye_L`, `brow_R`, `mouth_A`…`mouth_H`,
  `mouth_X`/`mouth_rest`, `hair_back`, `torso`, `upper_arm_L`, `forearm_R`, `hand_L`, `thigh_R`, `shin_L`, `foot_R`…);
  every suggestion can be changed or set to "Not used".
- **Frames from bounds:** the head layer's box defines the head frame (centre, half sizes); the torso box gives the
  shoulder and hip lines; pelvis, limb segments, hands and feet use their own boxes. Head-attached layers (hair, face
  features, neck) are placed relative to the head box. Proportions follow the drawing: the character's head ratio is
  measured from the front view.
- **Additive contract change** (`docs/rig/part-contract.md` allows new optional fields and fit spaces):
  - `ShapeDef.art` — *placed artwork*: a raster media hash or vector paths whose source rectangle is mapped affinely
    onto a box in the layer's fit space (three mapped corners define the transform, so mirroring and rotation follow
    the space).
  - Fit spaces `upperArmL/R`, `foreArmL/R`, `thighL/R`, `shinL/R`: origin at the proximal joint, `v` 0→1 along the
    bone, `u` across in limb half-widths. Layers on them resolve `arm.*` / `leg.*` slots near/far by their side.
- **Parts:** one generated part per character part key (head, eyes, brows, nose, mouth, ears, hair, body, hands, feet)
  with the same artwork in both style families (the drawing is the drawing). The head part carries feature anchors at
  the mapped features (or a default layout) so **library parts can fill gaps in place** — e.g. a library mouth when
  the drawing lacks some of the nine speech shapes. Mouth layers draw under `when: { mouth: <letter> }`.
- **Checks before saving:** the assistant's own problems (no head, incomplete mouth set without a library mouth) and
  the character rig check (`checkCharacter`) must have no errors; the user states their rights to the artwork, which
  is recorded as provenance.

## Consequences

- Imported characters animate with every library action (rigid segments per bone); faces animate through mouth
  shapes; eyes and brows of raster artwork do not blink or emote unless library parts are chosen for them.
- **Props with states and sets (added in session 2):** the same artwork can instead become a prop or a location kit.
  Prop layers map to *every state*, *only when <state>* (suggested from `state_on`, `State: off`, a `state_open`
  folder, or bare `on`/`off`/`open`/`closed`) or *not used*; the prop's origin is the bottom centre of the used layers,
  each layer is one placed-art shape (`when: { state: [...] }` for state layers, the default state also matching the
  evaluator's unset value `default`), and the manifest declares a `state` enum parameter. Set layers map to depth
  planes (sky/distant → far, walls → back, floors → ground, furniture → mid, foreground → front); the drawing is scaled
  to the output width and bottom-aligned; each layer becomes a kit part anchored at its own bottom centre, placed as
  `set-piece` instances. The prop evaluator now draws placed artwork (`placedArt` is exported from `@frame/rig`).
  Images still import as objects/backgrounds (decision 0018).

## Evidence

`packages/io/test/rigging.test.ts` (PSD written with ag-psd → layers, views, PNG media; rig with a library mouth; rig
check passes with declared gaps; rendered through the one renderer), Studio e2e "rigging assistant: a layered PSD…"
(mapping, blocked save until a library mouth, previews in both drawn views, axe, placed in the scene, preview =
export renderer); prop and set cases in the same unit file (state switching rendered by pixel colour, set pieces on
planes filling the frame), `packages/server/test/rigging.test.ts` (API dry run, save, place, validate, frame) and the
Studio e2e "rigging assistant: a layered SVG becomes a prop with states…".
