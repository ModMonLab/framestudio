# Decision log

Each file records one decision: context, choice, alternatives, consequences, and — for external dependencies — the verified API, version and licence (SRS §2.3). Decisions D-01…D-12 in the SRS are settled and are not repeated here.

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-toolchain.md) | pnpm monorepo, TypeScript 5.9 strict, source-exported packages, Vitest, ESLint | Accepted |
| [0002](0002-schemas-typebox.md) | JSON Schemas with TypeBox; validation with TypeBox compiler | Accepted |
| [0003](0003-command-engine-immer.md) | Command engine on immer patches; revision rebase by declared touch keys | Accepted |
| [0004](0004-persistence-journal.md) | Durable commit journal of post-commit entity snapshots for crash recovery | Accepted |
| [0005](0005-renderer-canvaskit.md) | Renderer: canvaskit-wasm 0.40.0 "full" build, CPU raster, bundled fonts only | Accepted (verified) |
| [0006](0006-qwen3-tts.md) | Voice engine API: qwen-tts 0.1.1 (VoiceDesign + Base clone) | Accepted (API verified from package; not run on GPU) |
| [0007](0007-accent-contrast-tokens.md) | Additional accent tokens for text on/in accent (WCAG AA) | Accepted — owner review requested |
| [0008](0008-build-environment-limits.md) | No GPU in the implementation container | Recorded |
| [0009](0009-catalog-source.md) | Catalog source format (`catalog/*.yaml`) and document generation | Accepted |
| [0010](0010-ui-stack.md) | UI stack: React 19.2, Vite 7, lucide-react icons, Playwright visual tests | Accepted |
| [0011](0011-schema-extensions.md) | Schema details the SRS leaves open (gaze track, versions folder, track owner) | Accepted |
| [0012](0012-voice-worker-stack.md) | Voice Worker stack: FastAPI, Qwen3-TTS, WhisperX + g2p-en, fixture engine | Accepted |
| [0013](0013-export-audio-ffmpeg.md) | Export: pure audio plan, offline mix, BS.1770 loudness, ffmpeg encoding, caption styles as content | Accepted |
| [0014](0014-frame-server.md) | Frame Server: Fastify + WebSocket entity deltas, job queues, voice workflows | Accepted |
| [0015](0015-studio-architecture.md) | Studio: server mirror via deltas, shared CPU renderer in the browser, hash routes, M1 builder scope | Accepted |
| [0016](0016-mcp-server.md) | MCP server: low-level SDK `Server` (1.31.0) over the Frame Server API | Accepted |
| [0017](0017-packages.md) | Packages: fflate 0.8.2 zip, declared contents, safe reader, refuse-or-rename conflicts | Accepted |
| [0018](0018-file-import.md) | File import: sniffed rasters, SVG parsed as data (fast-xml-parser 5.2.5), rights statement on every import | Accepted |
