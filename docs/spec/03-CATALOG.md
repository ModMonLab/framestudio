# Frame — Catalog of Building Blocks
| | |
|---|---|
| Document | 03 of 4 — Catalog |
| Version | 1.0 |
| Date | 22 October 2026 |
| Status | Normative content list for version 1 |
| Related | 01 Vision (P3, P11, P14) · 02 Design System · 04 SRS (catalog requirements CAT-xx) |
This catalog lists **every reusable building block Frame ships with in version 1** — 1254 items across 53 lists. It is a content specification: the SRS defines the systems these items plug into and the rules each item must satisfy; this document names the items. Examples elsewhere in the documentation are illustrations; **this list is the requirement**.
## 0 How to read this catalog

**Identifiers.** Every item has a stable ID of the form `<prefix>.<slug>` (for example `exp.skeptical`, `hair.box-braids`, `prop.mug`). IDs are lowercase, never reused, and are what manifests, projects, the CLI and tests refer to. Display names may be localised later; IDs never change.

**Status.** Every item listed is **v1 — required**. Items are not optional unless the SRS says so. New items added after v1 are appended with a new ID; existing IDs are never repurposed.

**Universal availability rules** (verified by the SRS acceptance suite, see SRS §CAT):

1. **Both style families.** Every visual item exists in *Flat* and *Illustrated* with the same ID, parameters and behaviour; only artwork differs.
2. **All four views.** Every character part, wardrobe item, accessory, hand pose and mouth shape exists for Front, Three-quarter, Side and Back (mirrored for left/right). An item may be declared *view-exempt* for a specific view only with a documented reason (for example, a back view has no visible mouth shape) and the exemption is recorded in its manifest.
3. **Rig contract.** Every character-attached item passes the rig check: anchors present, layering valid, all actions in §F compatible or explicitly declared incompatible with reason.
4. **Manifest.** Every item has a manifest with ID, version, name, category, tags, family support, view support, capabilities, parameters with ranges and defaults, dependencies, preview thumbnails (both families), licence and source/provenance.
5. **Previews.** Every item renders a real thumbnail (not an icon) for the library in both families.
6. **Search.** Every item is findable by name, group, tags and synonyms (synonym list maintained in the manifest).
7. **Licensing.** Every audio, art and font asset has recorded authorship and a licence that permits redistribution with Frame and commercial use of exported videos.

**Item schema (summary).** `id`, `version`, `name`, `category`, `group`, `tags[]`, `synonyms[]`, `families[]`, `views[]`, `viewExemptions{}`, `anchors{}`, `capabilities[]`, `parameters[{key,type,range,default}]`, `dependencies[]`, `layering{}`, `previews{flat,illustrated}`, `license`, `provenance` (authored, AI-assisted with human review, imported). Category-specific fields are defined in SRS §Data model.

## Summary

| Part | List | Prefix | Items |
|---|---|---|---|
| A | A1 Body bases | `body` | 12 |
| A | A2 Life stages | `stage` | 6 |
| A | A3 Head shapes | `head` | 10 |
| A | A3b Face structure controls | `face-ctl` | 10 |
| A | A4 Eye shapes | `eyes` | 14 |
| A | A4b Eye controls | `eye-ctl` | 11 |
| A | A5 Eyebrows | `brow` | 12 |
| A | A6 Noses | `nose` | 12 |
| A | A7 Mouths | `mouth` | 10 |
| A | A8 Ears | `ears` | 8 |
| A | A9 Hairstyles | `hair` | 40 |
| A | A9b Hair controls | `hair-ctl` | 10 |
| A | A10 Fringes | `fringe` | 8 |
| A | A11 Facial hair | `facial-hair` | 15 |
| A | A12 Skin tones | `skin` | 24 |
| A | A13 Skin details and overlays | `skin-detail` | 20 |
| A | A14 Makeup | `makeup` | 12 |
| A | A15 Hand poses | `hand` | 20 |
| A | A16 Feet and footwear bases | `feet` | 5 |
| A | A17 Mouth shapes (lip sync set) | `mouthshape` | 9 |
| A | A18 Eye states | `eyestate` | 10 |
| A | A19 Brow states | `browstate` | 9 |
| A | A20 Identity and access options | `identity` | 12 |
| B | B1 Tops | `top` | 18 |
| B | B2 Outerwear | `outer` | 14 |
| B | B3 Bottoms | `bottom` | 13 |
| B | B4 Dresses and full outfits | `dress` | 14 |
| B | B5 Footwear | `shoe` | 12 |
| B | B6 Fabric patterns | `pattern` | 14 |
| B | B7 Preset looks | `look` | 14 |
| C | C1 Accessories | `acc` | 40 |
| D | D1 Bundled cast | `chr` | 14 |
| E | E1 Expressions | `exp` | 83 |
| E | E2 Facial overlays | `overlay` | 14 |
| F | F1 Performance clips | `act` | 118 |
| G | G1 Performance recipes | `rcp` | 24 |
| H | H1 Props | `prop` | 142 |
| I | I1 Location kits | `kit` | 16 |
| I | I2 Ready-made sets | `set` | 32 |
| I | I3 Environment layers | `layer` | 10 |
| J | J1 Scene atmosphere | `atmo` | 54 |
| K | K1 Motion and visual effects | `fx` | 38 |
| K | K2 Transitions | `tr` | 18 |
| M | M1 Camera language | `cam` | 49 |
| N | N1 Music | `music` | 20 |
| N | N2 Musical cues and stings | `cue` | 12 |
| N | N3 Ambience | `amb` | 20 |
| N | N4 Sound effects | `sfx` | 60 |
| O | O1 Text, graphics and finishing | `txt` | 36 |
| P | P1 Production templates | `tpl` | 16 |
| Q | Q1 Starter voices | `voice` | 16 |
| Q | Q2 Delivery presets | `delivery` | 12 |
| R | R1 Output presets | `out` | 12 |
| | **Total** | | **1254** |

## A Character building blocks

### A1 Body bases (12)

Starting silhouettes. Each sets proportion sliders; all remain adjustable. Every base supports all 4 views and both families.

| ID | Build | Notes |
|---|---|---|
| `body.slim` | Slim | Narrow shoulders and hips |
| `body.average` | Average | Default proportions |
| `body.athletic` | Athletic | Broad shoulders, defined waist |
| `body.broad` | Broad | Wide shoulders and chest |
| `body.stocky` | Stocky | Compact, wide frame, shorter limbs |
| `body.curvy` | Curvy | Defined waist, full hips and bust |
| `body.heavyset` | Heavyset | Large round torso |
| `body.lanky` | Lanky | Long limbs, narrow frame |
| `body.petite` | Petite | Small frame, short stature |
| `body.elderly` | Elderly | Slight stoop, softer posture |
| `body.muscular` | Muscular | Exaggerated upper-body mass |
| `body.pear` | Pear | Narrow shoulders, wide hips |

### A2 Life stages (6)

Set head-to-body ratio and default proportion ranges; combine with any body base.

| ID | Stage | Head-to-body ratio (Flat / Illustrated) |
|---|---|---|
| `stage.toddler` | Toddler | 1:2.5 / 1:4 |
| `stage.child` | Child | 1:3 / 1:5 |
| `stage.teen` | Teen | 1:3.5 / 1:6.5 |
| `stage.young-adult` | Young adult | 1:4 / 1:7 |
| `stage.adult` | Adult | 1:4 / 1:7.5 |
| `stage.senior` | Senior | 1:4 / 1:7 |

### A3 Head shapes (10)

Connect to the shared facial layout; all facial features fit every head shape.

| ID | Shape | Notes |
|---|---|---|
| `head.oval` | Oval | Default |
| `head.round` | Round | Full cheeks, soft jaw |
| `head.square` | Square | Wide, flat jaw |
| `head.angular` | Angular | Strong straight jaw |
| `head.long` | Long | Tall face |
| `head.heart` | Heart | Wide forehead, narrow chin |
| `head.diamond` | Diamond | Wide cheekbones |
| `head.triangle` | Triangle | Narrow forehead, wide jaw |
| `head.pear` | Pear | Full lower face |
| `head.rectangle` | Rectangle | Long with square jaw |

### A3b Face structure controls (10)

Continuous sliders applied to any head shape (0–100, default 50).

| ID | Control | Range |
|---|---|---|
| `face-ctl.face-width` | Face width | Narrow – Wide |
| `face-ctl.face-length` | Face length | Shorter – Longer |
| `face-ctl.jaw-width` | Jaw width | Soft – Defined |
| `face-ctl.chin-shape` | Chin shape | Pointed – Square |
| `face-ctl.chin-length` | Chin length | Short – Long |
| `face-ctl.cheekbone-height` | Cheekbone height | Low – High |
| `face-ctl.cheek-fullness` | Cheek fullness | Hollow – Full |
| `face-ctl.forehead-height` | Forehead height | Low – High |
| `face-ctl.neck-width` | Neck width | Thin – Thick |
| `face-ctl.neck-length` | Neck length | Short – Long |

### A4 Eye shapes (14)

Each includes all eye states (A18) in all views.

| ID | Shape | Notes |
|---|---|---|
| `eyes.almond` | Almond | Default |
| `eyes.round` | Round | Large, open |
| `eyes.hooded` | Hooded | Heavy upper lid |
| `eyes.monolid` | Monolid | No visible crease |
| `eyes.downturned` | Downturned | Outer corners lower |
| `eyes.upturned` | Upturned | Outer corners higher |
| `eyes.narrow` | Narrow | Slim aperture |
| `eyes.wide-set` | Wide-set | Increased spacing preset |
| `eyes.close-set` | Close-set | Decreased spacing preset |
| `eyes.deep-set` | Deep-set | Shadowed lids |
| `eyes.protruding` | Protruding | Prominent eyeball |
| `eyes.sleepy` | Sleepy | Low lid at rest |
| `eyes.large-cartoon` | Large cartoon | Stylised oversized (Flat emphasis) |
| `eyes.dot` | Dot | Minimal dot eyes (Flat emphasis) |

### A4b Eye controls (11)

Sliders and options for any eye shape.

| ID | Control | Range or options |
|---|---|---|
| `eye-ctl.eye-size` | Eye size | Small – Large |
| `eye-ctl.eye-spacing` | Eye spacing | Close – Wide |
| `eye-ctl.eye-tilt` | Eye tilt | Down – Up |
| `eye-ctl.eye-height` | Eye height | Low – High |
| `eye-ctl.iris-size` | Iris size | Small – Large |
| `eye-ctl.iris-colour` | Iris colour | 16 presets plus custom |
| `eye-ctl.pupil-style` | Pupil style | Round, Highlighted, Cartoon |
| `eye-ctl.eyelashes` | Eyelashes | None, Subtle, Defined, Bold |
| `eye-ctl.lower-lash-line` | Lower lash line | On, Off |
| `eye-ctl.eyelid-crease` | Eyelid crease | None, Single, Double |
| `eye-ctl.heterochromia` | Heterochromia | Off, On (independent iris colours) |

### A5 Eyebrows (12)

All brows support every brow state (A19).

| ID | Style | Notes |
|---|---|---|
| `brow.straight` | Straight | Default |
| `brow.soft-arch` | Soft arch | Gentle curve |
| `brow.high-arch` | High arch | Pronounced arch |
| `brow.angled` | Angled | Sharp peak |
| `brow.thick` | Thick | Heavy |
| `brow.thin` | Thin | Fine |
| `brow.bushy` | Bushy | Unruly hairs |
| `brow.unibrow` | Unibrow | Joined |
| `brow.feathered` | Feathered | Brushed-up texture |
| `brow.short` | Short | Stubby |
| `brow.rounded` | Rounded | Curved, even |
| `brow.scarred` | Scarred | Gap through brow |

