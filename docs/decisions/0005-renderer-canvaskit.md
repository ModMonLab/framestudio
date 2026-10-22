# 0005 — Renderer: CanvasKit

**Decision.** `canvaskit-wasm` 0.40.0 (BSD-3-Clause, Google Skia), "full" build (`bin/full/canvaskit.js`), which includes Skia paragraph (text shaping) and `Path.MakeFromSVGString`. Rendering is CPU raster (`MakeSurface`) in Node; the Studio uses the same module and the same `Rasterizer` with a software surface for full-quality preview so pixels match (NFR-03).

**Verified (2026-10-22, in this container).** `CanvasKitInit()` in Node 22; `MakeSurface`, `Path.MakeFromSVGString`, gradients, `ImageFilter.MakeBlur`, `TypefaceFontProvider.Make()` + `ParagraphBuilder.MakeFromFontProvider`, `encodeToBytes()` (PNG), `readPixels` (RGBA unpremultiplied sRGB). Determinism test renders the same display list twice with identical bytes.

**Fonts.** Only bundled fonts are used (no system fonts) so output is identical across machines: Inter 4.x and JetBrains Mono, both OFL-1.1 (copied from Debian `fonts-inter` / `fonts-jetbrains-mono`; licence texts in `content/fonts/licenses/`).

**Open.** Browser performance of CPU raster at preview resolution is measured in M1/M6 (NFR-02); a WebGL surface may be used for playback at reduced quality (allowed by FR-RND-03) if needed.
