# Frame Voice Worker — GPU image for NVIDIA RTX 50-series (Blackwell, sm_120) and older GPUs.
# Build:  docker build -t frame-voice-worker services/voice-worker
# Run:    docker run --gpus all -p 127.0.0.1:8765:8765 -v frame-voice-cache:/cache frame-voice-worker
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive PIP_NO_CACHE_DIR=1 PYTHONUNBUFFERED=1 \
    FRAME_WORKER_HOST=0.0.0.0 FRAME_WORKER_ENGINE=qwen3 FRAME_WORKER_ALIGNER=whisperx \
    FRAME_WORKER_CACHE=/cache HF_HOME=/cache/hf
RUN apt-get update && apt-get install -y --no-install-recommends python3.12 python3.12-venv python3-pip ffmpeg libsndfile1 sox git \
    && rm -rf /var/lib/apt/lists/*
RUN python3.12 -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY pyproject.toml ./
COPY frame_worker ./frame_worker
# PyTorch CUDA 12.8 wheels include sm_120 kernels (RTX 50-series).
RUN pip install --index-url https://download.pytorch.org/whl/cu128 torch==2.8.0 torchaudio==2.8.0 \
    && pip install -e '.[gpu]'
EXPOSE 8765
# A token is mandatory when listening on 0.0.0.0 inside the container (FR-VWK-06): pass -e FRAME_WORKER_TOKEN=...
CMD ["frame-voice-worker", "serve"]