### A6 Noses (12)

Drawn for all views including true profile.

| ID | Shape | Notes |
|---|---|---|
| `nose.button` | Button | Small, rounded |
| `nose.straight` | Straight | Default |
| `nose.roman` | Roman | Prominent bridge |
| `nose.aquiline` | Aquiline | Curved bridge |
| `nose.snub` | Snub | Short, upturned |
| `nose.wide` | Wide | Broad nostrils |
| `nose.narrow` | Narrow | Slim |
| `nose.hooked` | Hooked | Downturned tip |
| `nose.upturned` | Upturned | Lifted tip |
| `nose.flat` | Flat | Low bridge |
| `nose.long` | Long | Extended |
| `nose.rounded` | Rounded | Bulbous tip |

### A7 Mouths (10)

Each mouth contains the full mouth-shape set (A17) for every view and both families, plus expression variants.

| ID | Shape | Notes |
|---|---|---|
| `mouth.full` | Full | Default |
| `mouth.thin` | Thin | Slim lips |
| `mouth.wide` | Wide | Broad mouth |
| `mouth.small` | Small | Narrow mouth |
| `mouth.bow` | Bow | Pronounced cupid’s bow |
| `mouth.downturned` | Downturned | Corners down at rest |
| `mouth.upturned` | Upturned | Corners up at rest |
| `mouth.asymmetric` | Asymmetric | Lopsided rest |
| `mouth.gap-toothed` | Gap-toothed | Visible gap in smiles |
| `mouth.overbite` | Overbite | Upper teeth visible |

### A8 Ears (8)

Ears declare an earring anchor and hide correctly behind hair layers.

| ID | Shape | Notes |
|---|---|---|
| `ears.small` | Small |  |
| `ears.average` | Average | Default |
| `ears.large` | Large |  |
| `ears.pointed` | Pointed |  |
| `ears.round` | Round |  |
| `ears.attached-lobe` | Attached lobe |  |
| `ears.protruding` | Protruding |  |
| `ears.elf` | Elf | Fantasy |

### A9 Hairstyles (40)

Each hairstyle is drawn front/back layers for 4 views and both families, declares head-shape fit, hat compatibility and physics-free secondary motion (sway) parameters.

| ID | Hairstyle | Group |
|---|---|---|
| `hair.buzz` | Buzz | Short |
| `hair.crew-cut` | Crew cut | Short |
| `hair.crop` | Crop | Short |
| `hair.undercut` | Undercut | Short |
| `hair.fade` | Fade | Short |
| `hair.spiky` | Spiky | Short |
| `hair.slick-back` | Slick back | Short |
| `hair.side-part` | Side part | Short |
| `hair.short-curls` | Short curls | Short |
| `hair.shaved` | Shaved | Short |
| `hair.bob` | Bob | Medium |
| `hair.lob` | Lob | Medium |
| `hair.shag` | Shag | Medium |
| `hair.mop` | Mop | Medium |
| `hair.wavy-medium` | Wavy medium | Medium |
| `hair.mullet` | Mullet | Medium |
| `hair.curtains` | Curtains | Medium |
| `hair.pixie` | Pixie | Medium |
| `hair.afro-medium` | Afro medium | Medium |
| `hair.two-strand-twists` | Two-strand twists | Medium |
| `hair.straight-long` | Straight long | Long |
| `hair.wavy-long` | Wavy long | Long |
| `hair.curly-long` | Curly long | Long |
| `hair.braids` | Braids | Long |
| `hair.box-braids` | Box braids | Long |
| `hair.ponytail` | Ponytail | Long |
| `hair.high-bun` | High bun | Long |
| `hair.low-bun` | Low bun | Long |
| `hair.top-knot` | Top knot | Long |
| `hair.half-up` | Half up | Long |
| `hair.pigtails` | Pigtails | Long |
| `hair.locs` | Locs | Long |
| `hair.cornrows` | Cornrows | Long |
| `hair.afro` | Afro | Long |
| `hair.side-swept-long` | Side swept long | Long |
| `hair.bald` | Bald | Covered or none |
| `hair.receding` | Receding | Covered or none |
| `hair.headwrap` | Headwrap | Covered or none |
| `hair.hijab` | Hijab | Covered or none |
| `hair.durag` | Durag | Covered or none |

### A9b Hair controls (10)

Applies to any hairstyle that declares the control.

| ID | Control | Range or options |
|---|---|---|
| `hair-ctl.volume` | Volume | Close – Full |
| `hair-ctl.length` | Length | Shorter – Longer |
| `hair-ctl.curl-tightness` | Curl tightness | Straight – Coily |
| `hair-ctl.parting` | Parting | Left, Centre, Right, None |
| `hair-ctl.hair-colour` | Hair colour | 16 presets plus custom |
| `hair-ctl.highlight-colour` | Highlight colour | Off or custom |
| `hair-ctl.highlight-amount` | Highlight amount | None – Strong |
| `hair-ctl.greying` | Greying | None – Full |
| `hair-ctl.flyaways` | Flyaways | None – Many |
| `hair-ctl.sway` | Sway | Still – Lively (secondary motion) |

### A10 Fringes (8)

Combine with compatible hairstyles.

| ID | Fringe | Notes |
|---|---|---|
| `fringe.none` | None |  |
| `fringe.straight` | Straight | Blunt |
| `fringe.side-swept` | Side swept |  |
| `fringe.curtain` | Curtain | Parted |
| `fringe.wispy` | Wispy |  |
| `fringe.choppy` | Choppy |  |
| `fringe.curled` | Curled |  |
| `fringe.long-over-eye` | Long over eye | Covers one eye (gaze adapts) |

### A11 Facial hair (15)

Follows jaw and mouth shapes, including speech shapes.

| ID | Style | Notes |
|---|---|---|
| `facial-hair.none` | None |  |
| `facial-hair.stubble` | Stubble |  |
| `facial-hair.short-beard` | Short beard |  |
| `facial-hair.full-beard` | Full beard |  |
| `facial-hair.long-beard` | Long beard |  |
| `facial-hair.goatee` | Goatee |  |
| `facial-hair.van-dyke` | Van Dyke |  |
| `facial-hair.chin-strap` | Chin strap |  |
| `facial-hair.mutton-chops` | Mutton chops |  |
| `facial-hair.moustache` | Moustache |  |
| `facial-hair.handlebar` | Handlebar |  |
| `facial-hair.pencil-moustache` | Pencil moustache |  |
| `facial-hair.horseshoe` | Horseshoe |  |
| `facial-hair.soul-patch` | Soul patch |  |
| `facial-hair.sideburns` | Sideburns |  |

### A12 Skin tones (24)

Twenty-four tones in three undertones, plus custom colour. Each tone defines base, shadow and highlight per family.

| ID | Tone | Undertone |
|---|---|---|
| `skin.porcelain` | Porcelain | Cool |
| `skin.ivory` | Ivory | Neutral |
| `skin.sand` | Sand | Warm |
| `skin.light-beige` | Light beige | Neutral |
| `skin.peach` | Peach | Warm |
| `skin.rose-beige` | Rose beige | Cool |
| `skin.golden` | Golden | Warm |
| `skin.honey` | Honey | Warm |
| `skin.olive-light` | Olive light | Neutral |
| `skin.olive` | Olive | Neutral |
| `skin.tan` | Tan | Warm |
| `skin.caramel` | Caramel | Warm |
| `skin.amber` | Amber | Warm |
| `skin.cinnamon` | Cinnamon | Warm |
| `skin.chestnut` | Chestnut | Neutral |
| `skin.bronze` | Bronze | Warm |
| `skin.sienna` | Sienna | Warm |
| `skin.umber` | Umber | Neutral |
| `skin.mocha` | Mocha | Neutral |
| `skin.espresso` | Espresso | Cool |
| `skin.cocoa` | Cocoa | Warm |
| `skin.ebony` | Ebony | Cool |
| `skin.deep-mahogany` | Deep mahogany | Warm |
| `skin.onyx` | Onyx | Cool |

### A13 Skin details and overlays (20)

Positionable overlays with size and opacity.

| ID | Detail | Notes |
|---|---|---|
| `skin-detail.freckles-light` | Freckles light | Cheeks and nose |
| `skin-detail.freckles-heavy` | Freckles heavy | Face and shoulders |
| `skin-detail.moles` | Moles |  |
| `skin-detail.beauty-mark` | Beauty mark |  |
| `skin-detail.forehead-lines` | Forehead lines | Ageing |
| `skin-detail.crows-feet` | Crow’s feet | Ageing |
| `skin-detail.smile-lines` | Smile lines | Ageing |
| `skin-detail.under-eye-bags` | Under-eye bags |  |
| `skin-detail.scar-straight` | Scar straight |  |
| `skin-detail.scar-curved` | Scar curved |  |
| `skin-detail.scar-cheek` | Scar cheek |  |
| `skin-detail.vitiligo-pattern` | Vitiligo pattern | Multiple layouts |
| `skin-detail.birthmark` | Birthmark |  |
| `skin-detail.acne` | Acne |  |
| `skin-detail.rosy-cheeks` | Rosy cheeks |  |
| `skin-detail.tattoo-slot-face` | Tattoo slot face | Accepts imported art |
| `skin-detail.tattoo-slot-neck` | Tattoo slot neck | Accepts imported art |
| `skin-detail.tattoo-slot-arms` | Tattoo slot arms | Accepts imported art |
| `skin-detail.body-hair` | Body hair | Arms and chest, density control |
| `skin-detail.dimples` | Dimples | Visible when smiling |

### A14 Makeup (12)

Colour and intensity controls; follows expressions.

| ID | Item | Notes |
|---|---|---|
| `makeup.eyeliner` | Eyeliner |  |
| `makeup.winged-liner` | Winged liner |  |
| `makeup.eyeshadow` | Eyeshadow |  |
| `makeup.mascara` | Mascara |  |
| `makeup.lipstick` | Lipstick |  |
| `makeup.lip-gloss` | Lip gloss |  |
| `makeup.blush` | Blush |  |
| `makeup.contour` | Contour |  |
| `makeup.bold-brows` | Bold brows |  |
| `makeup.glitter` | Glitter |  |
| `makeup.stage-makeup` | Stage makeup |  |
| `makeup.face-paint` | Face paint | Pattern library slot |

### A15 Hand poses (20)

Every hand set provides these poses for left and right hands in all 4 views and both families. Gloves and nails are overlays.

| ID | Pose | Use |
|---|---|---|
| `hand.relaxed` | Relaxed | Rest |
| `hand.open-palm` | Open palm | Presenting, explaining |
| `hand.fist` | Fist | Emphasis, anger |
| `hand.point` | Point | Pointing |
| `hand.thumbs-up` | Thumbs up | Approval |
| `hand.thumbs-down` | Thumbs down | Disapproval |
| `hand.peace` | Peace | Emblem |
| `hand.ok` | OK | Emblem |
| `hand.grip` | Grip | Holding props |
| `hand.pinch` | Pinch | Small props |
| `hand.wave-flat` | Wave flat | Waving |
| `hand.count-one` | Count one | Counting |
| `hand.count-two` | Count two | Counting |
| `hand.count-three` | Count three | Counting |
| `hand.count-four` | Count four | Counting |
| `hand.count-five` | Count five | Counting |
| `hand.clasped` | Clasped | Hands together |
| `hand.cupped` | Cupped | Holding small things |
| `hand.typing` | Typing | Keyboard |
| `hand.phone-hold` | Phone hold | Phone |

### A16 Feet and footwear bases (5)

Footwear shapes the wardrobe draws on top of; all walk and stand actions support each.

