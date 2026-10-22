"""Writes openapi.yaml from the app (the YAML is the published contract; tests fail on drift)."""

import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from frame_worker.app import create_app  # noqa: E402
from frame_worker.config import Config  # noqa: E402


def render() -> str:
    doc = create_app(Config()).openapi()
    doc["info"]["description"] = (
        "Frame Voice API v1 — contract between Frame and the self-hosted Voice Worker (SRS §5). "
        "Long operations return a job ({id, state, progress, queuePosition, result?, error?}); poll GET /v1/jobs/{id} "
        "or subscribe to the /v1/events WebSocket. Errors use {error: {code, message, details}} with codes UNAUTHORIZED, "
        "NOT_FOUND, UNSUPPORTED_CONTROL, TEXT_TOO_LONG, REFERENCE_TOO_SHORT, LANGUAGE_UNSUPPORTED, MODEL_NOT_INSTALLED, "
        "OUT_OF_MEMORY, BUSY, CANCELLED, ENGINE_ERROR, INVALID_AUDIO. Send an Idempotency-Key header to make retries safe. "
        "When the worker is bound to a network address every request except /v1/health needs 'Authorization: Bearer <token>'."
    )
    return yaml.safe_dump(doc, sort_keys=True, allow_unicode=True, width=120)


if __name__ == "__main__":
    (Path(__file__).resolve().parents[1] / "openapi.yaml").write_text(render())
    print("wrote openapi.yaml")
