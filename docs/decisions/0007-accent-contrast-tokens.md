# 0007 — Accent tokens for text on and in accent

**Context.** Automated axe checks (NFR-12, AC-18) on the component gallery found that the Design System's dark-theme `color.accent` `#4F7CFF` gives 3.71:1 for white button labels (2.98:1 on hover `#6A90FF`), and accent text on the selected tint gives 3.94:1 — below WCAG AA 4.5:1 for 12 px text. Design System D10 and NFR-12 require AA; §2.1 token values are otherwise binding.

**Decision.** Keep every existing token value. Add three tokens used only where text sits on or is drawn in the accent:
`accent.fill` (dark `#3F69EE`, light `#3A66F0`), `accent.fill-hover` (dark `#365FDB`, light `#2A52CC`), `accent.text` (dark `#8EAAFF`, light `#2A52CC`).
The light theme is visually unchanged; the dark primary button is slightly deeper blue. The Design System §2.1 and §2.7 were updated in the same change (governance §11). Token tests assert the ratios.

**Owner review requested.** If the owner prefers the original look, the alternative is a semibold 14 px label (AA large text needs only 3:1), which conflicts with the 28 px button spec. Reverting is a token edit.

**Owner decision (2026-10-22):** keep the added accent tokens (`accent.fill`, `accent.fill-hover`, `accent.text`). Closed.
