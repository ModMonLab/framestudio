"""Content-addressed blob cache (FR-VWK-05, API-02): the worker holds no project data, only a bounded cache."""

from __future__ import annotations

import hashlib
import os
import threading
from pathlib import Path

from .errors import ApiError


def sha256_hex(data: bytes) -> str:
    return "sha256-" + hashlib.sha256(data).hexdigest()


class BlobStore:
    def __init__(self, root: Path, max_mb: int):
        self.root = root
        self.max_bytes = max_mb * 1024 * 1024
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path(self, h: str) -> Path:
        if not h.startswith("sha256-") or len(h) != 71 or any(c not in "0123456789abcdef" for c in h[7:]):
            raise ApiError("NOT_FOUND", f"Invalid blob hash {h!r}")
        return self.root / h[7:9] / h

    def put(self, data: bytes) -> str:
        h = sha256_hex(data)
        p = self._path(h)
        with self._lock:
            if not p.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
                tmp = p.with_suffix(".tmp")
                tmp.write_bytes(data)
                os.replace(tmp, p)
            else:
                os.utime(p)
            self._evict()
        return h

    def get(self, h: str) -> bytes:
        p = self._path(h)
        if not p.exists():
            raise ApiError("NOT_FOUND", f"Blob {h} is not in the worker cache", {"hash": h})
        os.utime(p)
        return p.read_bytes()

    def has(self, h: str) -> bool:
        try:
            return self._path(h).exists()
        except ApiError:
            return False

    def _evict(self) -> None:
        files = [p for p in self.root.glob("*/*") if p.is_file() and not p.name.endswith(".tmp")]
        total = sum(p.stat().st_size for p in files)
        if total <= self.max_bytes:
            return
        # Least recently used first.
        for p in sorted(files, key=lambda q: q.stat().st_mtime):
            if total <= self.max_bytes * 0.8:
                break
            total -= p.stat().st_size
            p.unlink(missing_ok=True)