| ID | Base | Notes |
|---|---|---|
| `feet.barefoot` | Barefoot |  |
| `feet.flat` | Flat | Default |
| `feet.heel` | Heel | Raised heel posture |
| `feet.boot` | Boot |  |
| `feet.sneaker` | Sneaker |  |

### A17 Mouth shapes (lip sync set) (9)

The standard set every mouth provides. Letters follow the widely used 2D convention so external tools interoperate.

| ID | Shape | Phonemes / meaning |
|---|---|---|
| `mouthshape.x-rest` | X rest | Silence, mouth at rest |
| `mouthshape.a-closed` | A closed | M, B, P |
| `mouthshape.b-slightly-open` | B slightly open | K, S, T, EE and most consonants |
| `mouthshape.c-open` | C open | EH, AE |
| `mouthshape.d-wide-open` | D wide open | AA, AH |
| `mouthshape.e-rounded` | E rounded | AO, ER |
| `mouthshape.f-puckered` | F puckered | UW, OW, W |
| `mouthshape.g-teeth-on-lip` | G teeth on lip | F, V |
| `mouthshape.h-tongue-up` | H tongue up | L, TH |

### A18 Eye states (10)

Control states blended by expressions and blinks.

| ID | State | Notes |
|---|---|---|
| `eyestate.open` | Open | Default |
| `eyestate.wide` | Wide | Surprise, fear |
| `eyestate.narrowed` | Narrowed | Suspicion, anger |
| `eyestate.squint` | Squint | Smile, bright light |
| `eyestate.half-closed` | Half closed | Tired, bored |
| `eyestate.closed` | Closed | Blink, joy |
| `eyestate.closed-happy` | Closed happy | Arched closed eyes |
| `eyestate.wink-left` | Wink left |  |
| `eyestate.wink-right` | Wink right |  |
| `eyestate.looking-down` | Looking down | Lids follow gaze |

### A19 Brow states (9)

Control states blended by expressions.

| ID | State | Notes |
|---|---|---|
| `browstate.neutral` | Neutral |  |
| `browstate.raised` | Raised | Surprise |
| `browstate.lowered` | Lowered | Anger, focus |
| `browstate.inner-raised` | Inner raised | Worry, sadness |
| `browstate.inner-lowered` | Inner lowered | Anger |
| `browstate.one-raised-left` | One raised left | Skepticism |
| `browstate.one-raised-right` | One raised right | Skepticism |
| `browstate.furrowed` | Furrowed | Concentration |
| `browstate.relaxed` | Relaxed | Contentment |

### A20 Identity and access options (12)

First-class options available to every character family.

| ID | Option | Notes |
|---|---|---|
| `identity.wheelchair` | Wheelchair | Seated rig variant with push and roll actions |
| `identity.walking-cane` | Walking cane | Prop with walk variant |
| `identity.crutches` | Crutches | Walk variant |
| `identity.hearing-aid` | Hearing aid | Ear overlay |
| `identity.cochlear-implant` | Cochlear implant | Ear overlay |
| `identity.prosthetic-arm` | Prosthetic arm | Arm variant |
| `identity.prosthetic-leg` | Prosthetic leg | Leg variant |
| `identity.glasses-prescription` | Glasses (prescription) | See Accessories |
| `identity.guide-dog-companion` | Guide dog companion | Prop character, follows owner |
| `identity.visible-pregnancy` | Visible pregnancy | Body variant |
| `identity.albinism-palette` | Albinism palette | Skin, hair, brow and lash palette |
| `identity.limb-difference` | Limb difference | Arm and hand variants |

## B Wardrobe

### B1 Tops (18)

Garments follow the rig; each declares layering, sleeve length and pattern support.

| ID | Garment | Notes |
|---|---|---|
| `top.t-shirt` | T-shirt | Short sleeve |
| `top.long-sleeve-tee` | Long-sleeve tee |  |
| `top.v-neck-tee` | V-neck tee |  |
| `top.tank-top` | Tank top |  |
| `top.polo` | Polo |  |
| `top.button-up-shirt` | Button-up shirt | Sleeves rolled option |
| `top.blouse` | Blouse |  |
| `top.ribbed-sweater` | Ribbed sweater |  |
| `top.crewneck-sweater` | Crewneck sweater |  |
| `top.turtleneck` | Turtleneck |  |
| `top.cardigan` | Cardigan | Open or buttoned |
| `top.hoodie` | Hoodie | Hood up or down |
| `top.sweatshirt` | Sweatshirt |  |
| `top.crop-top` | Crop top |  |
| `top.graphic-tee` | Graphic tee | Print slot |
| `top.henley` | Henley |  |
| `top.flannel-shirt` | Flannel shirt |  |
| `top.uniform-shirt` | Uniform shirt | Badge slot |

### B2 Outerwear (14)

Layers over tops; open or closed states where applicable.

| ID | Garment | Notes |
|---|---|---|
| `outer.blazer` | Blazer |  |
| `outer.suit-jacket` | Suit jacket |  |
| `outer.denim-jacket` | Denim jacket |  |
| `outer.leather-jacket` | Leather jacket |  |
| `outer.bomber-jacket` | Bomber jacket |  |
| `outer.parka` | Parka | Hood option |
| `outer.trench-coat` | Trench coat |  |
| `outer.raincoat` | Raincoat |  |
| `outer.puffer-jacket` | Puffer jacket |  |
| `outer.vest` | Vest |  |
| `outer.lab-coat` | Lab coat |  |
| `outer.apron` | Apron |  |
| `outer.hi-vis-vest` | Hi-vis vest |  |
| `outer.cape` | Cape |  |

### B3 Bottoms (13)

Leg variants follow sitting, walking and kneeling.

| ID | Garment | Notes |
|---|---|---|
| `bottom.trousers` | Trousers |  |
| `bottom.jeans` | Jeans |  |
| `bottom.chinos` | Chinos |  |
| `bottom.cargo-pants` | Cargo pants |  |
| `bottom.joggers` | Joggers |  |
| `bottom.shorts` | Shorts |  |
| `bottom.skirt` | Skirt |  |
| `bottom.pencil-skirt` | Pencil skirt |  |
| `bottom.pleated-skirt` | Pleated skirt |  |
| `bottom.long-skirt` | Long skirt |  |
| `bottom.leggings` | Leggings |  |
| `bottom.suit-trousers` | Suit trousers |  |
| `bottom.overalls` | Overalls | Includes bib |

### B4 Dresses and full outfits (14)

Single garments replacing top and bottom.

| ID | Garment | Notes |
|---|---|---|
| `dress.casual-dress` | Casual dress |  |
| `dress.shirt-dress` | Shirt dress |  |
| `dress.wrap-dress` | Wrap dress |  |
| `dress.evening-gown` | Evening gown |  |
| `dress.sundress` | Sundress |  |
| `dress.jumpsuit` | Jumpsuit |  |
| `dress.business-suit` | Business suit | Jacket and trousers or skirt |
| `dress.tracksuit` | Tracksuit |  |
| `dress.hospital-scrubs` | Hospital scrubs |  |
| `dress.pyjamas` | Pyjamas |  |
| `dress.robe` | Robe |  |
| `dress.kurta` | Kurta |  |
| `dress.abaya` | Abaya |  |
| `dress.kimono-style-robe` | Kimono-style robe |  |

### B5 Footwear (12)

| ID | Footwear | Base |
|---|---|---|
| `shoe.canvas-sneakers` | Canvas sneakers | Sneaker |
| `shoe.running-shoes` | Running shoes | Sneaker |
| `shoe.loafers` | Loafers | Flat |
| `shoe.oxfords` | Oxfords | Flat |
| `shoe.ballet-flats` | Ballet flats | Flat |
| `shoe.sandals` | Sandals | Flat |
| `shoe.slippers` | Slippers | Flat |
| `shoe.ankle-boots` | Ankle boots | Boot |
| `shoe.knee-boots` | Knee boots | Boot |
| `shoe.work-boots` | Work boots | Boot |
| `shoe.heels` | Heels | Heel |
| `shoe.wedges` | Wedges | Heel |

### B6 Fabric patterns (14)

Apply to garments that declare pattern support; scale and colours adjustable.

| ID | Pattern | Notes |
|---|---|---|
| `pattern.solid` | Solid | Default |
| `pattern.stripes` | Stripes |  |
| `pattern.pinstripe` | Pinstripe |  |
| `pattern.checks` | Checks |  |
| `pattern.plaid` | Plaid |  |
| `pattern.houndstooth` | Houndstooth |  |
| `pattern.polka-dots` | Polka dots |  |
| `pattern.floral` | Floral |  |
| `pattern.camouflage` | Camouflage |  |
| `pattern.denim-texture` | Denim texture |  |
| `pattern.knit-texture` | Knit texture |  |
| `pattern.leopard` | Leopard |  |
| `pattern.paisley` | Paisley |  |
| `pattern.custom-print` | Custom print | Imported image |

### B7 Preset looks (14)

Named garment combinations usable on any character as a starting look.

| ID | Look | Contents |
|---|---|---|
| `look.everyday` | Everyday | Tee, jeans, sneakers |
| `look.on-air` | On-air | Sweater, trousers, sneakers |
| `look.office` | Office | Button-up, chinos, loafers |
| `look.executive` | Executive | Suit, oxfords |
| `look.evening` | Evening | Blazer or gown, heels or oxfords |
| `look.sporty` | Sporty | Tracksuit, running shoes |
| `look.outdoor` | Outdoor | Parka, cargo pants, boots |
| `look.student` | Student | Hoodie, jeans, backpack |
| `look.teacher` | Teacher | Cardigan, chinos, glasses |
| `look.doctor` | Doctor | Scrubs, lab coat |
| `look.barista` | Barista | Tee, apron, sneakers |
| `look.news-anchor` | News anchor | Blazer, blouse, slacks |
| `look.sleepwear` | Sleepwear | Pyjamas, slippers |
| `look.rainy-day` | Rainy day | Raincoat, boots, umbrella prop |

## C Accessories

### C1 Accessories (40)

Attach to rig anchors (head, ears, neck, wrists, hands, back, waist) and follow every view.

| ID | Accessory | Anchor |
|---|---|---|
| `acc.round-glasses` | Round glasses | Face |
| `acc.rectangular-glasses` | Rectangular glasses | Face |
| `acc.cat-eye-glasses` | Cat-eye glasses | Face |
| `acc.sunglasses` | Sunglasses | Face |
| `acc.reading-glasses-on-nose` | Reading glasses on nose | Face |
| `acc.monocle` | Monocle | Face |
| `acc.baseball-cap` | Baseball cap | Head |
| `acc.beanie` | Beanie | Head |
| `acc.fedora` | Fedora | Head |
| `acc.sun-hat` | Sun hat | Head |
| `acc.hard-hat` | Hard hat | Head |
| `acc.headband` | Headband | Head |
| `acc.bandana` | Bandana | Head |
| `acc.headphones` | Headphones | Head |
| `acc.headset-with-mic` | Headset with mic | Head |
| `acc.earbuds` | Earbuds | Ears |
| `acc.stud-earrings` | Stud earrings | Ears |
| `acc.hoop-earrings` | Hoop earrings | Ears |
| `acc.drop-earrings` | Drop earrings | Ears |
| `acc.necklace-chain` | Necklace chain | Neck |
| `acc.pendant` | Pendant | Neck |
| `acc.scarf` | Scarf | Neck |
| `acc.tie` | Tie | Neck |
| `acc.bow-tie` | Bow tie | Neck |
| `acc.lanyard-badge` | Lanyard badge | Neck |
| `acc.wristwatch` | Wristwatch | Wrist |
| `acc.smartwatch` | Smartwatch | Wrist |
| `acc.bracelet` | Bracelet | Wrist |
| `acc.rings` | Rings | Hand |
| `acc.gloves` | Gloves | Hand |
| `acc.backpack` | Backpack | Back |
| `acc.messenger-bag` | Messenger bag | Shoulder |
| `acc.tote-bag` | Tote bag | Shoulder |
| `acc.handbag` | Handbag | Hand |
| `acc.belt` | Belt | Waist |
| `acc.face-mask` | Face mask | Face |
| `acc.nose-ring` | Nose ring | Face |
| `acc.lip-piercing` | Lip piercing | Face |
| `acc.eyebrow-piercing` | Eyebrow piercing | Face |
| `acc.hair-clip` | Hair clip | Head |

