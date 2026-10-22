from pathlib import Path
import importlib.util

spec = importlib.util.spec_from_file_location("gen", Path(__file__).resolve().parents[1] / "scripts" / "gen_openapi.py")
gen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gen)


def test_openapi_yaml_matches_app():
    """openapi.yaml is normative (SRS §5); regenerate with scripts/gen_openapi.py after API changes."""
    committed = (Path(__file__).resolve().parents[1] / "openapi.yaml").read_text()
    assert committed == gen.render()


def test_all_srs_endpoints_present():
    import yaml

    doc = yaml.safe_load((Path(__file__).resolve().parents[1] / "openapi.yaml").read_text())
    for p in ["/v1/health", "/v1/capabilities", "/v1/blobs", "/v1/voices/design", "/v1/voices/range", "/v1/voices/prepare", "/v1/synthesize", "/v1/align", "/v1/transcribe", "/v1/blobs/{h}", "/v1/jobs/{job_id}", "/v1/benchmark"]:
        assert p in doc["paths"], p
