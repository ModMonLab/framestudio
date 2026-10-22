# 0012 — Voice Worker stack

Status: Accepted · Requirements: FR-VWK-01..08, API-01..06, FR-LIP-01, NFR-06, AC-17

## Decision

- **Server:** FastAPI 0.120.0 + uvicorn 0.38.0 (MIT / BSD-3), pydantic 2.14.1 (MIT). One job thread so exactly one
  GPU model is resident (FR-VWK-03); blobs are content-addressed (sha256) in an LRU directory store.
- **Engine:** Qwen3-TTS via `qwen-tts` 0.1.1 (Apache-2.0), API recorded in 0006. Torch/torchaudio 2.8.0 with the
  CUDA 12.8 wheels (`cu128`), the first line that ships Blackwell (sm_120) kernels; `doctor` checks the GPU
  architecture is in `torch.cuda.get_arch_list()`.
- **Aligner:** WhisperX 3.8.6 (BSD-2-Clause) wav2vec2 forced alignment of the known transcript; phonemes from g2p-en
  2.1.0 (Apache-2.0) placed on character alignments inside each word. Unknown text: faster-whisper transcription then
  forced alignment (`transcribed+forced`). Frame falls back to amplitude lip sync when no aligner is available.
- **Fixture engine (API-04):** deterministic tone/noise "speech" and evenly spaced alignments; every response carries
  `fixture: true` and Frame labels it "Fixture audio — not real speech" (P7, NFR-18).
- **Contract:** `services/voice-worker/openapi.yaml` is generated from the app and drift-tested in pytest; the TS
  client `@frame/voice-client` mirrors it and maps worker codes to Frame error codes.

## Evidence

- `pytest` (15 tests) on CPU: health, capabilities, token auth, network-bind refusal, idempotency, design/range/synthesize/align with the
  fixture engine, cancel, coded errors, model swap and OOM recovery (`tests/test_models.py`), OpenAPI drift.
- `packages/voice-client/test/client.test.ts`: token, idempotency key, polling, error mapping.

## Not verified here

Real Qwen3-TTS synthesis, WhisperX alignment quality, real-time factor and VRAM (NFR-06, AC-03, AC-17, AC-24) need
the reference GPU machine; see `docs/acceptance/owner-checklist.md`.