## D Bundled cast

### D1 Bundled cast (14)

Ready-made characters available in both families, each with three looks and a designed voice (Q1). Names and lines are content only; no engine logic depends on them.

| ID | Character | Description |
|---|---|---|
| `chr.maya-bennett` | Maya Bennett | Curious podcast host, late 20s |
| `chr.leo-park` | Leo Park | Dry-witted co-host, early 30s |
| `chr.sam-ortiz` | Sam Ortiz | Calm presenter for explainers, 40s |
| `chr.priya-nair` | Priya Nair | Energetic teacher, 30s |
| `chr.jonah-reed` | Jonah Reed | Teenage student, 16 |
| `chr.grace-okafor` | Grace Okafor | Retired engineer, 70s |
| `chr.theo-lambert` | Theo Lambert | Barista and aspiring comic, 20s |
| `chr.aiko-tanaka` | Aiko Tanaka | Product designer, 30s |
| `chr.marcus-hale` | Marcus Hale | News anchor, 50s |
| `chr.luc-a-ferreira` | Lucía Ferreira | Doctor, 40s |
| `chr.ben-carter` | Ben Carter | Child, 9 |
| `chr.nadia-haddad` | Nadia Haddad | Startup founder, 30s, wears hijab |
| `chr.ravi-shah` | Ravi Shah | Wheelchair user, game streamer, 20s |
| `chr.elena-novak` | Elena Novak | Detective, 40s |

## E Expressions and facial overlays

### E1 Expressions (83)

Each preset sets eye state, brow state, mouth expression, gaze tendency, optional overlay and default intensity; all have intensity (0–100) and transition time and remain editable per clip. Expressions cooperate with lip sync (mouth shape plus expression curvature).

| ID | Expression | Group |
|---|---|---|
| `exp.content` | Content | Positive |
| `exp.smile` | Smile | Positive |
| `exp.big-grin` | Big grin | Positive |
| `exp.laugh` | Laugh | Positive |
| `exp.giggle` | Giggle | Positive |
| `exp.delighted` | Delighted | Positive |
| `exp.proud` | Proud | Positive |
| `exp.smug` | Smug | Positive |
| `exp.relieved` | Relieved | Positive |
| `exp.amused` | Amused | Positive |
| `exp.loving` | Loving | Positive |
| `exp.grateful` | Grateful | Positive |
| `exp.excited` | Excited | Positive |
| `exp.starstruck` | Starstruck | Positive |
| `exp.sad` | Sad | Sad |
| `exp.teary` | Teary | Sad |
| `exp.crying` | Crying | Sad |
| `exp.sobbing` | Sobbing | Sad |
| `exp.disappointed` | Disappointed | Sad |
| `exp.hurt` | Hurt | Sad |
| `exp.lonely` | Lonely | Sad |
| `exp.ashamed` | Ashamed | Sad |
| `exp.guilty` | Guilty | Sad |
| `exp.defeated` | Defeated | Sad |
| `exp.annoyed` | Annoyed | Anger |
| `exp.irritated` | Irritated | Anger |
| `exp.frustrated` | Frustrated | Anger |
| `exp.angry` | Angry | Anger |
| `exp.furious` | Furious | Anger |
| `exp.seething` | Seething | Anger |
| `exp.indignant` | Indignant | Anger |
| `exp.contemptuous` | Contemptuous | Anger |
| `exp.nervous` | Nervous | Fear and stress |
| `exp.anxious` | Anxious | Fear and stress |
| `exp.worried` | Worried | Fear and stress |
| `exp.scared` | Scared | Fear and stress |
| `exp.terrified` | Terrified | Fear and stress |
| `exp.panicked` | Panicked | Fear and stress |
| `exp.uneasy` | Uneasy | Fear and stress |
| `exp.sheepish` | Sheepish | Fear and stress |
| `exp.surprised` | Surprised | Surprise |
| `exp.shocked` | Shocked | Surprise |
| `exp.stunned` | Stunned | Surprise |
| `exp.gasp` | Gasp | Surprise |
| `exp.double-take-face` | Double-take face | Surprise |
| `exp.jaw-drop` | Jaw drop | Surprise |
| `exp.thinking` | Thinking | Thinking |
| `exp.confused` | Confused | Thinking |
| `exp.puzzled` | Puzzled | Thinking |
| `exp.skeptical` | Skeptical | Thinking |
| `exp.suspicious` | Suspicious | Thinking |
| `exp.doubtful` | Doubtful | Thinking |
| `exp.calculating` | Calculating | Thinking |
| `exp.eureka` | Eureka | Thinking |
| `exp.embarrassed` | Embarrassed | Social |
| `exp.flustered` | Flustered | Social |
| `exp.awkward` | Awkward | Social |
| `exp.shy` | Shy | Social |
| `exp.flirty` | Flirty | Social |
| `exp.teasing` | Teasing | Social |
| `exp.sarcastic` | Sarcastic | Social |
| `exp.polite-smile` | Polite smile | Social |
| `exp.fake-smile` | Fake smile | Social |
| `exp.eye-roll` | Eye roll | Social |
| `exp.bored` | Bored | Low energy |
| `exp.tired` | Tired | Low energy |
| `exp.sleepy` | Sleepy | Low energy |
| `exp.unimpressed` | Unimpressed | Low energy |
| `exp.deadpan` | Deadpan | Low energy |
| `exp.zoned-out` | Zoned out | Low energy |
| `exp.raised-eyebrow` | Raised eyebrow | Subtle reaction |
| `exp.slight-frown` | Slight frown | Subtle reaction |
| `exp.lip-press` | Lip press | Subtle reaction |
| `exp.half-smile` | Half smile | Subtle reaction |
| `exp.nose-wrinkle` | Nose wrinkle | Subtle reaction |
| `exp.squint` | Squint | Subtle reaction |
| `exp.blink-pause` | Blink pause | Subtle reaction |
| `exp.side-eye` | Side eye | Subtle reaction |
| `exp.disgusted` | Disgusted | Other |
| `exp.determined` | Determined | Other |
| `exp.focused` | Focused | Other |
| `exp.dreamy` | Dreamy | Other |
| `exp.mischievous` | Mischievous | Other |

### E2 Facial overlays (14)

Attach to the face and follow head turns; usable inside expressions or as separate effect clips.

| ID | Overlay | Notes |
|---|---|---|
| `overlay.blush` | Blush |  |
| `overlay.heavy-blush` | Heavy blush |  |
| `overlay.tears` | Tears |  |
| `overlay.tear-streams` | Tear streams |  |
| `overlay.sweat-drop` | Sweat drop |  |
| `overlay.stress-lines` | Stress lines |  |
| `overlay.anger-vein` | Anger vein |  |
| `overlay.shadowed-eyes` | Shadowed eyes | Gloom |
| `overlay.sparkle-eyes` | Sparkle eyes |  |
| `overlay.heart-eyes` | Heart eyes |  |
| `overlay.dizzy-eyes` | Dizzy eyes | Spirals |
| `overlay.sick-green` | Sick green |  |
| `overlay.pale` | Pale |  |
| `overlay.steam-from-ears` | Steam from ears |  |

## F Performance clips

### F1 Performance clips (118)

Each action declares channels it drives (root, posture, torso, head, arms, hands, face), supported views and postures, loop behaviour, default duration, parameters (targets, intensity, speed, hand) and blend rules.

| ID | Action | Group |
|---|---|---|
| `act.breathe` | Breathe | Idle |
| `act.shift-weight` | Shift weight | Idle |
| `act.look-around` | Look around | Idle |
| `act.fidget-hands` | Fidget hands | Idle |
| `act.tap-foot` | Tap foot | Idle |
| `act.arms-crossed` | Arms crossed | Idle |
| `act.hands-in-pockets` | Hands in pockets | Idle |
| `act.seated-relaxed` | Seated relaxed | Idle |
| `act.seated-lean-in` | Seated lean in | Idle |
| `act.impatient` | Impatient | Idle |
| `act.calm-talk` | Calm talk | Talking |
| `act.emphatic-talk` | Emphatic talk | Talking |
| `act.explain-with-hands` | Explain with hands | Talking |
| `act.list-on-fingers` | List on fingers | Talking |
| `act.beat-gesture` | Beat gesture | Talking |
| `act.open-palms` | Open palms | Talking |
| `act.hand-to-chest` | Hand to chest | Talking |
| `act.chopping-emphasis` | Chopping emphasis | Talking |
| `act.rolling-hand` | Rolling hand | Talking |
| `act.presenting` | Presenting | Talking |
| `act.storytelling-sweep` | Storytelling sweep | Talking |
| `act.whisper-lean` | Whisper lean | Talking |
| `act.rant` | Rant | Talking |
| `act.counter-argument` | Counter argument | Talking |
| `act.point-at` | Point at | Deictic |
| `act.point-up` | Point up | Deictic |
| `act.point-away` | Point away | Deictic |
| `act.point-at-self` | Point at self | Deictic |
| `act.beckon` | Beckon | Deictic |
| `act.gesture-toward` | Gesture toward | Deictic |
| `act.direct-over-there` | Direct over there | Deictic |
| `act.thumb-over-shoulder` | Thumb over shoulder | Deictic |
| `act.wave-hello` | Wave hello | Emblem |
| `act.wave-goodbye` | Wave goodbye | Emblem |
| `act.thumbs-up` | Thumbs up | Emblem |
| `act.thumbs-down` | Thumbs down | Emblem |
| `act.ok-sign` | OK sign | Emblem |
| `act.shush` | Shush | Emblem |
| `act.salute` | Salute | Emblem |
| `act.peace-sign` | Peace sign | Emblem |
| `act.facepalm` | Facepalm | Emblem |
| `act.shrug` | Shrug | Emblem |
| `act.cross-fingers` | Cross fingers | Emblem |
| `act.fist-pump` | Fist pump | Emblem |
| `act.nod` | Nod | Listening |
| `act.slow-nod` | Slow nod | Listening |
| `act.head-shake` | Head shake | Listening |
| `act.head-tilt` | Head tilt | Listening |
| `act.mm-hmm` | Mm-hmm | Listening |
| `act.lean-back` | Lean back | Listening |
| `act.chin-rest` | Chin rest | Listening |
| `act.take-notes` | Take notes | Listening |
| `act.follow-speaker` | Follow speaker | Listening |
| `act.hold-back-laugh` | Hold back laugh | Listening |
| `act.double-take` | Double take | Reaction |
| `act.flinch` | Flinch | Reaction |
| `act.recoil` | Recoil | Reaction |
| `act.jump-scare` | Jump scare | Reaction |
| `act.gasp-with-hands` | Gasp with hands | Reaction |
| `act.laugh` | Laugh | Reaction |
| `act.belly-laugh` | Belly laugh | Reaction |
| `act.cringe` | Cringe | Reaction |
| `act.head-in-hands` | Head in hands | Reaction |
| `act.slump` | Slump | Reaction |
| `act.celebrate` | Celebrate | Reaction |
| `act.spit-take` | Spit take | Reaction |
| `act.collapse-onto-table` | Collapse onto table | Reaction |
| `act.freeze` | Freeze | Reaction |
| `act.chin-stroke` | Chin stroke | Thinking |
| `act.scratch-head` | Scratch head | Thinking |
| `act.look-up-thinking` | Look up thinking | Thinking |
| `act.tap-temple` | Tap temple | Thinking |
| `act.pace-thinking` | Pace thinking | Thinking |
| `act.eureka-point` | Eureka point | Thinking |
| `act.look-at` | Look at | Gaze |
| `act.look-away` | Look away | Gaze |
| `act.glance-and-return` | Glance and return | Gaze |
| `act.avoid-eye-contact` | Avoid eye contact | Gaze |
| `act.scan-room` | Scan room | Gaze |
| `act.stare-down` | Stare down | Gaze |
| `act.walk` | Walk | Locomotion |
| `act.brisk-walk` | Brisk walk | Locomotion |
| `act.sneak` | Sneak | Locomotion |
| `act.run` | Run | Locomotion |
| `act.stroll` | Stroll | Locomotion |
| `act.limp` | Limp | Locomotion |
| `act.march` | March | Locomotion |
| `act.enter` | Enter | Locomotion |
| `act.exit` | Exit | Locomotion |
| `act.turn-around` | Turn around | Locomotion |
| `act.stop-and-look` | Stop and look | Locomotion |
| `act.trip` | Trip | Locomotion |
| `act.sit-down` | Sit down | Posture |
| `act.stand-up` | Stand up | Posture |
| `act.lean-on-surface` | Lean on surface | Posture |
| `act.crouch` | Crouch | Posture |
| `act.kneel` | Kneel | Posture |
| `act.lie-down` | Lie down | Posture |
| `act.get-up` | Get up | Posture |
| `act.slouch` | Slouch | Posture |
| `act.hold` | Hold | Object |
| `act.pick-up` | Pick up | Object |
| `act.put-down` | Put down | Object |
| `act.drink-from-mug` | Drink from mug | Object |
| `act.type` | Type | Object |
| `act.use-phone` | Use phone | Object |
| `act.read` | Read | Object |
| `act.write` | Write | Object |
| `act.hand-over` | Hand over | Object |
| `act.receive` | Receive | Object |
| `act.open-door` | Open door | Object |
| `act.close-door` | Close door | Object |
| `act.adjust-glasses` | Adjust glasses | Object |
| `act.press-button` | Press button | Object |
| `act.push-wheelchair` | Push wheelchair | Access |
| `act.roll-forward` | Roll forward | Access |
| `act.sign-hello` | Sign hello | Access |
| `act.sign-thank-you` | Sign thank you | Access |

