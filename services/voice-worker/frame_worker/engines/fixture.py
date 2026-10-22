"""
Fixture engine and aligner (API-04): deterministic canned audio for tests and offline demos.

The audio is a synthetic buzz with syllable-shaped envelopes — clearly not speech. Capabilities report the engine id
"fixture" so Frame labels every result as fixture output (P7, NFR-18).
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

import numpy as np

from ..jobs import Job
from .base import Audio, Ref

SR = 24000
WORD_S = 0.30
GAP_S = 0.06


def _seed_of(*parts: Any) -> int:
    h = hashlib.sha256("|".join(str(p) for p in parts).encode()).digest()
    return int.from_bytes(h[:4], "little")


def words_of(text: str) -> list[str]:
    return [w for w in re.findall(r"[A-Za-z0-9']+", re.sub(r"\[pause\s+[\d.]+s\]", " ", text))]


def pauses_of(text: str) -> list[tuple[int, float]]:
    """(word index the pause follows, seconds) for explicit pause markers and ellipses (FR-DLG-08)."""
    out: list[tuple[int, float]] = []
    idx = 0
    for tok in re.findall(r"\[pause\s+[\d.]+s\]|…|\.\.\.|[A-Za-z0-9']+", text):
        if tok.startswith("[pause"):
            out.append((idx, float(re.findall(r"[\d.]+", tok)[0])))
        elif tok in ("…", "..."):
            out.append((idx, 0.4))
        else:
            idx += 1
    return out


def layout(text: str, pace: float = 1.0) -> list[tuple[str, float, float]]:
    """Deterministic word timings for fixture audio: (word, start, end)."""
    t = 0.12
    pauses = dict(pauses_of(text))
    out = []
    for i, w in enumerate(words_of(text)):
        d = (WORD_S + 0.03 * max(0, len(w) - 4)) / pace
        out.append((w, t, t + d))
        t += d + GAP_S / pace + pauses.get(i + 1, 0.0)
    return out


def synth(text: str, pitch: float, seed: int, pace: float = 1.0, energy: float = 1.0) -> np.ndarray:
    lay = layout(text, pace)
    total = (lay[-1][2] if lay else 0.3) + 0.15
    n = int(total * SR)
    x = np.zeros(n, dtype=np.float32)
    rng = np.random.default_rng(seed)
    for w, s, e in lay:
        i0, i1 = int(s * SR), int(e * SR)
        t = np.arange(i1 - i0) / SR
        f0 = pitch * (1 + 0.05 * rng.standard_normal()) * (1 + 0.08 * np.sin(2 * np.pi * 3 * t / max(1e-3, e - s)))
        phase = 2 * np.pi * np.cumsum(f0) / SR
        buzz = sum(np.sin(k * phase) / k for k in range(1, 7))
        syll = max(1, len(w) // 3)
        env = np.abs(np.sin(np.pi * syll * t / max(1e-3, e - s))) ** 0.6
        x[i0:i1] += (0.22 * energy * buzz * env).astype(np.float32)
    return x


def _voice_pitch(refs: list[Ref] | None, description: str = "") -> float:
    key = "|".join(r.hash or r.transcript for r in refs) if refs else description
    return 110 + (_seed_of(key) % 140)


class FixtureEngine:
    id = "fixture"
    version = "1"

    def capabilities(self) -> dict[str, Any]:
        return {
            "id": "fixture",
            "fixture": True,
            "label": "Fixture worker (synthetic test audio, not speech)",
            "models": [
                {"id": "fixture-design", "size": "0", "task": "design"},
                {"id": "fixture-clone", "size": "0", "task": "clone"},
                {"id": "fixture-tts", "size": "0", "task": "tts"},
            ],
            "languages": ["en"],
            "controls": {"emotion": ["neutral", "happy", "sad", "angry", "nervous", "whisper", "excited", "deadpan"], "pace": {"min": 0.7, "max": 1.4}, "instruction": True, "seed": True, "pauses": True},
            "activeModels": {"design": "fixture-design", "clone": "fixture-clone"},
        }

    def design(self, description: str, language: str, text: str, candidates: int, seed: int | None, job: Job) -> list[Audio]:
        out = []
        for i in range(candidates):
            job.check()
            s = (seed if seed is not None else _seed_of(description)) + i
            pitch = 110 + (_seed_of(description, s) % 140)
            out.append(Audio(synth(text, pitch, s), SR, s, {"description": description}))
            job.report((i + 1) / candidates, f"Generating candidate {i + 1} of {candidates}")
        return out

    def range(self, neutral: Ref, description: str, emotions: list[str], text: str, language: str, job: Job):
        pitch = _voice_pitch([neutral])
        out = []
        for i, emo in enumerate(emotions):
            job.check()
            mult = {"happy": 1.08, "sad": 0.92, "angry": 1.04, "nervous": 1.1, "whisper": 1.0, "excited": 1.15, "deadpan": 0.97}.get(emo, 1.0)
            energy = 0.35 if emo == "whisper" else 1.0
            s = _seed_of(neutral.hash, emo)
            out.append((emo, Audio(synth(text, pitch * mult, s, energy=energy), SR, s, {"emotion": emo}), 1.0))
            job.report((i + 1) / len(emotions), f"Building {emo} reference")
        return out

    def prepare(self, refs: list[Ref], model: str | None) -> str:
        return "sha256-" + hashlib.sha256(("fixture|" + "|".join(r.hash for r in refs)).encode()).hexdigest()

    def synthesize(self, text: str, language: str, refs: list[Ref], delivery: dict, takes: int, seed: int | None, job: Job) -> list[Audio]:
        emo = delivery.get("emotion") or "neutral"
        ref = next((r for r in refs if r.emotion == emo), refs[0] if refs else None)
        pitch = _voice_pitch([ref] if ref else None, text)
        pace = float(delivery.get("pace") or 1.0)
        out = []
        for i in range(takes):
            job.check()
            s = (seed if seed is not None else _seed_of(text, emo)) + i
            out.append(Audio(synth(text, pitch, s, pace=pace), SR, s, {"emotion": emo, "pace": pace, "reference": ref.emotion if ref else None}))
            job.report((i + 1) / takes, f"Generating take {i + 1} of {takes}")
        return out

    def benchmark(self, model: str | None, job: Job) -> dict[str, Any]:
        import time

        t0 = time.perf_counter()
        a = synth("The quick brown fox jumps over the lazy dog " * 3, 140, 1)
        dt = time.perf_counter() - t0
        return {"rtf": dt / (len(a) / SR), "peakVramMB": 0, "notes": "Fixture engine: CPU synthetic audio, not representative of speech models."}

    def unload(self) -> None:
        pass

    def vram(self) -> dict[str, Any]:
        return {"name": "none (fixture)", "vramTotal": 0, "vramUsed": 0}


# ------------------------------------------------------------------ fixture aligner

_DIGRAPHS = [("tion", ["SH", "AH", "N"]), ("th", ["TH"]), ("sh", ["SH"]), ("ch", ["CH"]), ("ph", ["F"]), ("ng", ["NG"]), ("ee", ["IY"]), ("ea", ["IY"]), ("oo", ["UW"]), ("ou", ["AW"]), ("ow", ["OW"]), ("ai", ["EY"]), ("ay", ["EY"]), ("oa", ["OW"]), ("ck", ["K"]), ("qu", ["K", "W"])]
_LETTERS = {"a": ["AE"], "b": ["B"], "c": ["K"], "d": ["D"], "e": ["EH"], "f": ["F"], "g": ["G"], "h": ["HH"], "i": ["IH"], "j": ["JH"], "k": ["K"], "l": ["L"], "m": ["M"], "n": ["N"], "o": ["AA"], "p": ["P"], "q": ["K"], "r": ["R"], "s": ["S"], "t": ["T"], "u": ["AH"], "v": ["V"], "w": ["W"], "x": ["K", "S"], "y": ["IY"], "z": ["Z"]}


def rough_phonemes(word: str) -> list[str]:
    """Rule-based letter-to-phoneme approximation (fixture only; the real aligner uses g2p-en)."""
    w = word.lower().strip("'")
    out: list[str] = []
    i = 0
    while i < len(w):
        for dg, ph in _DIGRAPHS:
            if w.startswith(dg, i):
                out += ph
                i += len(dg)
                break
        else:
            ch = w[i]
            if ch == "e" and i == len(w) - 1 and len(w) > 2:
                i += 1
                continue
            out += _LETTERS.get(ch, [])
            i += 1
    return out or ["AH"]


def distribute(words: list[tuple[str, float, float]], phon_fn=rough_phonemes) -> list[dict]:
    phonemes = []
    for w, s, e in words:
        ph = phon_fn(w)
        d = (e - s) / len(ph)
        for k, p in enumerate(ph):
            phonemes.append({"p": p, "start": round(s + k * d, 4), "end": round(s + (k + 1) * d, 4)})
    return phonemes


class FixtureAligner:
    id = "fixture"

    def available(self) -> bool:
        return True

    def languages(self) -> list[str]:
        return ["en"]

    def align(self, samples: np.ndarray, sr: int, transcript: str, language: str, job: Job) -> dict[str, Any]:
        words = words_of(transcript)
        dur = len(samples) / sr
        lay = layout(transcript)
        # Fixture audio follows the deterministic layout; other audio gets words spread over the voiced region.
        if lay and abs((lay[-1][2] + 0.15) - dur) < 0.05:
            timed = lay
            conf = 0.99
        else:
            env = np.abs(samples)
            thr = max(1e-4, float(np.percentile(env, 95)) * 0.1)
            voiced = np.where(env > thr)[0]
            s0 = voiced[0] / sr if voiced.size else 0.0
            s1 = voiced[-1] / sr if voiced.size else dur
            weights = [max(1, len(w)) for w in words] or [1]
            total = sum(weights)
            t = s0
            timed = []
            for w, wt in zip(words, weights):
                d = (s1 - s0) * wt / total
                timed.append((w, t, t + d * 0.9))
                t += d
            conf = 0.4
        return {
            "words": [{"text": w, "start": round(s, 4), "end": round(e, 4)} for w, s, e in timed],
            "phonemes": distribute(timed),
            "confidence": conf,
            "method": "fixture",
            "aligner": "fixture",
        }

    def transcribe(self, samples: np.ndarray, sr: int, language: str | None, job: Job) -> dict[str, Any]:
        return {"text": "", "words": [], "method": "fixture", "note": "The fixture worker cannot transcribe; provide a transcript."}

    def unload(self) -> None:
        pass
