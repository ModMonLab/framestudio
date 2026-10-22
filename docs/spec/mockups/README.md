# Reference mockups — Design Round 2 (visual reference only)

These are the approved interactive mockups of the two reference screens described in 02-DESIGN-SYSTEM §7.

- `Main.dc.html` — Studio workspace (Stage / Direct / Edit), dark and light themes.
- `Builder.dc.html` — Character builder.
- `Character.dc.html` — the placeholder character drawing both screens use.
- `canvas.json` — layout of the design canvas.

Format: Design Component pages. Markup is inside `<x-dc>`; state and logic are in the `<script type="text/x-dc">` block (`renderVals()` returns the values bound with `{{…}}`). Open them as text to read structure, tokens, spacing and interaction behaviour.

**How to use them**
- Use them to match layout, organisation, density and behaviour of the real Studio.
- Do **not** port this code: it is mockup code in a design-tool format, not application architecture. Build the real UI with the stack, packages and tokens in 04-SRS §2 and 02-DESIGN-SYSTEM.
- The characters and set art are placeholders drawn in code. The real art standard is defined in 01-VISION §7 and 03-CATALOG.
- Where a mockup and 02-DESIGN-SYSTEM differ (for example the corrected `text3` colour), the Design System wins.