## G Performance recipes

### G1 Performance recipes (24)

Recipes expand into ordinary editable clips with timing relationships. Multi-character recipes assign roles when applied.

| ID | Recipe | Expands to |
|---|---|---|
| `rcp.embarrassed-reply` | Embarrassed reply | Look away, pause, blush, quiet line, glance back |
| `rcp.reveal-an-object` | Reveal an object | Hold below frame, raise, look to listener, pause |
| `rcp.question-and-reaction` | Question and reaction | Ask, listener raises brow, cut to listener |
| `rcp.interruption` | Interruption | Speaker cut off mid-line, interrupter leans in, speaker reacts |
| `rcp.awkward-silence` | Awkward silence | Both freeze, side eyes, ambient swell, one clears throat |
| `rcp.agree-and-disagree` | Agree and disagree | Nod vs head shake with cross-cut |
| `rcp.handshake` | Handshake | Approach, extend, shake, release |
| `rcp.hug` | Hug | Approach, embrace, hold, release |
| `rcp.high-five` | High five | Raise, slap with impact effect, sound cue |
| `rcp.hand-over-object` | Hand over object | Offer, receive, both look at object |
| `rcp.comedic-beat` | Comedic beat | Snap zoom, freeze 6 frames, sting cue |
| `rcp.dramatic-reveal` | Dramatic reveal | Slow push in, silence, reaction close-up |
| `rcp.double-take-gag` | Double take gag | Glance, look away, snap back, shocked face |
| `rcp.victory-moment` | Victory moment | Fist pump, cheer sound, confetti |
| `rcp.sad-realisation` | Sad realisation | Smile fades, look down, music drops |
| `rcp.nervous-answer` | Nervous answer | Fidget, glance away, stammered pause, half smile |
| `rcp.sarcastic-reply` | Sarcastic reply | Eye roll, deadpan line, raised eyebrow |
| `rcp.thinking-out-loud` | Thinking out loud | Look up, chin stroke, eureka point |
| `rcp.entrance` | Entrance | Enter from side, stop, look to camera, wave |
| `rcp.exit-in-a-huff` | Exit in a huff | Turn, march off, door slam sound |
| `rcp.listen-and-nod` | Listen and nod | Follow speaker, periodic nods and blinks |
| `rcp.explain-a-point` | Explain a point | Presenting gesture, list on fingers, point to graphic |
| `rcp.phone-call` | Phone call | Pick up phone, talk to phone, hang up |
| `rcp.coffee-break` | Coffee break | Pick up mug, drink, sigh, put down |

## H Props and interactive objects

### H1 Props (142)

Static, animated or interactive. Interactive props declare states, grip anchors, compatible actions, sound cues and layering against characters.

| ID | Prop | Category · type |
|---|---|---|
| `prop.round-table` | Round table | Furniture · static |
| `prop.desk` | Desk | Furniture · static |
| `prop.office-chair` | Office chair | Furniture · interactive (seat anchor, swivel) |
| `prop.studio-chair` | Studio chair | Furniture · interactive (seat anchor) |
| `prop.armchair` | Armchair | Furniture · interactive (seat anchor) |
| `prop.sofa` | Sofa | Furniture · interactive (3 seat anchors) |
| `prop.stool` | Stool | Furniture · interactive (seat anchor) |
| `prop.bench` | Bench | Furniture · interactive (seat anchors) |
| `prop.bed` | Bed | Furniture · interactive (lie anchor) |
| `prop.bookshelf` | Bookshelf | Furniture · static |
| `prop.cabinet` | Cabinet | Furniture · interactive (open/closed) |
| `prop.coffee-table` | Coffee table | Furniture · static |
| `prop.kitchen-counter` | Kitchen counter | Furniture · static |
| `prop.bar-stool` | Bar stool | Furniture · interactive (seat anchor) |
| `prop.lectern` | Lectern | Furniture · static |
| `prop.whiteboard` | Whiteboard | Furniture · interactive (writable surface) |
| `prop.classroom-desk` | Classroom desk | Furniture · interactive (seat anchor) |
| `prop.dining-table` | Dining table | Furniture · static |
| `prop.wardrobe` | Wardrobe | Furniture · interactive (open/closed) |
| `prop.reception-desk` | Reception desk | Furniture · static |
| `prop.desk-microphone` | Desk microphone | Tech · animated (indicator light) |
| `prop.boom-microphone` | Boom microphone | Tech · static |
| `prop.podcast-headphones` | Podcast headphones | Tech · wearable |
| `prop.laptop` | Laptop | Tech · interactive (open/closed, screen content) |
| `prop.desktop-monitor` | Desktop monitor | Tech · animated (screen content) |
| `prop.phone` | Phone | Tech · interactive (screen on/off, ringing) |
| `prop.tablet` | Tablet | Tech · interactive (screen content) |
| `prop.tv` | TV | Tech · animated (screen content) |
| `prop.camera-on-tripod` | Camera on tripod | Tech · static |
| `prop.ring-light` | Ring light | Tech · animated (on/off) |
| `prop.game-controller` | Game controller | Tech · interactive (grip) |
| `prop.keyboard` | Keyboard | Tech · interactive (typing target) |
| `prop.speaker` | Speaker | Tech · animated (pulse) |
| `prop.radio` | Radio | Tech · animated |
| `prop.projector-screen` | Projector screen | Tech · animated (content) |
| `prop.mug` | Mug | Kitchen · interactive (grip, full/empty, steam) |
| `prop.coffee-cup-to-go` | Coffee cup to go | Kitchen · interactive (grip) |
| `prop.water-glass` | Water glass | Kitchen · interactive (grip, full/empty) |
| `prop.wine-glass` | Wine glass | Kitchen · interactive (grip) |
| `prop.plate-of-food` | Plate of food | Kitchen · interactive (full/eaten) |
| `prop.coffee-machine` | Coffee machine | Kitchen · animated (steam, sound) |
| `prop.kettle` | Kettle | Kitchen · animated (steam, whistle) |
| `prop.toaster` | Toaster | Kitchen · animated (pop, sound) |
| `prop.fridge` | Fridge | Kitchen · interactive (open/closed, light) |
| `prop.cereal-box` | Cereal box | Kitchen · interactive (grip) |
| `prop.pizza-box` | Pizza box | Kitchen · interactive (open/closed) |
| `prop.fruit-bowl` | Fruit bowl | Kitchen · static |
| `prop.book` | Book | Office · interactive (grip, open/closed) |
| `prop.notebook` | Notebook | Office · interactive (grip, open/closed) |
| `prop.pen` | Pen | Office · interactive (pinch) |
| `prop.clipboard` | Clipboard | Office · interactive (grip) |
| `prop.folder` | Folder | Office · interactive (grip, open/closed) |
| `prop.stack-of-papers` | Stack of papers | Office · static |
| `prop.envelope` | Envelope | Office · interactive (grip, sealed/open) |
| `prop.briefcase` | Briefcase | Office · interactive (grip, open/closed) |
| `prop.calculator` | Calculator | Office · interactive |
| `prop.stapler` | Stapler | Office · interactive (sound) |
| `prop.desk-lamp` | Desk lamp | Office · animated (on/off, light) |
| `prop.wall-clock` | Wall clock | Office · animated (hands) |
| `prop.calendar` | Calendar | Office · static |
| `prop.sticky-notes` | Sticky notes | Office · static |
| `prop.trophy` | Trophy | Office · interactive (grip) |
| `prop.potted-plant` | Potted plant | Decor · animated (sway) |
| `prop.large-plant` | Large plant | Decor · animated (sway) |
| `prop.flower-vase` | Flower vase | Decor · static |
| `prop.picture-frame` | Picture frame | Decor · interactive (image slot) |
| `prop.poster` | Poster | Decor · interactive (image slot) |
| `prop.neon-sign` | Neon sign | Decor · animated (flicker, text slot) |
| `prop.on-air-sign` | On-air sign | Decor · animated (on/off) |
| `prop.rug` | Rug | Decor · static |
| `prop.curtains` | Curtains | Decor · animated (sway, open/closed) |
| `prop.floor-lamp` | Floor lamp | Decor · animated (on/off, light) |
| `prop.candle` | Candle | Decor · animated (flame) |
| `prop.fireplace` | Fireplace | Decor · animated (fire, sound) |
| `prop.aquarium` | Aquarium | Decor · animated (fish, bubbles) |
| `prop.globe` | Globe | Decor · interactive (spin) |
| `prop.clock-radio` | Clock radio | Decor · animated |
| `prop.mirror` | Mirror | Decor · static |
| `prop.door` | Door | Building · interactive (open/closed, sound) |
| `prop.window` | Window | Building · interactive (open/closed, weather view) |
| `prop.light-switch` | Light switch | Building · interactive (press, controls lights) |
| `prop.stairs` | Stairs | Building · static (walk path) |
| `prop.elevator-doors` | Elevator doors | Building · interactive (open/closed, ding) |
| `prop.fence` | Fence | Outdoor · static |
| `prop.street-lamp` | Street lamp | Outdoor · animated (on/off) |
| `prop.park-bench` | Park bench | Outdoor · interactive (seat anchors) |
| `prop.bus-stop` | Bus stop | Outdoor · static |
| `prop.traffic-light` | Traffic light | Outdoor · animated (cycle) |
| `prop.tree` | Tree | Outdoor · animated (sway) |
| `prop.bush` | Bush | Outdoor · animated (sway) |
| `prop.rock` | Rock | Outdoor · static |
| `prop.mailbox` | Mailbox | Outdoor · interactive (open/closed) |
| `prop.trash-can` | Trash can | Outdoor · interactive (lid) |
| `prop.bicycle` | Bicycle | Outdoor · interactive (ride, walk with) |
| `prop.car` | Car | Outdoor · interactive (doors, drive across) |
| `prop.scooter` | Scooter | Outdoor · interactive (ride) |
| `prop.umbrella` | Umbrella | Outdoor · interactive (open/closed, grip) |
| `prop.football` | Football | Sports · interactive (throw/catch) |
| `prop.basketball` | Basketball | Sports · interactive (bounce) |
| `prop.tennis-racket` | Tennis racket | Sports · interactive (grip, swing) |
| `prop.dumbbell` | Dumbbell | Sports · interactive (grip) |
| `prop.yoga-mat` | Yoga mat | Sports · static |
| `prop.skateboard` | Skateboard | Sports · interactive (ride) |
| `prop.guitar` | Guitar | Music · interactive (play) |
| `prop.keyboard-instrument` | Keyboard instrument | Music · interactive (play) |
| `prop.drum-kit` | Drum kit | Music · interactive (play, sound) |
| `prop.violin` | Violin | Music · interactive (play) |
| `prop.microphone-stand` | Microphone stand | Music · static |
| `prop.gift-box` | Gift box | Party · interactive (closed/open) |
| `prop.balloons` | Balloons | Party · animated (bob) |
| `prop.birthday-cake` | Birthday cake | Party · interactive (candles lit/blown) |
| `prop.confetti-cannon` | Confetti cannon | Party · interactive (fire effect) |
| `prop.party-hat` | Party hat | Party · wearable |
| `prop.stethoscope` | Stethoscope | Medical · wearable |
| `prop.hospital-bed` | Hospital bed | Medical · interactive (lie anchor) |
| `prop.first-aid-kit` | First aid kit | Medical · interactive (open/closed) |
| `prop.pill-bottle` | Pill bottle | Medical · interactive (grip) |
| `prop.magnifying-glass` | Magnifying glass | Mystery · interactive (grip) |
| `prop.detective-notebook` | Detective notebook | Mystery · interactive (grip) |
| `prop.evidence-board` | Evidence board | Mystery · static (image slots) |
| `prop.flashlight` | Flashlight | Mystery · interactive (on/off, beam) |
| `prop.key` | Key | Mystery · interactive (pinch) |
| `prop.treasure-chest` | Treasure chest | Fantasy · interactive (closed/open, glow) |
| `prop.magic-wand` | Magic wand | Fantasy · interactive (sparkle effect) |
| `prop.potion-bottle` | Potion bottle | Fantasy · interactive (grip, bubbling) |
| `prop.crystal-ball` | Crystal ball | Fantasy · animated (glow) |
| `prop.sword` | Sword | Fantasy · interactive (grip, swing) |
| `prop.shield` | Shield | Fantasy · interactive (grip) |
| `prop.backpack` | Backpack | Travel · wearable |
| `prop.suitcase` | Suitcase | Travel · interactive (grip, roll) |
| `prop.map` | Map | Travel · interactive (open/closed) |
| `prop.camera` | Camera | Travel · interactive (grip, flash) |
| `prop.passport` | Passport | Travel · interactive (pinch) |
| `prop.shopping-bag` | Shopping bag | Retail · interactive (grip) |
| `prop.cash-register` | Cash register | Retail · animated (drawer, sound) |
| `prop.price-tag` | Price tag | Retail · static (text slot) |
| `prop.shopping-cart` | Shopping cart | Retail · interactive (push) |
| `prop.megaphone` | Megaphone | Event · interactive (grip, voice effect) |
| `prop.trophy-cup` | Trophy cup | Event · interactive (grip) |
| `prop.podium` | Podium | Event · static |
| `prop.stage-spotlight` | Stage spotlight | Event · animated (beam) |
| `prop.red-carpet` | Red carpet | Event · static |

