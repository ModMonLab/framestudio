"""
Qwen3-TTS engine (D-06, FR-VWK-02). API verified against qwen-tts 0.1.1 (docs/decisions/0006-qwen3-tts.md):

* VoiceDesign model: ``generate_voice_design(text, language, instruct)`` — description → voice, instruction control.
* Base model (clone): ``create_voice_clone_prompt(ref_audio=(wav, sr), ref_text)`` and
  ``generate_voice_clone(text, language, voice_clone_prompt=...)`` — no instruction control.

Emotional range bank (FR-VOI-03): the design model renders each emotion from the same description with an emotion
instruction; each candidate's speaker embedding is compared with the neutral reference (cosine similarity, reported
so Frame can flag drift). Takes are synthesised with the Base model cloning from the reference whose emotion matches
the requested delivery.
"""

from __future__ import annotations

import hashlib
from typing import Any

import numpy as np

from ..config import Config
from ..errors import ApiError
from ..jobs import Job
from ..models import ModelManager
from .base import Audio, Ref

LANGS = {"en": "English", "zh": "Chinese", "ja": "Japanese", "ko": "Korean", "de": "German", "fr": "French", "ru": "Russian", "pt": "Portuguese", "es": "Spanish", "it": "Italian"}

EMOTION_INSTRUCTIONS = {
    "neutral": "Speak naturally in a neutral, even tone.",
    "happy": "Speak with warm happiness, smiling in the voice.",
    "sad": "Speak sadly, softly and a little slower.",
    "angry": "Speak with controlled anger, firm and tense.",
    "nervous": "Speak nervously, with slight hesitations and a tight voice.",
    "whisper": "Whisper quietly and intimately.",
    "excited": "Speak with high excitement and energy.",
    "deadpan": "Speak in a flat, deadpan, unimpressed tone.",
}


def _torch():
    try:
        import torch
    except ImportError as e:
        raise ApiError("MODEL_NOT_INSTALLED", "PyTorch is not installed; install the worker with the [gpu] extra.") from e
    return torch


