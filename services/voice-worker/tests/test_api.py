"""Voice API contract tests against the fixture engine (API-01..04, FR-VWK-05/06)."""

import io
import time

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from frame_worker.app import create_app
from frame_worker.config import Config


def wav(seconds: float, sr: int = 24000) -> bytes:
    t = np.arange(int(seconds * sr)) / sr
    buf = io.BytesIO()
    sf.write(buf, (0.2 * np.sin(2 * np.pi * 180 * t)).astype(np.float32), sr, format="WAV")
    return buf.getvalue()


@pytest.fixture()
def client(tmp_path):
    cfg = Config(cache_dir=tmp_path, engine="fixture", aligner="fixture")
    return TestClient(create_app(cfg))


def wait(client, job, timeout=20):
    t0 = time.time()
    while job["state"] in ("queued", "running"):
        assert time.time() - t0 < timeout, job
        time.sleep(0.02)
        job = client.get(f"/v1/jobs/{job['id']}").json()
    return job


def upload(client, data: bytes) -> str:
    r = client.post("/v1/blobs", files={"file": ("a.wav", data, "audio/wav")})
    assert r.status_code == 200, r.text
    return r.json()["hash"]


def test_health_and_capabilities_identify_fixture(client):
    assert client.get("/v1/health").json()["ok"] is True
    caps = client.get("/v1/capabilities").json()
    assert caps["fixture"] is True
    assert caps["engines"][0]["id"] == "fixture"
    assert "emotion" in caps["engines"][0]["controls"]
    assert caps["limits"]["maxTextChars"] > 0


def test_design_candidates_and_blob_download(client):
    job = client.post("/v1/voices/design", json={"description": "Warm late-20s host", "language": "en", "sampleText": "Welcome back to the show.", "candidates": 4, "seed": 7}).json()
    job = wait(client, job)
    assert job["state"] == "succeeded"
    cands = job["result"]["candidates"]
    assert len(cands) == 4 and len({c["audioHash"] for c in cands}) == 4
    blob = client.get(f"/v1/blobs/{cands[0]['audioHash']}")
    assert blob.status_code == 200 and blob.content[:4] == b"RIFF"
    # Deterministic: same seed → same audio.
    again = wait(client, client.post("/v1/voices/design", json={"description": "Warm late-20s host", "language": "en", "sampleText": "Welcome back to the show.", "candidates": 1, "seed": 7}).json())
    assert again["result"]["candidates"][0]["audioHash"] == cands[0]["audioHash"]


def test_range_bank_and_synthesis_with_emotion(client):
    neutral = upload(client, wav(4))
    rng = wait(client, client.post("/v1/voices/range", json={"neutralRef": {"hash": neutral, "transcript": "Hello there"}, "description": "Warm host", "emotions": ["happy", "sad", "nervous"], "text": "I honestly cannot believe what happened on the show today, and I want to tell you all about it."}).json())
    assert [r["emotion"] for r in rng["result"]["refs"]] == ["happy", "sad", "nervous"]
    refs = [{"hash": neutral, "transcript": "Hello there", "emotion": "neutral"}] + [{"hash": r["audioHash"], "transcript": r["transcript"], "emotion": r["emotion"]} for r in rng["result"]["refs"]]
    job = wait(client, client.post("/v1/synthesize", json={"text": "So, did you hear the recording?", "voice": {"refs": refs}, "delivery": {"emotion": "nervous"}, "takes": 3, "seed": 1, "sampleRate": 48000}).json())
    assert job["state"] == "succeeded", job
    takes = job["result"]["takes"]
    assert len(takes) == 3 and takes[0]["sampleRate"] == 48000
    assert job["result"]["fixture"] is True
    assert takes[0]["settingsUsed"]["reference"] == "nervous"


def test_pause_markers_lengthen_audio(client):
    ref = upload(client, wav(4))
    v = {"refs": [{"hash": ref, "transcript": "x"}]}
    a = wait(client, client.post("/v1/synthesize", json={"text": "Wait for it.", "voice": v, "seed": 1}).json())["result"]["takes"][0]["durationS"]
    b = wait(client, client.post("/v1/synthesize", json={"text": "Wait [pause 1.0s] for it.", "voice": v, "seed": 1}).json())["result"]["takes"][0]["durationS"]
    assert b > a + 0.8


def test_errors_are_coded(client):
    ref = upload(client, wav(4))
    r = client.post("/v1/synthesize", json={"text": "Hi", "voice": {"refs": [{"hash": ref}]}, "delivery": {"emotion": "sarcastic-x"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "UNSUPPORTED_CONTROL"
    short = upload(client, wav(1))
    job = wait(client, client.post("/v1/synthesize", json={"text": "Hi", "voice": {"refs": [{"hash": short}]}}).json())
    assert job["state"] == "failed" and job["error"]["code"] == "REFERENCE_TOO_SHORT"
    long = wait(client, client.post("/v1/synthesize", json={"text": "x" * 5000, "voice": {"refs": [{"hash": ref}]}}).json())
    assert long["error"]["code"] == "TEXT_TOO_LONG"
    assert client.get("/v1/jobs/job_nope").json()["error"]["code"] == "NOT_FOUND"
    bad = client.post("/v1/blobs", files={"file": ("a.wav", b"not audio", "audio/wav")})
    assert bad.json()["error"]["code"] == "INVALID_AUDIO"


def test_idempotency_key_returns_same_job(client):
    body = {"description": "Calm presenter", "sampleText": "Hello.", "candidates": 1}
    a = client.post("/v1/voices/design", json=body, headers={"Idempotency-Key": "k-123"}).json()
    b = client.post("/v1/voices/design", json=body, headers={"Idempotency-Key": "k-123"}).json()
    assert a["id"] == b["id"]


def test_alignment_of_fixture_take(client):
    ref = upload(client, wav(4))
    take = wait(client, client.post("/v1/synthesize", json={"text": "Maybe bring a backup", "voice": {"refs": [{"hash": ref}]}, "seed": 3, "sampleRate": 24000}).json())["result"]["takes"][0]
    al = wait(client, client.post("/v1/align", json={"audioHash": take["audioHash"], "transcript": "Maybe bring a backup"}).json())["result"]
    assert [w["text"] for w in al["words"]] == ["Maybe", "bring", "a", "backup"]
    assert any(p["p"] in ("M", "B", "P") for p in al["phonemes"])
    assert al["method"] == "fixture"
    ends = [w["end"] for w in al["words"]]
    assert ends == sorted(ends) and ends[-1] <= take["durationS"]


def test_cancel_queued_job(client):
    jobs = [client.post("/v1/voices/design", json={"description": "x voice", "sampleText": "Hello there " * 30, "candidates": 8}).json() for _ in range(3)]
    r = client.delete(f"/v1/jobs/{jobs[-1]['id']}").json()
    assert r["cancelled"] is True
    assert wait(client, jobs[-1])["state"] == "cancelled"


def test_token_required_when_configured(tmp_path):
    cfg = Config(cache_dir=tmp_path, token="s3cret", host="0.0.0.0")
    c = TestClient(create_app(cfg))
    assert c.get("/v1/health").status_code == 200
    assert c.get("/v1/capabilities").status_code == 401
    assert c.get("/v1/capabilities", headers={"Authorization": "Bearer s3cret"}).status_code == 200


def test_network_bind_without_token_refused():
    with pytest.raises(SystemExit):
        Config(host="0.0.0.0", token=None).validate()
