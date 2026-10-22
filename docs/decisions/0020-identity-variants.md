# 0020 — Identity options: rig variants and the seat fit space (additive part-contract change)

Status: Accepted · Requirements: FR-CHR-11, FR-CHR-06, Catalog A20 · Part contract: additive change after the M1 freeze

## Context

Catalog A20 asks for first-class identity and access options (wheelchair, limb difference, prosthetics, mobility aids,
hearing devices, pregnancy, albinism palette, guide dog) that work with every character and every action. Drawing
them is not enough: a wheelchair user stays seated and rolls instead of walking, and a limb difference removes a
hand. The engine must not branch on option names (FR-ARC-06).

## Decision

- **`PartData.variant`** (optional) carries data the engine reads generically:
  - `posture: 'seated'`: the character keeps this posture. Posture-changing actions do not stand them up, and
    validation uses it for posture checks.
  - `rolling: { radius }`: locomotion clips move the character without a leg cycle. The distance rolled turns the
    wheels through the art parameters `wheel.cos` and `wheel.sin`. Any locomotion clip is accepted, and
    `act.push-wheelchair` adds the pushing arms.
  - `truncate`: a limb ends early and its hand or foot is not drawn (limb difference).
  - `replace`: a prosthetic. The natural limb's skin ends there; garments, hands and feet stay, and the variant's
    own part draws the replacement.
  - `body`: body slider overrides (visible pregnancy).
  - `palette`: colour overrides that win over the character's own colours (albinism palette).
  Variants from the character's `rigVariant` part, details and look accessories are merged.
- **Fit space `seat`:** origin at the pelvis, units of leg length (thigh + shin), mirrored with the character. A
  wheelchair is authored as 3D geometry projected for each view (front, three-quarter, side, back), so it scales
  with the body and follows the seated hips.
- Parts with no art of their own (pregnancy, palette, limb difference) declare every view as a documented
  exemption, so the rig check passes (P11).

## Consequences

The change is additive: existing parts and projects are unaffected. Covered by
tools/test/m3-identity.test.ts: wheelchair users stay seated, roll without a leg cycle and pass validation with
locomotion clips; limb difference removes one hand and a prosthetic keeps it; the whole cast resolves with no
missing parts.
