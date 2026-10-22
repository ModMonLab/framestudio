"""
GPU model manager (FR-VWK-03): exactly one large model resident at a time; swapping unloads the previous one.
Out-of-memory errors unload everything and are reported as OUT_OF_MEMORY so the worker recovers (AC-17).
"""

from __future__ import annotations

import gc
import threading
from typing import Any, Callable

from .errors import ApiError


class ModelManager:
    def __init__(self, device: str = "cuda:0"):
        self.device = device
        self._lock = threading.RLock()
        self._key: str | None = None
        self._model: Any = None
        self.peak_mb = 0.0

    @property
    def loaded(self) -> str | None:
        return self._key

    def get(self, key: str, loader: Callable[[], Any]) -> Any:
        with self._lock:
            if self._key == key and self._model is not None:
                return self._model
            self.unload()
            try:
                self._model = loader()
            except Exception as e:  # noqa: BLE001
                self.unload()
                raise translate(e) from e
            self._key = key
            return self._model

    def unload(self) -> None:
        with self._lock:
            self._model = None
            self._key = None
            gc.collect()
            try:
                import torch

                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass

    def run(self, fn: Callable[[], Any]) -> Any:
        """Runs GPU work; on OOM unloads models and raises OUT_OF_MEMORY."""
        try:
            out = fn()
        except Exception as e:  # noqa: BLE001
            err = translate(e)
            if err.code == "OUT_OF_MEMORY":
                self.unload()
            raise err from e
        self._track_peak()
        return out

    def _track_peak(self) -> None:
        try:
            import torch

            if torch.cuda.is_available():
                self.peak_mb = max(self.peak_mb, torch.cuda.max_memory_allocated() / 1e6)
        except ImportError:
            pass

    def vram(self) -> dict[str, Any]:
        try:
            import torch

            if torch.cuda.is_available():
                free, total = torch.cuda.mem_get_info()
                return {"name": torch.cuda.get_device_name(0), "vramTotal": int(total / 1e6), "vramUsed": int((total - free) / 1e6), "loaded": self._key}
        except ImportError:
            pass
        return {"name": "unavailable", "vramTotal": 0, "vramUsed": 0, "loaded": self._key}


def translate(e: Exception) -> ApiError:
    if isinstance(e, ApiError):
        return e
    text = f"{type(e).__name__}: {e}"
    if "out of memory" in text.lower() or type(e).__name__ == "OutOfMemoryError":
        return ApiError("OUT_OF_MEMORY", "The GPU ran out of memory; models were unloaded. Retry, or select a smaller model.", {"cause": text[:400]})
    if isinstance(e, (FileNotFoundError, OSError)) and ("model" in text.lower() or "repo" in text.lower()):
        return ApiError("MODEL_NOT_INSTALLED", "A required model is not installed. Run `frame-voice-worker fetch-models --accept-licences`.", {"cause": text[:400]})
    return ApiError("ENGINE_ERROR", text[:500])
