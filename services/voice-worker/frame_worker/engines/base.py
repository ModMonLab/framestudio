"""Engine and aligner plugin interfaces (FR-VWK-02). Engines declare capabilities; the API exposes exactly those."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

import numpy as np

from ..jobs import Job


@dataclass
class Audio:
    samples: np.ndarray
    sr: int
    seed: int | None = None
    settings: dict = field(default_factory=dict)


@dataclass
class Ref:
    """A reference clip: decoded audio, transcript and the emotion it represents."""

    samples: np.ndarray
    sr: int
    transcript: str
    emotion: str = "neutral"
    hash: str = ""


class Engine(Protocol):
    id: str
    version: str

    def capabilities(self) -> dict[str, Any]: ...

    def design(self, description: str, language: str, text: str, candidates: int, seed: int | None, job: Job) -> list[Audio]: ...

    def range(self, neutral: Ref, description: str, emotions: list[str], text: str, language: str, job: Job) -> list[tuple[str, Audio, float | None]]: ...

    def prepare(self, refs: list[Ref], model: str | None) -> str: ...

    def synthesize(self, text: str, language: str, refs: list[Ref], delivery: dict, takes: int, seed: int | None, job: Job) -> list[Audio]: ...

    def benchmark(self, model: str | None, job: Job) -> dict[str, Any]: ...

    def unload(self) -> None: ...

    def vram(self) -> dict[str, Any]: ...


class Aligner(Protocol):
    id: str

    def available(self) -> bool: ...

    def languages(self) -> list[str]: ...

    def align(self, samples: np.ndarray, sr: int, transcript: str, language: str, job: Job) -> dict[str, Any]: ...

    def transcribe(self, samples: np.ndarray, sr: int, language: str | None, job: Job) -> dict[str, Any]: ...

    def unload(self) -> None: ...
