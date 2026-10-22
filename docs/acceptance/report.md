# Acceptance report

Updated: 2026-10-22 (session 1). Status values as in docs/PROGRESS.md. "Not verified" means the check needs the
reference machine or people (docs/acceptance/owner-checklist.md); nothing here is claimed from fixture output except
where it says "fixture path".

| AC | Status | Evidence / what remains |
|---|---|---|
| AC-01 Template to video | Not started | Needs templates (Catalog P1, M3/M5). The M1 slice covers design voice → takes → export. |
| AC-02 Character in both families | Not started | M2 builder; M1 builder shows all views and both families (preview only). |
| AC-03 Voice and range bank | Not verified | Fixture path tested (slice.test.ts, studio e2e); needs GPU + listening panel. |
| AC-04 Record and upload | Not started | — |
| AC-05 Clone with consent | Not started | Consent check enforced in take generation (voice-client workflow); UI pending. |
| AC-06 – AC-10 | Not started | M3 direction features. |
| AC-11 Versions and reuse | In progress (path passes) | `packages/server/test/versions.test.ts`: a character used in two episodes gets version 2 in one scene only; reopen keeps both versions; project snapshot compare and restore (undoable). Full Studio run pending. |
| AC-12 Import and rigging | In progress (path passes) | `packages/io/test/rigging.test.ts` and Studio e2e: layered PSD with front and three-quarter views → mapped layers → library mouth supplies missing shapes → rig check passes with declared view gaps → placed in a scene and rendered; image background and audio imports in `import.test.ts`. Hand-pose supply and an artist-made PSD pending. |
| AC-13 Agent production | In progress | MCP server and Studio activity log done (mcp.test.ts, Studio e2e). Recipes/music and a full real-agent run pending. |
| AC-14 Performance | Not verified | Needs the reference project and machine. CPU export measured at ~8 fps for 1920×1080 in the build container (not the reference machine). |
| AC-15 Determinism and sync | In progress | Preview, CLI and export pixel identity tests (studio e2e, slice.test.ts, export.test.ts); 20-frame and 10-minute sync runs pending. |
| AC-16 Reliability | In progress | crash.test.ts (≥ 1000 edits with SIGKILL), disk-full retry test, external change reload; git merge flow pending. |
| AC-17 Worker resilience | Not verified | OOM/unload logic unit-tested on CPU; needs GPU. Failed takes keep their error (workflow). |
| AC-18 Design System compliance | In progress | UI kit visual + axe suite (both themes); workspace axe clean; reference-screen visual baselines and keyboard-only AC-01 pending. |
| AC-19 Catalog coverage | Not started | 446 / 1254 items have manifests (review pending); CAT-10 report not generated. |
| AC-20 Packages and portability | In progress | Project package opens in a new folder without the user library and validates (`package.test.ts`, CLI and server tests). Second machine (macOS/Linux) with frame comparison pending. |
| AC-21 Security and privacy | In progress | Malicious packages (path traversal, absolute paths, scripts, undeclared or oversized entries, hash mismatch, newer format) are refused without writing (`package.test.ts`); unsafe SVG refused or stripped (`import.test.ts`). Network audit and log/token checks pending. |
| AC-22 – AC-23 | Not started | Templates (M5), caption accuracy run (M3). |
| AC-24 Fresh setup | Not verified | README written; needs a clean Windows 11 laptop. |
