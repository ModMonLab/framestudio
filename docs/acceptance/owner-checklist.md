# Owner checklist — what needs the reference machine or people

The build environment has no GPU, no Windows laptop and no listening panel. Everything below is implemented and tested
on CPU with the fixture worker where possible, but **is not verified** until the owner runs these steps. Results go
into `docs/acceptance/report.md` (the acceptance report) with the machine details.

Fixture audio used in automated tests is a deterministic test signal. It is never real speech and is labelled as such
in the Studio, the CLI, render reports and voice assets (P7, NFR-18).

## 1. Voice Worker on the reference GPU (NFR-06, AC-03, AC-17, AC-24)

1. Install per `services/voice-worker/README.md` (WSL2 script `scripts/setup-wsl.sh`, or the Dockerfile).
2. `frame-voice-worker doctor` — every check must pass (driver, CUDA 12.8 PyTorch with the GPU architecture in its
   arch list, models cached, ffmpeg). Save the output (`--json`).
3. `frame-voice-worker fetch-models --accept-licences` (Apache-2.0 Qwen3-TTS models; the command lists them first).
4. `frame-voice-worker benchmark --engine qwen3 --models Qwen/Qwen3-TTS-12Hz-1.7B-Base Qwen/Qwen3-TTS-12Hz-0.6B-Base`
   — record real-time factor and peak VRAM from `~/.cache/frame-voice-worker/benchmarks.jsonl` (NFR-06 target in SRS §10).
5. Start it: `frame-voice-worker serve --engine qwen3` and point Frame at it (`FRAME_WORKER_URL`, token in
   `FRAME_WORKER_TOKEN` when not on loopback).
6. Run the M1 slice against the real engine:
   `FRAME_TEST_WORKER_URL=http://127.0.0.1:8765 pnpm vitest run tools/test/slice.test.ts` and the Studio flow
   `FRAME_TEST_WORKER_URL=… pnpm --filter @frame/studio exec playwright test`. Both must pass with `fixture: false`.
7. AC-17: stop the worker during "Generate takes" — the take shows Failed with the reason; restart → generate again
   succeeds. Force out-of-memory (1.7B models with another GPU app holding VRAM) — the job reports OUT_OF_MEMORY and
   the next job succeeds.

## 2. Listening and visual sign-off

- **AC-03 listening panel (≥ 3 people):** designed voices, the 8-emotion range bank and 5 lines with different
  deliveries. Record the ratings in the acceptance report.
- **CAT-06 visual review:** every bundled content item has `review.status: pending` until a person reviews its preview
  sheet (both families, four views). Approvals are recorded in the item manifest (`review`).
- **AC-18:** keyboard-only run of AC-01, screen-reader labels (NVDA on Windows), 125 % and 150 % browser zoom.

## 3. Fresh setup (AC-24) and performance (AC-14, AC-15)

- Follow only the README on a clean Windows 11 laptop: install Node 22 + pnpm, ffmpeg, the server and Studio, the
  Voice Worker (WSL2 or Docker), run `worker doctor`, the benchmark, `pnpm test`, then AC-01.
- AC-14: on the reference project measure NFR-01/02/05 and record the machine.
- AC-15: 20 golden frames from Studio preview, CLI and export (automated pixel identity for preview vs CLI/server
  exists in `apps/studio/e2e/studio.spec.ts`); 10-minute episode sync measurement (NFR-04).

## 4. Builder, assets and direction walkthroughs (M2 and M3)

Each has an automated path in `tools/test/m2-acceptance.test.ts` or `tools/test/m3-acceptance.test.ts`; the owner
run checks the same scenario by hand in the Studio and judges the look and sound.

- **AC-02:** build a character with the builder in Flat, switch to Illustrated, check all four views, export it as
  `.framechar`, import it with a fresh profile (`FRAME_USER_DIR` pointing to an empty folder) and compare frames.
- **AC-11:** use one character in two episodes, save a new version from the builder, update only one scene's
  instance, close and reopen, then restore a project version from File → Versions.
- **AC-12:** import a real artist's layered PSD (front and three-quarter groups, `mouth_A` … `mouth_X` layers) into
  the rigging assistant, fix suggestions, save, and play a library gesture and a line on it.
- **AC-20:** File → Export project package, copy the `.frameproj` to a second machine (macOS or Linux), open it
  there without the original user library and compare a few frames with the first machine.
- **AC-06/07/08:** in the podcast studio, apply the interruption, double take and hand-over recipes, run Auto
  coverage, use a mug, a phone and a door from the Acting tab, generate sound cues, walk a character to a chair and
  sit; scrub through and check nothing jumps, slides or drifts.
- **CAT-08 listening check:** play the 20 synthesised sound effects (`content/assets/sfx`); they are procedural
  placeholders (no recordings) and stay `review: pending` until approved or replaced with recorded/licensed sounds.
