# 0015 — Studio architecture: server mirror, shared CPU renderer, hash routes

Status: Accepted · Requirements: UI-01/02/05, FR-ARC-01/03, FR-RND-01/03, FR-VOI-02/07/12, FR-RND-07

## Decision

- **State:** the Studio keeps a read-only mirror of the open project (`apps/studio/src/lib/store.ts`). It changes only
  from server `change` events (entity deltas, decision 0014) or a full resync when a revision is skipped. Every edit is
  a `POST …/commands` batch with the client's base revision; a `REVISION_CONFLICT` resyncs and retries once. Undo/redo
  is the server session's history (one history for Studio, CLI and agents), with labels shipped in change events.
- **Preview renderer:** CanvasKit 0.40.0 full build loaded in the browser, fonts from `/content/fonts`, and the same
  `createRenderer()` CPU raster path as the CLI and export (`@frame/render/surface.ts`). Pixels are read back and put on
  a 2D canvas, so preview pixels equal export pixels; `apps/studio/e2e` compares them with the server's frame endpoint
  (0 differing pixels). During playback the preview renders at half resolution and says "Preview quality"
  (FR-RND-03); timing never changes.
- **Assets in the browser:** `GET /api/projects/:id/scene-assets` returns every manifest a scene's evaluation touches;
  misses fetch on demand and redraw.
- **Audio preview:** Web Audio plays the same `AudioPlan` with gain curves sampled from the shared automation
  functions (fades, pan, ducking) — the offline mixer uses the same functions.
- **Routing:** hash routes (`#/`, `#/p/<id>`, `#/p/<id>/builder/<scene>/<instance>`), so the server can serve the
  built Studio as static files with an index fallback.
- **Builder (M1):** preview-only screen (views, framing, turnaround, expression/gesture/lip-sync tests on an isolated
  copy of the scene, parts tree with current values). Part editing and character versions are M2; the screen says so
  and offers no inactive controls (UI-06).
- **Renderer memory:** one reusable raster surface and readback buffer per frame size; per-frame allocation of 8 MB
  buffers made full-HD exports fail with a null readback in a long-running server.

## Evidence

`apps/studio/e2e/studio.spec.ts` (preview vs server pixel identity, selection, edit + undo, axe WCAG A/AA; the M1
voice → takes → export flow with the fixture worker), `packages/server/test/server.test.ts`.
