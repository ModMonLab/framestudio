# Frame Voice Worker

Self-hosted speech service implementing the **Frame Voice API v1** (`openapi.yaml` is normative; SRS §5).
Engines: **Qwen3-TTS** (VoiceDesign + Base/clone) and a deterministic **fixture** engine for tests and offline demos.
Aligner: **WhisperX** forced alignment with **g2p-en** phonemes (fixture aligner without a GPU).

## Quick start (fixture engine, no GPU)

```bash
cd services/voice-worker
python3 -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
frame-voice-worker serve --engine fixture        # http://127.0.0.1:8765
```
Fixture output is synthetic buzzing, not speech; Frame labels it “Fixture voice”.

## Reference laptop (RTX 5060 Laptop GPU, 8 GB, WSL2)

```bash
bash services/voice-worker/scripts/setup-wsl.sh            # installs CUDA 12.8 PyTorch, deps, runs doctor
frame-voice-worker fetch-models --accept-licences          # after reading LICENSES.md
FRAME_WORKER_ENGINE=qwen3 frame-voice-worker serve
FRAME_WORKER_ENGINE=qwen3 frame-voice-worker benchmark --models Qwen/Qwen3-TTS-12Hz-1.7B-Base Qwen/Qwen3-TTS-12Hz-0.6B-Base
```
Or Docker Desktop with the NVIDIA runtime:
```bash
docker build -t frame-voice-worker services/voice-worker
docker run --gpus all -p 127.0.0.1:8765:8765 -e FRAME_WORKER_TOKEN=change-me -v frame-voice-cache:/cache frame-voice-worker
```

## Configuration (environment)

| Variable | Default | Meaning |
|---|---|---|
| `FRAME_WORKER_HOST` / `FRAME_WORKER_PORT` | `127.0.0.1` / `8765` | Bind address. Any non-localhost bind requires a token. |
| `FRAME_WORKER_TOKEN` | — | Bearer token; also set it in Frame → Settings → Voice worker. |
| `FRAME_WORKER_ORIGINS` | Frame Server origins | CORS allow-list. |
| `FRAME_WORKER_ENGINE` | `fixture` | `fixture` or `qwen3`. |
| `FRAME_WORKER_DESIGN_MODEL` | `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | Voice design model. |
| `FRAME_WORKER_CLONE_MODEL` | `Qwen/Qwen3-TTS-12Hz-1.7B-Base` | Take model; use `…0.6B-Base` if 1.7B is slow or runs out of memory. |
| `FRAME_WORKER_CACHE` | `~/.cache/frame-voice-worker` | Blob cache and benchmark log. |
| `FRAME_WORKER_BLOB_CACHE_MB` | `2048` | Blob cache size (LRU eviction). |

## Exposing on a network

Bind to `0.0.0.0` only with `FRAME_WORKER_TOKEN` set, and put TLS in front (e.g. Caddy: `reverse_proxy 127.0.0.1:8765`). CORS is restricted to `FRAME_WORKER_ORIGINS`.

## GPU budget

One large model is resident at a time; jobs queue rather than run concurrently. Out-of-memory errors unload all models and return `OUT_OF_MEMORY`; the next job reloads what it needs.

## Tests

```bash
pip install -e '.[dev]' && pytest
python scripts/gen_openapi.py   # after changing the API; tests fail if openapi.yaml drifts
```