class Qwen3Engine:
    id = "qwen3-tts"
    version = "qwen-tts 0.1.1"

    def __init__(self, cfg: Config, models: ModelManager):
        self.cfg = cfg
        self.models = models
        self._prompts: dict[str, Any] = {}

    def _load(self, name: str):
        def loader():
            torch = _torch()
            from qwen_tts import Qwen3TTSModel  # type: ignore[import-not-found]

            kwargs: dict[str, Any] = {"device_map": self.cfg.device, "dtype": torch.bfloat16}
            try:
                import flash_attn  # type: ignore[import-not-found]  # noqa: F401

                kwargs["attn_implementation"] = "flash_attention_2"
            except ImportError:
                pass
            return Qwen3TTSModel.from_pretrained(name, **kwargs)

        return self.models.get(name, loader)

    def capabilities(self) -> dict[str, Any]:
        def size(n: str) -> str:
            return "1.7B" if "1.7B" in n else "0.6B" if "0.6B" in n else "?"

        return {
            "id": self.id,
            "fixture": False,
            "label": "Qwen3-TTS (self-hosted)",
            "models": [
                {"id": self.cfg.design_model, "size": size(self.cfg.design_model), "task": "design"},
                {"id": self.cfg.clone_model, "size": size(self.cfg.clone_model), "task": "clone"},
                {"id": self.cfg.clone_model, "size": size(self.cfg.clone_model), "task": "tts"},
            ],
            "languages": list(LANGS),
            # The clone (take) model has no instruction or pace control; emotion is realised by choosing the
            # range-bank reference (FR-VOI-08 honesty). Instruction applies to voice design only.
            "controls": {"emotion": list(EMOTION_INSTRUCTIONS), "pace": None, "instruction": False, "designInstruction": True, "seed": True, "pauses": False},
            "activeModels": {"design": self.cfg.design_model, "clone": self.cfg.clone_model},
        }

    def _lang(self, language: str) -> str:
        lang = LANGS.get(language[:2].lower())
        if not lang:
            raise ApiError("LANGUAGE_UNSUPPORTED", f"Language {language!r} is not supported by Qwen3-TTS", {"supported": list(LANGS)})
        return lang

    def _seed(self, seed: int | None) -> int:
        torch = _torch()
        s = int(seed if seed is not None else np.random.randint(0, 2**31 - 1))
        torch.manual_seed(s)
        return s

    def design(self, description: str, language: str, text: str, candidates: int, seed: int | None, job: Job) -> list[Audio]:
        lang = self._lang(language)
        model = self._load(self.cfg.design_model)
        out = []
        for i in range(candidates):
            job.check()
            s = self._seed(None if seed is None else seed + i)
            wavs, sr = self.models.run(lambda: model.generate_voice_design(text=text, language=lang, instruct=description))
            out.append(Audio(np.asarray(wavs[0], dtype=np.float32), int(sr), s, {"model": self.cfg.design_model}))
            job.report((i + 1) / candidates, f"Generating candidate {i + 1} of {candidates}")
        return out

    def _embedding(self, ref: Ref) -> np.ndarray | None:
        """Speaker embedding via the Base model's x-vector prompt (best effort; None if unavailable)."""
        model = self._load(self.cfg.clone_model)
        try:
            items = model.create_voice_clone_prompt(ref_audio=(ref.samples, ref.sr), ref_text=ref.transcript, x_vector_only_mode=True)
        except Exception:  # noqa: BLE001
            return None
        cand = items[0] if isinstance(items, (list, tuple)) and items else items
        for attr in ("ref_spk_embedding", "spk_embedding", "x_vector", "speaker_embedding"):
            v = getattr(cand, attr, None) if not isinstance(cand, dict) else cand.get(attr)
            if v is not None:
                try:
                    return np.asarray(v.float().cpu().numpy() if hasattr(v, "cpu") else v, dtype=np.float32).ravel()
                except Exception:  # noqa: BLE001
                    return None
        return None

    def range(self, neutral: Ref, description: str, emotions: list[str], text: str, language: str, job: Job):
        lang = self._lang(language)
        rendered: list[tuple[str, Audio]] = []
        model = self._load(self.cfg.design_model)
        for i, emo in enumerate(emotions):
            job.check()
            instruct = f"{description}. {EMOTION_INSTRUCTIONS.get(emo, f'Emotion: {emo}.')}"
            s = self._seed(None)
            wavs, sr = self.models.run(lambda: model.generate_voice_design(text=text, language=lang, instruct=instruct))
            rendered.append((emo, Audio(np.asarray(wavs[0], dtype=np.float32), int(sr), s, {"instruct": instruct})))
            job.report((i + 1) / (len(emotions) + 1), f"Rendering {emo} reference")
        # Similarity against the neutral reference (one model swap for all).
        base = self._embedding(neutral)
        out = []
        for emo, a in rendered:
            sim = None
            if base is not None:
                e = self._embedding(Ref(a.samples, a.sr, text, emo))
                if e is not None and e.shape == base.shape:
                    sim = float(np.dot(base, e) / (np.linalg.norm(base) * np.linalg.norm(e) + 1e-9))
            out.append((emo, a, sim))
        return out

    def prepare(self, refs: list[Ref], model_name: str | None) -> str:
        key = "sha256-" + hashlib.sha256(("qwen3|" + (model_name or self.cfg.clone_model) + "|" + "|".join(r.hash for r in refs)).encode()).hexdigest()
        if key not in self._prompts:
            model = self._load(model_name or self.cfg.clone_model)
            self._prompts[key] = {r.emotion: self.models.run(lambda r=r: model.create_voice_clone_prompt(ref_audio=(r.samples, r.sr), ref_text=r.transcript, x_vector_only_mode=False)) for r in refs}
        return key

    def synthesize(self, text: str, language: str, refs: list[Ref], delivery: dict, takes: int, seed: int | None, job: Job) -> list[Audio]:
        if delivery.get("instruction"):
            raise ApiError("UNSUPPORTED_CONTROL", "The clone model does not support instruction text; choose an emotion reference instead.", {"control": "instruction"})
        if delivery.get("pace") not in (None, 1, 1.0):
            raise ApiError("UNSUPPORTED_CONTROL", "Pace is not supported by Qwen3-TTS takes.", {"control": "pace"})
        if not refs:
            raise ApiError("REFERENCE_TOO_SHORT", "A voice reference is required")
        lang = self._lang(language)
        emo = delivery.get("emotion") or "neutral"
        ref = next((r for r in refs if r.emotion == emo), None) or next((r for r in refs if r.emotion == "neutral"), refs[0])
        key = self.prepare(refs, self.cfg.clone_model)
        prompt = self._prompts[key][ref.emotion]
        model = self._load(self.cfg.clone_model)
        out = []
        for i in range(takes):
            job.check()
            s = self._seed(None if seed is None else seed + i)
            wavs, sr = self.models.run(lambda: model.generate_voice_clone(text=text, language=lang, voice_clone_prompt=prompt))
            out.append(Audio(np.asarray(wavs[0], dtype=np.float32), int(sr), s, {"model": self.cfg.clone_model, "reference": ref.emotion}))
            job.report((i + 1) / takes, f"Generating take {i + 1} of {takes}")
        return out

    def benchmark(self, model: str | None, job: Job) -> dict[str, Any]:
        import time

        torch = _torch()
        name = model or self.cfg.clone_model
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
        text = "This sentence measures how quickly the selected model can speak on this machine."
        if "VoiceDesign" in name:
            m = self._load(name)
            t0 = time.perf_counter()
            wavs, sr = self.models.run(lambda: m.generate_voice_design(text=text, language="English", instruct="A calm adult voice."))
        else:
            m = self._load(name)
            ref = np.zeros(24000 * 3, dtype=np.float32)
            ref[::240] = 0.1
            prompt = m.create_voice_clone_prompt(ref_audio=(ref, 24000), ref_text="Reference.", x_vector_only_mode=True)
            t0 = time.perf_counter()
            wavs, sr = self.models.run(lambda: m.generate_voice_clone(text=text, language="English", voice_clone_prompt=prompt))
        dt = time.perf_counter() - t0
        dur = len(wavs[0]) / sr
        peak = torch.cuda.max_memory_allocated() / 1e6 if torch.cuda.is_available() else 0
        return {"model": name, "rtf": round(dt / max(1e-6, dur), 3), "peakVramMB": round(peak), "audioSeconds": round(dur, 2), "seconds": round(dt, 2), "notes": f"device {self.cfg.device}"}

    def unload(self) -> None:
        self._prompts.clear()
        self.models.unload()

    def vram(self) -> dict[str, Any]:
        return self.models.vram()