## I Environments

### I1 Location kits (16)

Each kit bundles compatible background, set pieces, floor, foreground, animated scenery, palettes and suggested character marks, in both families. Every kit ships with at least two ready-made sets (I2).

| ID | Kit | Contents summary |
|---|---|---|
| `kit.podcast-studio` | Podcast studio | Acoustic walls, desk, mics, on-air sign, lamps, 2–4 seat marks |
| `kit.living-room` | Living room | Sofa, coffee table, TV, window, plants, rug |
| `kit.kitchen` | Kitchen | Counter, appliances, table, window, shelves |
| `kit.office` | Office | Desks, monitors, whiteboard, meeting table, plants |
| `kit.classroom` | Classroom | Desks, board, lectern, posters, windows |
| `kit.coffee-shop` | Coffee shop | Counter, coffee machine, tables, chalkboard menu, window street |
| `kit.newsroom` | Newsroom | Anchor desk, screens, logo wall, studio lights |
| `kit.city-street` | City street | Buildings, shopfronts, street lamps, traffic, crosswalk |
| `kit.park` | Park | Trees, path, benches, lake, sky |
| `kit.bedroom` | Bedroom | Bed, desk, window, wardrobe, posters |
| `kit.hospital` | Hospital | Bed, monitors, curtains, corridor |
| `kit.stage-and-auditorium` | Stage and auditorium | Stage, curtains, spotlights, seats, podium |
| `kit.library` | Library | Shelves, reading tables, lamps |
| `kit.gym` | Gym | Equipment, mirrors, mats |
| `kit.train-interior` | Train interior | Seats, windows with moving landscape |
| `kit.fantasy-forest` | Fantasy forest | Glowing plants, mushrooms, ruins, mist |

### I2 Ready-made sets (32)

Assembled, editable arrangements of a kit with character marks and camera compositions.

| ID | Set | Kit |
|---|---|---|
| `set.two-host-podcast` | Two-host podcast | Podcast studio |
| `set.solo-podcast` | Solo podcast | Podcast studio |
| `set.four-person-panel` | Four-person panel | Podcast studio |
| `set.sofa-chat` | Sofa chat | Living room |
| `set.movie-night` | Movie night | Living room |
| `set.breakfast-table` | Breakfast table | Kitchen |
| `set.cooking-show` | Cooking show | Kitchen |
| `set.open-plan-office` | Open-plan office | Office |
| `set.meeting-room` | Meeting room | Office |
| `set.bosss-office` | Boss’s office | Office |
| `set.lecture` | Lecture | Classroom |
| `set.group-work` | Group work | Classroom |
| `set.counter-order` | Counter order | Coffee shop |
| `set.window-table` | Window table | Coffee shop |
| `set.anchor-desk` | Anchor desk | Newsroom |
| `set.weather-wall` | Weather wall | Newsroom |
| `set.shopfront` | Shopfront | City street |
| `set.crosswalk` | Crosswalk | City street |
| `set.lakeside-bench` | Lakeside bench | Park |
| `set.picnic` | Picnic | Park |
| `set.late-night-desk` | Late night desk | Bedroom |
| `set.bedside` | Bedside | Bedroom |
| `set.ward` | Ward | Hospital |
| `set.corridor` | Corridor | Hospital |
| `set.keynote` | Keynote | Stage and auditorium |
| `set.award-show` | Award show | Stage and auditorium |
| `set.reading-corner` | Reading corner | Library |
| `set.weights-area` | Weights area | Gym |
| `set.commuter-seats` | Commuter seats | Train interior |
| `set.forest-clearing` | Forest clearing | Fantasy forest |
| `set.ruined-temple` | Ruined temple | Fantasy forest |
| `set.info-desk` | Info desk | Library |

### I3 Environment layers (10)

Standard layer stack every kit and set uses; each layer has depth plane and parallax defaults.

| ID | Layer | Default depth / parallax |
|---|---|---|
| `layer.sky` | Sky | Far / 10% |
| `layer.distant-background` | Distant background | Far / 25% |
| `layer.background` | Background | Back / 50% |
| `layer.main-setting` | Main setting | Back / 75% |
| `layer.floor` | Floor | Ground / 100% |
| `layer.set-pieces` | Set pieces | Mid / 100% |
| `layer.characters` | Characters | Mid / 100% |
| `layer.props` | Props | Mid / 100% |
| `layer.foreground` | Foreground | Front / 130% |
| `layer.atmosphere-overlay` | Atmosphere overlay | Screen / 0% |

## J Scene atmosphere

### J1 Scene atmosphere (54)

Weather, particles, lighting overlays, animated backgrounds, foreground layers and colour grades. All have intensity, colour and timing.

| ID | Item | Group |
|---|---|---|
| `atmo.light-rain` | Light rain | Weather |
| `atmo.heavy-rain` | Heavy rain | Weather |
| `atmo.storm-with-lightning` | Storm with lightning | Weather |
| `atmo.snow` | Snow | Weather |
| `atmo.blizzard` | Blizzard | Weather |
| `atmo.fog` | Fog | Weather |
| `atmo.mist` | Mist | Weather |
| `atmo.wind-with-leaves` | Wind with leaves | Weather |
| `atmo.wind-with-debris` | Wind with debris | Weather |
| `atmo.hail` | Hail | Weather |
| `atmo.heat-haze` | Heat haze | Weather |
| `atmo.dust-motes` | Dust motes | Particles |
| `atmo.fireflies` | Fireflies | Particles |
| `atmo.floating-petals` | Floating petals | Particles |
| `atmo.bubbles` | Bubbles | Particles |
| `atmo.embers` | Embers | Particles |
| `atmo.confetti` | Confetti | Particles |
| `atmo.smoke` | Smoke | Particles |
| `atmo.steam` | Steam | Particles |
| `atmo.sparkles` | Sparkles | Particles |
| `atmo.day` | Day | Lighting overlay |
| `atmo.golden-hour` | Golden hour | Lighting overlay |
| `atmo.dusk` | Dusk | Lighting overlay |
| `atmo.night` | Night | Lighting overlay |
| `atmo.moonlight` | Moonlight | Lighting overlay |
| `atmo.neon-glow` | Neon glow | Lighting overlay |
| `atmo.window-light-shafts` | Window light shafts | Lighting overlay |
| `atmo.spotlight` | Spotlight | Lighting overlay |
| `atmo.flicker` | Flicker | Lighting overlay |
| `atmo.lightning-flash` | Lightning flash | Lighting overlay |
| `atmo.colour-wash` | Colour wash | Lighting overlay |
| `atmo.vignette` | Vignette | Lighting overlay |
| `atmo.god-rays` | God rays | Lighting overlay |
| `atmo.drifting-clouds` | Drifting clouds | Animated background |
| `atmo.traffic` | Traffic | Animated background |
| `atmo.crowd-silhouettes` | Crowd silhouettes | Animated background |
| `atmo.swaying-trees` | Swaying trees | Animated background |
| `atmo.water-ripples` | Water ripples | Animated background |
| `atmo.city-lights` | City lights | Animated background |
| `atmo.screens-and-monitors` | Screens and monitors | Animated background |
| `atmo.ceiling-fan` | Ceiling fan | Animated background |
| `atmo.blurred-plants` | Blurred plants | Foreground |
| `atmo.curtain-edge` | Curtain edge | Foreground |
| `atmo.rain-on-glass` | Rain on glass | Foreground |
| `atmo.window-frame` | Window frame | Foreground |
| `atmo.crowd-heads` | Crowd heads | Foreground |
| `atmo.warm-grade` | Warm grade | Colour grade |
| `atmo.cool-grade` | Cool grade | Colour grade |
| `atmo.noir` | Noir | Colour grade |
| `atmo.sepia` | Sepia | Colour grade |
| `atmo.pastel` | Pastel | Colour grade |
| `atmo.high-contrast` | High contrast | Colour grade |
| `atmo.desaturated` | Desaturated | Colour grade |
| `atmo.retro-vhs` | Retro VHS | Colour grade |

