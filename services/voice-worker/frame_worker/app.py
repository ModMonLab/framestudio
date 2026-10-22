"""FastAPI application implementing the Frame Voice API v1 (SRS §5; normative contract: openapi.yaml)."""

from __future__ import annotations

import asyncio
import hmac
import re
from typing import Any, Literal

import numpy as np
from fastapi import FastAPI, Header, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import API_VERSION, __version__
from .audio import decode, duration, encode, resample
from .blobs import BlobStore
from .config import Config
from .engines.base import Audio, Ref
from .errors import ApiError
from .jobs import Job, JobQueue
from .models import ModelManager


# ------------------------------------------------------------------ request models

class DesignRequest(BaseModel):
    description: str = Field(min_length=3, max_length=2000)
    language: str = "en"
    sampleText: str = Field(min_length=1, max_length=2000)
    candidates: int = Field(default=4, ge=1, le=8)
    seed: int | None = None


class RefIn(BaseModel):
    hash: str
    transcript: str = ""
    emotion: str = "neutral"


class RangeRequest(BaseModel):
    neutralRef: RefIn
    description: str
    emotions: list[str] = Field(min_length=1, max_length=16)
    text: str = Field(min_length=1, max_length=2000)
    language: str = "en"


class PrepareRequest(BaseModel):
    refs: list[RefIn] = Field(min_length=1)
    engine: str | None = None
    model: str | None = None


class VoiceIn(BaseModel):
    refs: list[RefIn] = Field(min_length=1)
    conditioningHash: str | None = None


class DeliveryIn(BaseModel):
    emotion: str | None = None
    pace: float | None = Field(default=None, ge=0.5, le=2.0)
    instruction: str | None = Field(default=None, max_length=500)


class SynthRequest(BaseModel):
    text: str = Field(min_length=1)
    language: str = "en"
    voice: VoiceIn
    delivery: DeliveryIn = DeliveryIn()
    takes: int = Field(default=1, ge=1, le=8)
    seed: int | None = None
    format: Literal["wav", "flac"] = "wav"
    sampleRate: int = Field(default=48000, ge=8000, le=96000)


class AlignRequest(BaseModel):
    audioHash: str
    transcript: str = Field(min_length=1)
    language: str = "en"


class TranscribeRequest(BaseModel):
    audioHash: str
    language: str | None = None


class BenchmarkRequest(BaseModel):
    model: str | None = None


PAUSE = re.compile(r"\[pause\s+(\d+(?:\.\d+)?)s\]", re.I)
# A mid-line ellipsis is a beat: about the same 0.4 s the Studio's length estimate allows for it.
BEAT = re.compile(r"(…|\.\.\.)\s+(?=\S)")
BEAT_S = 0.4


