"""Worker configuration from environment variables (documented in README)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _list(v: str | None) -> list[str]:
    return [x.strip() for x in (v or "").split(",") if x.strip()]


@dataclass
class Config:
    host: str = "127.0.0.1"
    port: int = 8765
    #: Required whenever the worker binds to anything other than localhost (FR-VWK-06).
    token: str | None = None
    #: CORS origins allowed (Frame Server origins only).
    origins: list[str] = field(default_factory=lambda: ["http://127.0.0.1:5170", "http://localhost:5170"])
    #: Engine ids to load: "fixture" or "qwen3".
    engine: str = "fixture"
    aligner: str = "fixture"
    cache_dir: Path = Path(os.path.expanduser("~/.cache/frame-voice-worker"))
    model_dir: Path = Path(os.path.expanduser("~/.cache/frame-voice-worker/models"))
    #: Model size per task (FR-VWK-04).
    design_model: str = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
    clone_model: str = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
    align_model: str = "WAV2VEC2_ASR_BASE_960H"
    transcribe_model: str = "small.en"
    device: str = "cuda:0"
    blob_cache_mb: int = 2048
    max_text_chars: int = 1200
    max_ref_seconds: float = 60.0
    min_ref_seconds: float = 3.0

    @classmethod
    def from_env(cls) -> "Config":
        c = cls()
        e = os.environ
        c.host = e.get("FRAME_WORKER_HOST", c.host)
        c.port = int(e.get("FRAME_WORKER_PORT", c.port))
        c.token = e.get("FRAME_WORKER_TOKEN") or None
        if e.get("FRAME_WORKER_ORIGINS"):
            c.origins = _list(e.get("FRAME_WORKER_ORIGINS"))
        c.engine = e.get("FRAME_WORKER_ENGINE", c.engine)
        c.aligner = e.get("FRAME_WORKER_ALIGNER", "whisperx" if c.engine == "qwen3" else c.aligner)
        if e.get("FRAME_WORKER_CACHE"):
            c.cache_dir = Path(e["FRAME_WORKER_CACHE"])
            c.model_dir = c.cache_dir / "models"
        c.design_model = e.get("FRAME_WORKER_DESIGN_MODEL", c.design_model)
        c.clone_model = e.get("FRAME_WORKER_CLONE_MODEL", c.clone_model)
        c.device = e.get("FRAME_WORKER_DEVICE", c.device)
        c.blob_cache_mb = int(e.get("FRAME_WORKER_BLOB_CACHE_MB", c.blob_cache_mb))
        return c

    @property
    def localhost_only(self) -> bool:
        return self.host in ("127.0.0.1", "localhost", "::1")

    def validate(self) -> None:
        if not self.localhost_only and not self.token:
            raise SystemExit(
                "FRAME_WORKER_TOKEN is required when binding to a network address (FR-VWK-06). "
                "Set a long random token and configure the same token in Frame settings."
            )