## K Motion effects and transitions

### K1 Motion and visual effects (38)

Effects declare attachment (screen, stage point, object, character anchor), start, duration and editable properties. Character-attached effects follow the anchor.

| ID | Effect | Group |
|---|---|---|
| `fx.anticipation` | Anticipation | Animation principle |
| `fx.squash-and-stretch` | Squash and stretch | Animation principle |
| `fx.overshoot-and-settle` | Overshoot and settle | Animation principle |
| `fx.bounce` | Bounce | Animation principle |
| `fx.ease-presets` | Ease presets | Animation principle |
| `fx.wobble` | Wobble | Animation principle |
| `fx.jiggle` | Jiggle | Animation principle |
| `fx.follow-through` | Follow-through | Animation principle |
| `fx.smear-frame` | Smear frame | Animation principle |
| `fx.impact-flash` | Impact flash | Impact |
| `fx.impact-star` | Impact star | Impact |
| `fx.dust-puff` | Dust puff | Impact |
| `fx.shockwave-ring` | Shockwave ring | Impact |
| `fx.screen-flash` | Screen flash | Impact |
| `fx.hit-pause` | Hit pause | Impact |
| `fx.speed-lines` | Speed lines | Motion graphics |
| `fx.radial-focus-lines` | Radial focus lines | Motion graphics |
| `fx.swoosh-trail` | Swoosh trail | Motion graphics |
| `fx.motion-blur-streak` | Motion blur streak | Motion graphics |
| `fx.afterimage` | Afterimage | Motion graphics |
| `fx.dash-puff` | Dash puff | Motion graphics |
| `fx.question-mark` | Question mark | Emotional symbol |
| `fx.exclamation` | Exclamation | Emotional symbol |
| `fx.hearts` | Hearts | Emotional symbol |
| `fx.anger-mark` | Anger mark | Emotional symbol |
| `fx.sweat-drops` | Sweat drops | Emotional symbol |
| `fx.sparkles` | Sparkles | Emotional symbol |
| `fx.gloom-cloud` | Gloom cloud | Emotional symbol |
| `fx.light-bulb` | Light bulb | Emotional symbol |
| `fx.zzz` | Zzz | Emotional symbol |
| `fx.music-notes` | Music notes | Emotional symbol |
| `fx.swirl` | Swirl | Emotional symbol |
| `fx.ellipsis-dots` | Ellipsis dots | Emotional symbol |
| `fx.spotlight-focus` | Spotlight focus | Treatment |
| `fx.dramatic-silhouette` | Dramatic silhouette | Treatment |
| `fx.tint` | Tint | Treatment |
| `fx.freeze-frame` | Freeze frame | Treatment |
| `fx.split-tone` | Split tone | Treatment |

### K2 Transitions (18)

Between shots within a scene and between scenes; duration and direction where relevant.

| ID | Transition | Notes |
|---|---|---|
| `tr.cut` | Cut | Default, zero duration |
| `tr.fade-to-black` | Fade to black |  |
| `tr.fade-to-white` | Fade to white |  |
| `tr.crossfade` | Crossfade |  |
| `tr.wipe-left` | Wipe left |  |
| `tr.wipe-right` | Wipe right |  |
| `tr.wipe-up` | Wipe up |  |
| `tr.wipe-down` | Wipe down |  |
| `tr.slide` | Slide | Direction |
| `tr.push` | Push | Direction |
| `tr.iris-in` | Iris in | Centre on subject |
| `tr.iris-out` | Iris out | Centre on subject |
| `tr.zoom-blur` | Zoom blur |  |
| `tr.page-turn` | Page turn |  |
| `tr.ink-splash` | Ink splash |  |
| `tr.glitch` | Glitch |  |
| `tr.whip-blur` | Whip blur | Pairs with whip pan |
| `tr.shape-reveal` | Shape reveal | Circle, star, heart |

## M Camera language

### M1 Camera language (49)

Framings and angles are camera presets; moves are timed camera clips; recipes coordinate framing, moves and timing.

| ID | Item | Group |
|---|---|---|
| `cam.extreme-wide` | Extreme wide | Framing |
| `cam.wide` | Wide | Framing |
| `cam.full` | Full | Framing |
| `cam.medium-wide` | Medium wide | Framing |
| `cam.medium` | Medium | Framing |
| `cam.medium-close-up` | Medium close-up | Framing |
| `cam.close-up` | Close-up | Framing |
| `cam.extreme-close-up` | Extreme close-up | Framing |
| `cam.two-shot` | Two-shot | Framing |
| `cam.three-shot` | Three-shot | Framing |
| `cam.over-the-shoulder` | Over-the-shoulder | Framing |
| `cam.insert-detail` | Insert detail | Framing |
| `cam.eye-level` | Eye level | Angle |
| `cam.low-angle` | Low angle | Angle |
| `cam.high-angle` | High angle | Angle |
| `cam.dutch-tilt` | Dutch tilt | Angle |
| `cam.pan` | Pan | Move |
| `cam.tilt` | Tilt | Move |
| `cam.push-in` | Push in | Move |
| `cam.pull-out` | Pull out | Move |
| `cam.slow-creep` | Slow creep | Move |
| `cam.dolly-with-parallax` | Dolly with parallax | Move |
| `cam.truck` | Truck | Move |
| `cam.follow-subject` | Follow subject | Move |
| `cam.reframe-between-subjects` | Reframe between subjects | Move |
| `cam.rack-focus-blur` | Rack focus blur | Move |
| `cam.crash-zoom` | Crash zoom | Energy move |
| `cam.whip-pan` | Whip pan | Energy move |
| `cam.shake-light` | Shake light | Energy move |
| `cam.shake-medium` | Shake medium | Energy move |
| `cam.shake-heavy` | Shake heavy | Energy move |
| `cam.rumble` | Rumble | Energy move |
| `cam.handheld-drift` | Handheld drift | Energy move |
| `cam.snap-zoom` | Snap zoom | Energy move |
| `cam.bounce-zoom` | Bounce zoom | Energy move |
| `cam.hard-cut` | Hard cut | Edit |
| `cam.match-cut` | Match cut | Edit |
| `cam.jump-cut` | Jump cut | Edit |
| `cam.reaction-cut` | Reaction cut | Edit |
| `cam.cutaway` | Cutaway | Edit |
| `cam.split-screen` | Split screen | Edit |
| `cam.picture-in-picture` | Picture in picture | Edit |
| `cam.freeze-with-title` | Freeze with title | Edit |
| `cam.dramatic-reveal-shot` | Dramatic reveal shot | Shot recipe |
| `cam.comedic-beat-shot` | Comedic beat shot | Shot recipe |
| `cam.interview-two-shot` | Interview two-shot | Shot recipe |
| `cam.reaction-ping-pong` | Reaction ping-pong | Shot recipe |
| `cam.establishing-pan` | Establishing pan | Shot recipe |
| `cam.walk-and-talk-follow` | Walk and talk follow | Shot recipe |

## N Sound library

### N1 Music (20)

Original or properly licensed tracks with loop points, intro/outro edits and stems where available.

| ID | Track | Mood · length |
|---|---|---|
| `music.warm-intro` | Warm intro | Friendly · 0:42 loop |
| `music.morning-coffee` | Morning coffee | Light acoustic · 1:30 |
| `music.upbeat-explainer` | Upbeat explainer | Corporate positive · 2:00 |
| `music.curious-minds` | Curious minds | Playful pizzicato · 1:45 |
| `music.late-night-talk` | Late night talk | Lo-fi · 2:30 |
| `music.newsroom-theme` | Newsroom theme | News · 0:30 |
| `music.breaking-news-sting` | Breaking news sting | News · 0:06 |
| `music.quirky-comedy` | Quirky comedy | Comedic · 1:20 |
| `music.sneaky-moment` | Sneaky moment | Comedic suspense · 0:50 |
| `music.sad-piano` | Sad piano | Melancholy · 1:40 |
| `music.hopeful-strings` | Hopeful strings | Uplifting · 2:00 |
| `music.tension-pulse` | Tension pulse | Suspense · 1:10 |
| `music.mystery-noir` | Mystery noir | Jazz noir · 1:50 |
| `music.action-chase` | Action chase | Energetic · 1:00 |
| `music.victory-fanfare` | Victory fanfare | Triumph · 0:12 |
| `music.fantasy-adventure` | Fantasy adventure | Orchestral · 2:10 |
| `music.calm-ambient` | Calm ambient | Ambient · 3:00 |
| `music.retro-game` | Retro game | Chiptune · 1:15 |
| `music.party-groove` | Party groove | Dance · 2:00 |
| `music.credits-roll` | Credits roll | Warm closing · 1:30 |

### N2 Musical cues and stings (12)

Short cues for edits and beats.

| ID | Cue | Use |
|---|---|---|
| `cue.comedy-sting` | Comedy sting | Punchline |
| `cue.rimshot` | Rimshot | Joke |
| `cue.sad-trombone` | Sad trombone | Failure |
| `cue.dramatic-hit` | Dramatic hit | Reveal |
| `cue.suspense-riser` | Suspense riser | Build-up |
| `cue.whoosh-transition` | Whoosh transition | Transition |
| `cue.ta-da` | Ta-da | Success |
| `cue.record-scratch` | Record scratch | Interruption |
| `cue.harp-gliss` | Harp gliss | Dream, flashback |
| `cue.magic-chime` | Magic chime | Sparkle, idea |
| `cue.gong` | Gong | Announcement |
| `cue.heartbeat` | Heartbeat | Tension |

### N3 Ambience (20)

Seamless loops matched to location kits.

| ID | Ambience | Kit |
|---|---|---|
| `amb.studio-room-tone` | Studio room tone | Podcast studio |
| `amb.living-room-hum` | Living room hum | Living room |
| `amb.kitchen-ambience` | Kitchen ambience | Kitchen |
| `amb.office-murmur` | Office murmur | Office |
| `amb.classroom-chatter` | Classroom chatter | Classroom |
| `amb.coffee-shop` | Coffee shop | Coffee shop |
| `amb.newsroom-bustle` | Newsroom bustle | Newsroom |
| `amb.city-street` | City street | City street |
| `amb.park-birds` | Park birds | Park |
| `amb.night-crickets` | Night crickets | Park |
| `amb.bedroom-quiet` | Bedroom quiet | Bedroom |
| `amb.hospital-ward` | Hospital ward | Hospital |
| `amb.auditorium-crowd` | Auditorium crowd | Stage and auditorium |
| `amb.library-hush` | Library hush | Library |
| `amb.gym-ambience` | Gym ambience | Gym |
| `amb.train-carriage` | Train carriage | Train interior |
| `amb.enchanted-forest` | Enchanted forest | Fantasy forest |
| `amb.rain-on-window` | Rain on window | Any |
| `amb.thunderstorm` | Thunderstorm | Any |
| `amb.wind` | Wind | Any |

### N4 Sound effects (60)

Foley and effects; many are pre-linked to prop states and actions (e.g., door close, mug on table).

