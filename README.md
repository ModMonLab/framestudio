# Frame

Frame is a 2D animation directing studio: build characters, stage scenes, direct performances with designed voices,
and export finished video. Projects are folders of JSON and media on your disk; the Studio (browser), the `frame`
CLI and agents all edit them through the same engine.

Status: in development (milestone M1, vertical slice). See [docs/PROGRESS.md](docs/PROGRESS.md) for exactly what is
done, in progress and not yet verified, and [docs/spec/](docs/spec/) for the specification.

## Requirements

- Node.js 22 LTS and pnpm 10 (`corepack enable`)
- ffmpeg on the PATH (or `FRAME_FFMPEG=/path/to/ffmpeg`) for video export
  - Windows: `winget install Gyan.FFmpeg` or `choco install ffmpeg` · macOS: `brew install ffmpeg` · Linux: `sudo apt install ffmpeg`
- For generated speech: the Voice Worker on a machine with an NVIDIA GPU (see below). Everything else works without it.

Supported on Windows (native or WSL2), macOS and Linux.

## Install and run

```sh
pnpm install
pnpm studio:build                      # builds the browser Studio
pnpm frame init MyShow.frame --name "My show"
pnpm frame server start --open MyShow.frame
# open http://127.0.0.1:4848 and open the project folder
```

A ready-made sample (two hosts in the podcast studio, two lines) can be written with
`pnpm sample Sample.frame` (lines without takes: design voices and generate takes in the Studio), or
`pnpm sample Sample.frame --takes fixture` (fixture takes — test signals, not real speech — so it plays and exports
without a worker).

The server binds to `127.0.0.1:4848`. Binding to another address requires `--token` (or `FRAME_SERVER_TOKEN`).

## CLI

Every command has `--help`; `pnpm frame help` lists them. Global options: `--project`, `--json`, `--dry-run`,
`--base-revision`, `--yes`, `--quiet`, `--verbose`. Examples:

```sh
pnpm frame info --project MyShow.frame
pnpm frame validate --project MyShow.frame
pnpm frame render frame --project MyShow.frame --at 2.5 --out shot.png
pnpm frame render video --project MyShow.frame --preset out.portrait-social --out short.mp4
pnpm frame render presets
pnpm frame apply edits.json --project MyShow.frame        # batches of engine commands
```

## Voice Worker (generated speech)

The worker is a separate Python service (Qwen3-TTS for voices and takes, WhisperX for alignment). Install it on the
GPU machine following [services/voice-worker/README.md](services/voice-worker/README.md) (WSL2 script or Docker),
then:

```sh
frame-voice-worker doctor                         # drivers, CUDA, models, VRAM
frame-voice-worker fetch-models --accept-licences
frame-voice-worker serve --engine qwen3
FRAME_WORKER_URL=http://127.0.0.1:8765 pnpm frame server start
```

For development and tests, `frame-voice-worker serve --engine fixture` runs on any CPU. Its audio is a deterministic
test signal — never real speech — and Frame labels it as such everywhere.

## Tests

```sh
pnpm check                         # typecheck, lint, unit and integration tests (needs ffmpeg)
pnpm test:visual                   # UI kit screenshots + accessibility (Playwright)
cd services/voice-worker && pytest # Voice Worker API (CPU, fixture engine)
FRAME_TEST_WORKER_URL=http://127.0.0.1:8765 pnpm vitest run tools/test/slice.test.ts   # with a running worker
FRAME_TEST_WORKER_URL=http://127.0.0.1:8765 pnpm test:e2e                              # Studio end to end
```

What still needs the reference machine and people (GPU benchmark, listening panel, visual sign-off, fresh Windows
setup) is listed in [docs/acceptance/owner-checklist.md](docs/acceptance/owner-checklist.md).

## Repository layout

`packages/` — schema, core engine, rig, render, assets, io, voice-client, server, cli, design-tokens, ui ·
`apps/studio` — the Studio · `apps/gallery` — UI kit stories · `services/voice-worker` — Python worker ·
`catalog/` — catalog source · `content/` — bundled assets and fonts · `docs/decisions/` — architecture decisions.