def create_app(cfg: Config | None = None) -> FastAPI:
    cfg = cfg or Config.from_env()
    models = ModelManager(cfg.device)
    blobs = BlobStore(cfg.cache_dir / "blobs", cfg.blob_cache_mb)
    if cfg.engine == "qwen3":
        from .engines.qwen3 import Qwen3Engine

        engine: Any = Qwen3Engine(cfg, models)
    else:
        from .engines.fixture import FixtureEngine

        engine = FixtureEngine()
    if cfg.aligner == "whisperx":
        from .aligners.whisperx_aligner import WhisperXAligner

        aligner: Any = WhisperXAligner(cfg, models)
    else:
        from .engines.fixture import FixtureAligner

        aligner = FixtureAligner()

    app = FastAPI(title="Frame Voice API", version=f"{API_VERSION}.0", description="Self-hosted voice design, cloning, synthesis and alignment for Frame.")
    app.add_middleware(CORSMiddleware, allow_origins=cfg.origins, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])
    app.state.cfg = cfg
    app.state.engine = engine
    app.state.aligner = aligner
    app.state.blobs = blobs

    # ---------------------------------------------------------------- auth (FR-VWK-06)
    @app.middleware("http")
    async def auth(request: Request, call_next):
        if cfg.token and request.url.path != "/v1/health" and request.method != "OPTIONS":
            supplied = request.headers.get("authorization", "")
            if not hmac.compare_digest(supplied, f"Bearer {cfg.token}"):
                return JSONResponse(ApiError("UNAUTHORIZED", "Missing or invalid bearer token").body(), status_code=401)
        return await call_next(request)

    @app.exception_handler(ApiError)
    async def api_error(_req: Request, e: ApiError):
        return JSONResponse(e.body(), status_code=e.status)

    # ---------------------------------------------------------------- helpers
    def ref_of(r: RefIn) -> Ref:
        samples, sr = decode(blobs.get(r.hash))
        return Ref(samples, sr, r.transcript, r.emotion, r.hash)

    def store(a: Audio, fmt: str = "wav", sr: int | None = None) -> dict:
        x = resample(a.samples, a.sr, sr) if sr else a.samples
        rate = sr or a.sr
        h = blobs.put(encode(x, rate, fmt))
        return {"audioHash": h, "seed": a.seed, "durationS": round(duration(x, rate), 4), "sampleRate": rate}

    def check_text(text: str) -> None:
        if len(text) > cfg.max_text_chars:
            raise ApiError("TEXT_TOO_LONG", f"Text is {len(text)} characters; the limit is {cfg.max_text_chars}", {"limit": cfg.max_text_chars})

    def synth_with_pauses(req: SynthRequest, refs: list[Ref], job: Job) -> list[Audio]:
        caps = engine.capabilities()["controls"]
        delivery = req.delivery.model_dump(exclude_none=True)
        if caps.get("pauses") or not (PAUSE.search(req.text) or BEAT.search(req.text)):
            return engine.synthesize(req.text, req.language, refs, delivery, req.takes, req.seed, job)
        # Engines without pause control: generate segments and join with silence (FR-DLG-08).
        parts = PAUSE.split(BEAT.sub(lambda m: f"{m.group(1)} [pause {BEAT_S}s] ", req.text))
        segments = [(parts[i].strip(), float(parts[i + 1]) if i + 1 < len(parts) else 0.0) for i in range(0, len(parts), 2)]
        takes: list[Audio] = []
        for k in range(req.takes):
            chunks = []
            sr = 24000
            for text, pause in segments:
                if text:
                    a = engine.synthesize(text, req.language, refs, delivery, 1, None if req.seed is None else req.seed + k, job)[0]
                    sr = a.sr
                    chunks.append(a.samples)
                if pause:
                    chunks.append(np.zeros(int(pause * sr), dtype=np.float32))
            takes.append(Audio(np.concatenate(chunks) if chunks else np.zeros(1, np.float32), sr, None if req.seed is None else req.seed + k, {"segments": len(segments)}))
        return takes

    def run(job: Job) -> Any:
        r = job.request
        if job.kind == "design":
            req = DesignRequest(**r)
            check_text(req.sampleText)
            cands = engine.design(req.description, req.language, req.sampleText, req.candidates, req.seed, job)
            return {"candidates": [store(a) for a in cands], "engine": engine.id}
        if job.kind == "range":
            req = RangeRequest(**r)
            neutral = ref_of(req.neutralRef)
            res = engine.range(neutral, req.description, req.emotions, req.text, req.language, job)
            return {"refs": [{"emotion": emo, "transcript": req.text, **store(a), "similarity": sim} for emo, a, sim in res], "engine": engine.id}
        if job.kind == "synthesize":
            req = SynthRequest(**r)
            check_text(req.text)
            refs = [ref_of(x) for x in req.voice.refs]
            for x in refs:
                if duration(x.samples, x.sr) < cfg.min_ref_seconds:
                    raise ApiError("REFERENCE_TOO_SHORT", f"Reference clip is shorter than {cfg.min_ref_seconds} s", {"hash": x.hash})
            takes = synth_with_pauses(req, refs, job)
            return {"takes": [{**store(a, req.format, req.sampleRate), "settingsUsed": a.settings} for a in takes], "engine": engine.id, "fixture": engine.id == "fixture"}
        if job.kind == "align":
            req = AlignRequest(**r)
            samples, sr = decode(blobs.get(req.audioHash))
            return aligner.align(samples, sr, req.transcript, req.language, job)
        if job.kind == "transcribe":
            req = TranscribeRequest(**r)
            samples, sr = decode(blobs.get(req.audioHash))
            return aligner.transcribe(samples, sr, req.language, job)
        if job.kind == "benchmark":
            req = BenchmarkRequest(**r)
            return engine.benchmark(req.model, job)
        raise ApiError("INVALID_REQUEST", f"Unknown job kind {job.kind}")

    queue = JobQueue(run)
    app.state.queue = queue

    def job_json(j: Job) -> dict:
        out: dict[str, Any] = {"id": j.id, "kind": j.kind, "state": j.state, "progress": round(j.progress, 3), "message": j.message, "queuePosition": queue.position(j)}
        if j.result is not None:
            out["result"] = j.result
        if j.error is not None:
            out["error"] = j.error
        return out

    def submit(kind: str, body: BaseModel, key: str | None) -> dict:
        return job_json(queue.submit(kind, body.model_dump(), key))

    # ---------------------------------------------------------------- routes
    @app.get("/v1/health")
    def health():
        return {"ok": True, "version": __version__, "api": API_VERSION}

    @app.get("/v1/capabilities")
    def capabilities():
        caps = engine.capabilities()
        return {
            "version": __version__,
            "fixture": bool(caps.get("fixture")),
            "engines": [caps],
            "aligner": {"id": aligner.id, "available": aligner.available(), "languages": aligner.languages()},
            "transcriber": {"available": aligner.id != "fixture"},
            "gpu": engine.vram(),
            "limits": {"maxTextChars": cfg.max_text_chars, "maxRefSeconds": cfg.max_ref_seconds, "minRefSeconds": cfg.min_ref_seconds},
            "queue": {"busy": queue.busy()},
        }

    @app.post("/v1/blobs")
    async def put_blob(file: UploadFile):
        data = await file.read()
        if not data:
            raise ApiError("INVALID_AUDIO", "Empty upload")
        samples, sr = decode(data)
        if duration(samples, sr) > cfg.max_ref_seconds * 20:
            raise ApiError("INVALID_AUDIO", "Audio is too long for the worker")
        return {"hash": blobs.put(data)}

    @app.get("/v1/blobs/{h}")
    def get_blob(h: str):
        data = blobs.get(h)
        mt = "audio/flac" if data[:4] == b"fLaC" else "audio/wav"
        return Response(content=data, media_type=mt)

    @app.post("/v1/voices/design")
    def design(body: DesignRequest, idempotency_key: str | None = Header(default=None)):
        return submit("design", body, idempotency_key)

    @app.post("/v1/voices/range")
    def build_range(body: RangeRequest, idempotency_key: str | None = Header(default=None)):
        if not blobs.has(body.neutralRef.hash):
            raise ApiError("NOT_FOUND", "Neutral reference is not uploaded", {"hash": body.neutralRef.hash})
        return submit("range", body, idempotency_key)

    @app.post("/v1/voices/prepare")
    def prepare(body: PrepareRequest):
        refs = [ref_of(r) for r in body.refs]
        return {"conditioningHash": engine.prepare(refs, body.model)}

    @app.post("/v1/synthesize")
    def synthesize(body: SynthRequest, idempotency_key: str | None = Header(default=None)):
        caps = engine.capabilities()["controls"]
        d = body.delivery
        if d.emotion and d.emotion not in (caps.get("emotion") or []):
            raise ApiError("UNSUPPORTED_CONTROL", f"Emotion {d.emotion!r} is not supported", {"control": "emotion", "supported": caps.get("emotion")})
        if d.instruction and not caps.get("instruction"):
            raise ApiError("UNSUPPORTED_CONTROL", "Instruction text is not supported by this engine for takes", {"control": "instruction"})
        if d.pace not in (None, 1.0) and not caps.get("pace"):
            raise ApiError("UNSUPPORTED_CONTROL", "Pace is not supported by this engine", {"control": "pace"})
        for r in body.voice.refs:
            if not blobs.has(r.hash):
                raise ApiError("NOT_FOUND", "A voice reference is not uploaded to the worker", {"hash": r.hash})
        return submit("synthesize", body, idempotency_key)

    @app.post("/v1/align")
    def align(body: AlignRequest, idempotency_key: str | None = Header(default=None)):
        if not blobs.has(body.audioHash):
            raise ApiError("NOT_FOUND", "Audio is not uploaded", {"hash": body.audioHash})
        return submit("align", body, idempotency_key)

    @app.post("/v1/transcribe")
    def transcribe(body: TranscribeRequest, idempotency_key: str | None = Header(default=None)):
        if not blobs.has(body.audioHash):
            raise ApiError("NOT_FOUND", "Audio is not uploaded", {"hash": body.audioHash})
        return submit("transcribe", body, idempotency_key)

    @app.post("/v1/benchmark")
    def benchmark(body: BenchmarkRequest, idempotency_key: str | None = Header(default=None)):
        return submit("benchmark", body, idempotency_key)

    @app.get("/v1/jobs/{job_id}")
    def get_job(job_id: str):
        return job_json(queue.get(job_id))

    @app.delete("/v1/jobs/{job_id}")
    def cancel_job(job_id: str):
        return {"cancelled": queue.cancel(job_id)}

    @app.websocket("/v1/events")
    async def events(ws: WebSocket):
        if cfg.token:
            tok = ws.query_params.get("token") or ws.headers.get("authorization", "").removeprefix("Bearer ")
            if not hmac.compare_digest(tok, cfg.token):
                await ws.close(code=4401)
                return
        await ws.accept()
        loop = asyncio.get_running_loop()
        q: asyncio.Queue = asyncio.Queue()
        off = JobQueue.listen(lambda j: loop.call_soon_threadsafe(q.put_nowait, job_json(j)))
        try:
            while True:
                await ws.send_json({"type": "job", "job": await q.get()})
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            off()

    return app
