# 0018 — File import: sniffed rasters, SVG parsed as data, rights statement on every import

Status: Accepted · Requirements: FR-IMP-01/02, SRS §4.4, NFR-09, FR-RND-01

## Decision

- **Rasters (PNG, JPEG, WebP)** are recognised by their signatures (never by file name) and measured from their
  headers; limits 64 MB and 16 384 px per side. They are stored content-addressed and drawn by the one renderer
  (`media:<hash>` image sources resolve from the project media store in the server, CLI and export, and by fetch in
  the Studio preview, so preview pixels still equal export pixels).
- **SVG** is parsed with `fast-xml-parser` **5.2.5** (MIT; verified in the shipped `fxp.d.ts`: `XMLParser` with
  `preserveOrder`, `ignoreAttributes: false`, `attributeNamePrefix`, `processEntities: false`). Documents with a
  DOCTYPE or entities are refused; `<script>`, `<image>`, `<use>`, `<foreignObject>`, text, filters, masks and
  animation are dropped with a warning. Paths, rectangles, circles, ellipses, lines and polygons become path data
  with solid fills/strokes, opacity, even-odd fill and transforms; gradients become their first stop colour. Top-level
  groups become named layers (id, `data-name` or `inkscape:label`), which the rigging assistant maps to rig parts.
  The original SVG text is not kept or served, so it can never run in the Studio.
- **Imported images are project-local assets** of kind `img` (`user.<uuid>@1`) holding either the raster media
  reference or the vector drawing, with provenance (`imported`, file name, date, author) and a licence built from the
  user's statement: "I made it / own the rights", "I have a licence" (licence name required) or "public domain".
  Because they are ordinary assets they travel in packages and are pinned like any other.
- **Audio (WAV, MP3, FLAC, OGG, M4A)** is decoded before it is stored (≤ 500 MB, ≤ 60 min), then placed on the
  scene's music, ambience or SFX track at the playhead with the same provenance in the clip parameters. A clip longer
  than the scene is trimmed at the scene end with a warning (the media stays whole).
- **Surfaces:** `POST /api/projects/:id/import`, `frame assets import <file> --rights …`, the Assets panel "Import a
  file…" button and file drops on the canvas (import dialog with rights and placement).

## Evidence

`packages/io/test/import.test.ts` (SVG safety and layers, raster sniffing, PNG and SVG rendered through the
renderer, audio clip with measured duration, refusals), Studio e2e "imports an SVG as an object…" (preview equals
the server renderer after import, axe on the dialog).
