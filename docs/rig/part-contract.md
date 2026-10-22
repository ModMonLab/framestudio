# Part contract — `rig.biped@1` (frozen at the end of M1)

This is the contract between character artwork and the rig. Bundled content, imported parts and parts made in the
part editor all follow it; the content track (M5) builds against it. Types: `packages/rig/src/types.ts`. Validator:
`rigCheck()` in `packages/rig/src/check.ts` (FR-AST-08). Changes after the freeze are additive only (new optional
fields, new slots, new fit spaces) and recorded in a decision; existing fields never change meaning.

## 1. A part is data

A part asset's manifest `data` is a `PartData`:

| Field | Meaning |
|---|---|
| `slot` | Rig category the part fills: `head`, `eyes`, `brows`, `nose`, `mouth`, `ears`, `hair`, `fringe`, `facial-hair`, `top`, `outer`, `bottom`, `dress`, `shoe`, `acc`, `hands`, `feet`, `body`, `skin-detail`, `makeup`, `overlay`, `identity`. |
| `families.flat`, `families.illustrated` | Artwork per style family (both required, Catalog §0 rule 1). |
| `families.<f>.views.front/three/side/back` | `ViewArt` per view; a missing view needs `exempt[view]` with a reason (rule 2). |
| `mirror` | `mirror` (default) flips with the character; `keep` keeps screen orientation (a parting, a logo). |
| `params` | Parameters exposed to the builder (number with range, enum with options, colour, boolean). |
| `options` | Garment/hair option states (sleeves rolled, hood up) usable in `when` conditions. |
| `colorSlot`, `colors` | Palette slot the part's `garment` colours map to, and default colours. |
| `hides` | Other slots this part hides (a hat hides `hair.top`; a dress replaces top and bottom). |
| `patternable` | Supports fabric patterns (Catalog B6). |

## 2. Views and fit spaces

Art is drawn in a **normalised fit space**, not in pixels, so one part fits every body, head shape, pose and view:

| Space | Origin and units |
|---|---|
| `head`, `neck` | Head centre; u ∈ [-1, 1] across the head half-width, v ∈ [-1, 1] down the head half-height; rolls with the head. |
| `face` | Like `head`, shifted by head yaw/pitch so features turn inside the view. |
| `eye`/`eyeL`/`eyeR`, `brow…`, `ear…`, `mouth`, `nose` | Feature units at the head art's anchors (`eyeL`, `browR`, `mouth`, …), scaled by face controls; `L`/`R` instances mirror. |
| `torso` | v = 0 at the shoulder line → 1 at the hip line; u ∈ [-1, 1] across the projected body profile (u ≥ 0 is the facing side). Breathing scales it. |
| `pelvis` | v = 0 at the hip line → 1 at the crotch. |
| `hand`/`handL`/`handR` | Wrist origin; v along the forearm direction, u across; scaled by hand size; mirrored per side. |
| `foot`/`footL`/`footR` | Ankle origin; u forward (flips with facing), v down; scaled by foot length. |
| `stage` | Raw stage units (props and set pieces only). |

Views are `front` (0°), `three` (40°), `side` (90°) and `back` (180°) of the 3D-lite skeleton; the rig projects joints
per view and mirrors for flipped characters.

## 3. Control points and morphs

`ViewArt.points` maps names to `{ p: [u, v], d?: { param: [du, dv] } }`. The point's position is
`p + Σ d[param] × value(param)`, where values come from the part's own `params`, character controls (`face.width`,
`eye.size`, `hair.volume`, …) and body sliders. Shapes reference points by name; every reference must exist.

## 4. Layers, slots and shapes

`ViewArt.layers[]` draw in **layering slots** (FR-CHR-07). Slot order, back to front:

`shadow, hair.back, acc.back, arm.far, sleeve.far, outer.sleeve.far, hand.far, acc.hand.far, leg.far, legwear.far,
foot.far, shoe.far, leg.near, legwear.near, foot.near, shoe.near, body.pelvis, bottom, body.torso, neck, top, dress,
outer, acc.waist, collar, acc.neck, ears, acc.ears, head, face.skin, makeup, nose, mouth, facial-hair, eyes, brows,
face.overlay, acc.face, hair.front, fringe, acc.head, arm.near, sleeve.near, outer.sleeve.near, hand.near,
acc.hand.near, overlay`.

A slot written with `*` (`sleeve.*`) resolves to `near` or `far` per pose and side. A layer has a fit `space`, and
either `shapes` or a `limb`:

- **Shapes**: closed or open `path` (`M`, `L`, `Q`, `C`, `Z` over point names) or `ellipse` (centre point, radii,
  per-parameter radius deltas); `fill` (palette slot, `#hex`, linear or radial gradient), `stroke` (colour, width,
  round/butt cap), `opacity`, `opacityParam`, `clip` (another shape id in the same layer), `blend`, `evenOdd`, `when`.
- **Limb primitive**: a tapered stroke along `armL/armR/legL/legR/neck` (or `arms`/`legs` for both) from `from` to
  `to` along the chain (0 root, 0.5 elbow/knee, 1 wrist/ankle) with `width` relative to the body limb, optional
  `flare`, `shade`, `outline` and `cap`. Sleeves and trouser legs use it so they bend cleanly in every pose.
- `sides: ['L','R']` instances a layer per side (hands, feet, eyes, brows, ears).

## 5. Conditions

`when` on layers and shapes filters by render state: `{ mouth: 'A' }` (mouth shapes A–H, X), `{ eyeClosed: 'true' }`,
eye/brow states, and option states `{ 'option.hood': 'up' }`. Mouth parts must draw all nine shapes of A17.

## 6. Colours

Colour references are palette slots or `#hex`. The palette is built from the character's colours and the family style:
for every colour `k` it provides `k`, `k.shade`, `k.deep`, `k.light`, `k.line`; plus `line`, `eyewhite`, `lash`,
`skin.blush`, `white`, `black`, `mouth`, `teeth`, `tongue`. Garments use `garment` (mapped through `colorSlot`).

## 7. Anchors

`ViewArt.anchors` names attachment points (`{ space, at }`) for accessories and props (FR-CHR-06): the head art
provides feature anchors (`eyeL`, `eyeR`, `browL`, `browR`, `mouth`, `nose`, `earL`, `earR`) that place feature parts.

## 8. Families

Flat and Illustrated share IDs, parameters, points and behaviour; only artwork and the style guide differ
(`content/families/*.json`: line weight, shading model, palette factors). Illustrated adds shade layers (gradients,
`*.shade` fills, `multiply` blends); decorative flat-only shapes are marked so the Illustrated outline skips them.

## 9. Validation

`rigCheck()` must report no errors: both families; four views or documented exemptions; known slots; valid fit spaces;
point references, clip targets and limb ranges valid; parameter defaults within range/options; colour references
are palette slots or `#hex` (warning otherwise). Composition against reference characters in every view and the
action compatibility matrix (CAT-03) are run by the content tools on top of this check.
