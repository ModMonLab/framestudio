"""
Forced alignment with WhisperX 3.8.6 (BSD-2-Clause) and phonemes from g2p-en 2.1.0 (Apache-2.0) (FR-LIP-01).

Known text: one segment covering the whole take is aligned with ``whisperx.align``; per-word phonemes come from
g2p-en and are placed using character alignments inside the word (uniform split if absent).
Unknown text: transcribe with faster-whisper via ``whisperx.load_model`` first ("transcribed+forced").
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ..audio import resample
from ..config import Config
from ..errors import ApiError
from ..jobs import Job
from ..models import ModelManager

SR = 16000


class WhisperXAligner:
    id = "whisperx"

    def __init__(self, cfg: Config, models: ModelManager):
        self.cfg = cfg
        self.models = models
        self._g2p = None

    def available(self) -> bool:
        try:
            import whisperx  # type: ignore[import-not-found]  # noqa: F401

            return True
        except ImportError:
            return False

    def languages(self) -> list[str]:
        return ["en", "fr", "de", "es", "it", "ja", "zh", "nl", "uk", "pt"]

    def _device(self) -> str:
        return "cuda" if self.cfg.device.startswith("cuda") else "cpu"

    def _phonemes_for(self, word: str) -> list[str]:
        if self._g2p is None:
            try:
                from g2p_en import G2p  # type: ignore[import-not-found]
            except ImportError as e:
                raise ApiError("MODEL_NOT_INSTALLED", "g2p-en is not installed") from e
            self._g2p = G2p()
        return [p for p in self._g2p(word) if p.strip() and p[0].isalpha()] or ["AH"]

    def align(self, samples: np.ndarray, sr: int, transcript: str, language: str, job: Job) -> dict[str, Any]:
        import whisperx  # type: ignore[import-not-found]

        audio = resample(samples, sr, SR)
        lang = language[:2].lower()
        model_a, meta = self.models.get(f"align:{lang}", lambda: whisperx.load_align_model(language_code=lang, device=self._device()))
        job.report(0.3, "Aligning words")
        seg = [{"text": transcript, "start": 0.0, "end": len(audio) / SR}]
        res = self.models.run(lambda: whisperx.align(seg, model_a, meta, audio, self._device(), return_char_alignments=True))
        words = []
        phonemes = []
        scores = []
        for s in res.get("segments", []):
            for w in s.get("words", []):
                if "start" not in w or "end" not in w:
                    continue
                words.append({"text": w["word"], "start": round(float(w["start"]), 4), "end": round(float(w["end"]), 4)})
                scores.append(float(w.get("score", 0.5)))
        # Phonemes within each word, placed with character alignments where present.
        chars = [c for s in res.get("segments", []) for c in s.get("chars", []) if "start" in c]
        for w in words:
            ph = self._phonemes_for(w["text"])
            inside = [c for c in chars if c["start"] >= w["start"] - 1e-3 and c["end"] <= w["end"] + 1e-3]
            if len(inside) >= len(ph):
                step = len(inside) / len(ph)
                for k, p in enumerate(ph):
                    a = inside[int(k * step)]
                    b = inside[min(len(inside) - 1, int((k + 1) * step) - 1)]
                    phonemes.append({"p": p, "start": round(float(a["start"]), 4), "end": round(float(b["end"]), 4)})
            else:
                d = (w["end"] - w["start"]) / len(ph)
                for k, p in enumerate(ph):
                    phonemes.append({"p": p, "start": round(w["start"] + k * d, 4), "end": round(w["start"] + (k + 1) * d, 4)})
        job.report(1.0, "Aligned")
        conf = float(np.mean(scores)) if scores else 0.0
        return {"words": words, "phonemes": phonemes, "confidence": round(conf, 3), "method": "forced", "aligner": "whisperx-3.8.6+g2p-en-2.1.0"}

    def transcribe(self, samples: np.ndarray, sr: int, language: str | None, job: Job) -> dict[str, Any]:
        import whisperx  # type: ignore[import-not-found]

        audio = resample(samples, sr, SR)
        compute = "float16" if self._device() == "cuda" else "int8"
        model = self.models.get(f"asr:{self.cfg.transcribe_model}", lambda: whisperx.load_model(self.cfg.transcribe_model, self._device(), compute_type=compute, language=language))
        job.report(0.2, "Transcribing")
        res = self.models.run(lambda: model.transcribe(audio, batch_size=8))
        text = " ".join(s["text"].strip() for s in res.get("segments", []))
        return {"text": text, "language": res.get("language", language), "words": []}

    def unload(self) -> None:
        self.models.unload()
