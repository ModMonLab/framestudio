#!/usr/bin/env bash
# Frame Voice Worker setup for WSL2 Ubuntu on the reference laptop (RTX 5060 Laptop, 8 GB) — FR-VWK-07.
# Prerequisites (Windows): current NVIDIA driver with WSL support; WSL2 with Ubuntu 24.04.
# Usage: bash services/voice-worker/scripts/setup-wsl.sh [--accept-licences]
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== System packages"
sudo apt-get update
sudo apt-get install -y python3.12 python3.12-venv python3-pip ffmpeg libsndfile1 sox git

echo "== Python environment (.venv)"
python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
# CUDA 12.8 PyTorch wheels support Blackwell (sm_120) GPUs such as the RTX 5060.
pip install --index-url https://download.pytorch.org/whl/cu128 torch==2.8.0 torchaudio==2.8.0
pip install -e '.[gpu,dev]'

echo "== Doctor"
frame-voice-worker doctor || true

if [[ "${1:-}" == "--accept-licences" ]]; then
  frame-voice-worker fetch-models --accept-licences
else
  frame-voice-worker fetch-models
  echo "Review the licences above, then run: frame-voice-worker fetch-models --accept-licences"
fi

cat <<'MSG'

Start the worker (localhost only):
  source services/voice-worker/.venv/bin/activate
  FRAME_WORKER_ENGINE=qwen3 frame-voice-worker serve
Then run the benchmark once and keep the result:
  FRAME_WORKER_ENGINE=qwen3 frame-voice-worker benchmark --models Qwen/Qwen3-TTS-12Hz-1.7B-Base Qwen/Qwen3-TTS-12Hz-0.6B-Base Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
MSG
