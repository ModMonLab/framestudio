"""Audio helpers: WAV/FLAC encode/decode, resampling, measurement."""

from __future__ import annotations

import io

import numpy as np
import soundfile as sf

from .errors import ApiError


def encode(samples: np.ndarray, sr: int, fmt: str = "wav") -> bytes:
    buf = io.BytesIO()
    data = np.clip(samples.astype(np.float32), -1.0, 1.0)
    if fmt == "flac":
        sf.write(buf, data, sr, format="FLAC", subtype="PCM_24")
    else:
        sf.write(buf, data, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def decode(data: bytes) -> tuple[np.ndarray, int]:
    try:
        samples, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    except Exception as e:  # noqa: BLE001 — any decoder failure is invalid input
        raise ApiError("INVALID_AUDIO", f"Audio could not be decoded: {e}") from e
    mono = samples.mean(axis=1)
    if mono.size == 0:
        raise ApiError("INVALID_AUDIO", "Audio is empty")
    return mono, int(sr)


def resample(x: np.ndarray, sr: int, target: int) -> np.ndarray:
    if sr == target:
        return x
    n = int(round(len(x) * target / sr))
    t_old = np.linspace(0.0, 1.0, num=len(x), endpoint=False)
    t_new = np.linspace(0.0, 1.0, num=n, endpoint=False)
    return np.interp(t_new, t_old, x).astype(np.float32)


def duration(x: np.ndarray, sr: int) -> float:
    return float(len(x)) / float(sr)


def peak_normalize(x: np.ndarray, peak: float = 0.89) -> np.ndarray:
    m = float(np.max(np.abs(x))) if x.size else 0.0
    return x if m <= 1e-9 else (x * (peak / m)).astype(np.float32)