| ID | Effect | Group |
|---|---|---|
| `sfx.footsteps-wood` | Footsteps wood | Movement |
| `sfx.footsteps-concrete` | Footsteps concrete | Movement |
| `sfx.footsteps-grass` | Footsteps grass | Movement |
| `sfx.running-steps` | Running steps | Movement |
| `sfx.chair-creak` | Chair creak | Movement |
| `sfx.sit-on-sofa` | Sit on sofa | Movement |
| `sfx.clothes-rustle` | Clothes rustle | Movement |
| `sfx.body-fall` | Body fall | Movement |
| `sfx.door-open` | Door open | Object |
| `sfx.door-close` | Door close | Object |
| `sfx.door-slam` | Door slam | Object |
| `sfx.knock` | Knock | Object |
| `sfx.doorbell` | Doorbell | Object |
| `sfx.mug-on-table` | Mug on table | Object |
| `sfx.cup-clink` | Cup clink | Object |
| `sfx.pour-drink` | Pour drink | Object |
| `sfx.paper-rustle` | Paper rustle | Object |
| `sfx.page-turn` | Page turn | Object |
| `sfx.pen-click` | Pen click | Object |
| `sfx.keyboard-typing` | Keyboard typing | Object |
| `sfx.mouse-click` | Mouse click | Object |
| `sfx.phone-ring` | Phone ring | Object |
| `sfx.phone-vibrate` | Phone vibrate | Object |
| `sfx.phone-notification` | Phone notification | Object |
| `sfx.camera-shutter` | Camera shutter | Object |
| `sfx.zipper` | Zipper | Object |
| `sfx.glass-break` | Glass break | Object |
| `sfx.kettle-whistle` | Kettle whistle | Object |
| `sfx.microwave-ding` | Microwave ding | Object |
| `sfx.toaster-pop` | Toaster pop | Object |
| `sfx.record-beep` | Record beep | Tech |
| `sfx.computer-startup` | Computer startup | Tech |
| `sfx.error-beep` | Error beep | Tech |
| `sfx.notification-chime` | Notification chime | Tech |
| `sfx.static-noise` | Static noise | Tech |
| `sfx.applause` | Applause | Crowd |
| `sfx.laugh-track` | Laugh track | Crowd |
| `sfx.gasp-crowd` | Gasp crowd | Crowd |
| `sfx.boo` | Boo | Crowd |
| `sfx.cheer` | Cheer | Crowd |
| `sfx.whoosh` | Whoosh | Motion |
| `sfx.swish` | Swish | Motion |
| `sfx.zip-pass` | Zip pass | Motion |
| `sfx.boing` | Boing | Cartoon |
| `sfx.pop` | Pop | Cartoon |
| `sfx.slide-whistle` | Slide whistle | Cartoon |
| `sfx.bonk` | Bonk | Cartoon |
| `sfx.punch-impact` | Punch impact | Impact |
| `sfx.thud` | Thud | Impact |
| `sfx.crash` | Crash | Impact |
| `sfx.explosion-small` | Explosion small | Impact |
| `sfx.throat-clear` | Throat clear | Vocal |
| `sfx.sigh` | Sigh | Vocal |
| `sfx.cough` | Cough | Vocal |
| `sfx.sniff` | Sniff | Vocal |
| `sfx.yawn` | Yawn | Vocal |
| `sfx.car-pass` | Car pass | Vehicle |
| `sfx.car-horn` | Car horn | Vehicle |
| `sfx.bicycle-bell` | Bicycle bell | Vehicle |
| `sfx.train-horn` | Train horn | Vehicle |

## O Text, graphics and finishing

### O1 Text, graphics and finishing (36)

Screen-space (captions, lower thirds, cards) or world-space (signs, screens). All have content, placement, timing and style controls and respect safe areas in every aspect ratio.

| ID | Element | Group |
|---|---|---|
| `txt.podcast-captions` | Podcast captions | Caption style |
| `txt.bold-karaoke-captions` | Bold karaoke captions | Caption style (word highlight) |
| `txt.minimal-captions` | Minimal captions | Caption style |
| `txt.boxed-captions` | Boxed captions | Caption style |
| `txt.social-pop-captions` | Social pop captions | Caption style (animated words) |
| `txt.film-subtitles` | Film subtitles | Caption style |
| `txt.speech-bubble-round` | Speech bubble round | Bubble |
| `txt.speech-bubble-square` | Speech bubble square | Bubble |
| `txt.shout-bubble` | Shout bubble | Bubble |
| `txt.whisper-bubble` | Whisper bubble | Bubble |
| `txt.thought-bubble` | Thought bubble | Bubble |
| `txt.narration-box` | Narration box | Bubble |
| `txt.episode-title-card` | Episode title card | Title |
| `txt.cold-open-title` | Cold open title | Title |
| `txt.chapter-title` | Chapter title | Title |
| `txt.quote-card` | Quote card | Title |
| `txt.name-lower-third` | Name lower third | Lower third |
| `txt.name-and-role-lower-third` | Name and role lower third | Lower third |
| `txt.location-lower-third` | Location lower third | Lower third |
| `txt.breaking-news-bar` | Breaking news bar | Lower third |
| `txt.social-handle-tag` | Social handle tag | Lower third |
| `txt.opening-card` | Opening card | Card |
| `txt.closing-card` | Closing card | Card |
| `txt.subscribe-end-card` | Subscribe end card | Card |
| `txt.credits-roll` | Credits roll | Credits |
| `txt.credits-card` | Credits card | Credits |
| `txt.logo-bug` | Logo bug | Graphic |
| `txt.watermark` | Watermark | Graphic |
| `txt.progress-bar` | Progress bar | Graphic |
| `txt.countdown` | Countdown | Graphic |
| `txt.chart-callout` | Chart callout | Graphic |
| `txt.arrow-callout` | Arrow callout | Graphic |
| `txt.highlight-circle` | Highlight circle | Graphic |
| `txt.sign-text` | Sign text | World text |
| `txt.screen-text` | Screen text | World text |
| `txt.chalkboard-text` | Chalkboard text | World text |

## P Production templates

### P1 Production templates (16)

Complete, directable starting points: cast, looks, set, cameras, sample performances, audio and output settings. Replace any piece and keep the rest.

| ID | Template | Contents |
|---|---|---|
| `tpl.two-person-podcast` | Two-person podcast | 2 hosts, podcast studio, 3 cameras, intro music, captions |
| `tpl.solo-podcast` | Solo podcast | 1 host, solo set, 2 cameras, lower third |
| `tpl.panel-discussion` | Panel discussion | 4 guests, panel set, 5 cameras |
| `tpl.interview` | Interview | Host and guest, office, over-the-shoulder coverage |
| `tpl.classroom-explainer` | Classroom explainer | Teacher, classroom, board graphics |
| `tpl.product-explainer` | Product explainer | Presenter, plain backdrop, callouts, chart graphic |
| `tpl.comedy-exchange` | Comedy exchange | 2 characters, coffee shop, comedic beat recipes |
| `tpl.sitcom-scene` | Sitcom scene | 3 characters, living room, laugh track |
| `tpl.news-segment` | News segment | Anchor, newsroom, breaking news bar, weather wall |
| `tpl.character-introduction` | Character introduction | 1 character, turnaround reveal, name card |
| `tpl.social-short-portrait` | Social short portrait | 1 character, portrait framing, bold captions |
| `tpl.story-scene` | Story scene | 2 characters, park, music and ambience |
| `tpl.mystery-scene` | Mystery scene | Detective and suspect, office at night, noir grade |
| `tpl.customer-support-demo` | Customer support demo | Agent and customer, split screen |
| `tpl.announcement` | Announcement | Presenter, stage, confetti and fanfare |
| `tpl.bedtime-story` | Bedtime story | Narrator, bedroom, soft music |

## Q Voices and delivery

### Q1 Starter voices (16)

Designed with the local voice engine and shipped as voice assets (description, reference clips, emotional range bank of five, engine data). Creators can duplicate and redesign them. No real person’s voice is cloned.

| ID | Voice | Description |
|---|---|---|
| `voice.warm-host` | Warm host | Late-20s woman, warm mid-range, bright and curious |
| `voice.dry-wit` | Dry wit | Early-30s man, relaxed baritone, understated |
| `voice.calm-presenter` | Calm presenter | 40s, measured, clear, reassuring |
| `voice.energetic-teacher` | Energetic teacher | 30s woman, upbeat, articulate |
| `voice.teen` | Teen | 16-year-old, casual, quick |
| `voice.wise-elder` | Wise elder | 70s woman, gentle, slightly husky |
| `voice.comic` | Comic | 20s man, animated, expressive timing |
| `voice.designer` | Designer | 30s woman, soft, thoughtful |
| `voice.anchor` | Anchor | 50s man, authoritative broadcast voice |
| `voice.doctor` | Doctor | 40s woman, calm and precise |
| `voice.child` | Child | 9-year-old, bright, playful |
| `voice.founder` | Founder | 30s woman, confident, fast |
| `voice.streamer` | Streamer | 20s man, excitable, friendly |
| `voice.detective` | Detective | 40s woman, low, deliberate |
| `voice.narrator` | Narrator | Neutral storyteller, rich and warm |
| `voice.announcer` | Announcer | Big, theatrical, promotional |

### Q2 Delivery presets (12)

Reusable combinations of supported delivery settings; resolved to the voice’s emotional range bank and engine capabilities.

| ID | Delivery | Settings |
|---|---|---|
| `delivery.neutral` | Neutral | Neutral reference, pace 1.0 |
| `delivery.warm` | Warm | Happy reference, pace 0.95 |
| `delivery.upbeat` | Upbeat | Happy reference, pace 1.08 |
| `delivery.nervous` | Nervous | Nervous reference, pace 1.1, hesitations allowed |
| `delivery.angry` | Angry | Angry reference, pace 1.05 |
| `delivery.sad` | Sad | Sad reference, pace 0.9 |
| `delivery.whisper` | Whisper | Whisper reference, low gain |
| `delivery.sarcastic` | Sarcastic | Neutral reference, instruction "dry, sarcastic" |
| `delivery.excited` | Excited | Happy reference, pace 1.15 |
| `delivery.deadpan` | Deadpan | Neutral reference, flat instruction |
| `delivery.shouting` | Shouting | Angry reference, high energy instruction |
| `delivery.teasing` | Teasing | Happy reference, instruction "playful teasing" |

## R Output presets

### R1 Output presets (12)

Export presets; any can be customised.

| ID | Preset | Format |
|---|---|---|
| `out.landscape-hd` | Landscape HD | 1920×1080, 16:9, 24/25/30 fps, MP4 H.264 + AAC |
| `out.landscape-720p` | Landscape 720p | 1280×720, 16:9, MP4 |
| `out.landscape-4k` | Landscape 4K | 3840×2160, 16:9, MP4 H.265 or H.264 |
| `out.portrait-social` | Portrait social | 1080×1920, 9:16, MP4 |
| `out.square` | Square | 1080×1080, 1:1, MP4 |
| `out.feed-portrait` | Feed portrait | 1080×1350, 4:5, MP4 |
| `out.web-webm` | Web WebM | Any size, VP9 + Opus |
| `out.transparent-overlay` | Transparent overlay | ProRes 4444 or WebM VP9 alpha |
| `out.image-sequence` | Image sequence | PNG frames + WAV |
| `out.audio-only` | Audio only | WAV / MP3 mix and stems |
| `out.animated-gif` | Animated GIF | Short clips, no audio |
| `out.subtitles` | Subtitles | SRT and WebVTT from dialogue |

## Appendix — Catalog maintenance

- During implementation, convert this catalog into a machine-readable source (`catalog/*.yaml`); from then on that source is the authority and this document is generated from it and checked in CI so they cannot drift.
- Adding an item: add it to the catalog source with a new ID, author its assets through the part editor or import pipeline, pass the rig check and asset validator, render both previews, and add it to the acceptance coverage report.
- Retiring an item: mark it `deprecated` with a replacement ID; it stays loadable for existing projects forever.
