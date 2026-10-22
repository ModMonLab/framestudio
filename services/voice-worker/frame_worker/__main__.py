"""Command line: serve, doctor, benchmark, fetch-models, openapi (FR-VWK-04/07/08)."""

from __future__ import annotations

import argparse
import json
import platform
import shutil
import subprocess
import sys
import time

from .config import Config

LICENCES = {
    "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign": "Apache-2.0",
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base": "Apache-2.0",
    "Qwen/Qwen3-TTS-12Hz-0.6B-Base": "Apache-2.0",
    "Qwen/Qwen3-TTS-Tokenizer-12Hz": "Apache-2.0",
}


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    from .app import create_app

    cfg = Config.from_env()
    if args.host:
        cfg.host = args.host
    if args.port:
        cfg.port = args.port
    if args.engine:
        cfg.engine = args.engine
        cfg.aligner = "whisperx" if args.engine == "qwen3" else "fixture"
    cfg.validate()
    uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port, log_level="info")
    return 0


def check(name: str, ok: bool, detail: str, hint: str = "") -> dict:
    return {"check": name, "ok": ok, "detail": detail, **({"hint": hint} if hint and not ok else {})}


def cmd_doctor(args: argparse.Namespace) -> int:
    """Checks drivers, CUDA, PyTorch, model files and VRAM (FR-VWK-07)."""
    cfg = Config.from_env()
    results = [check("python", sys.version_info >= (3, 11), platform.python_version(), "Use Python 3.11 or newer.")]
    smi = shutil.which("nvidia-smi")
    if smi:
        try:
            out = subprocess.run([smi, "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"], capture_output=True, text=True, timeout=10).stdout.strip()
            results.append(check("nvidia-driver", bool(out), out or "no GPU listed"))
        except Exception as e:  # noqa: BLE001
            results.append(check("nvidia-driver", False, str(e), "Install the NVIDIA Windows driver with WSL support."))
    else:
        results.append(check("nvidia-driver", False, "nvidia-smi not found", "Install the NVIDIA driver (Windows) — WSL2 exposes it automatically; for Docker use the NVIDIA Container Toolkit."))
    try:
        import torch

        cuda = torch.cuda.is_available()
        detail = f"torch {torch.__version__}, CUDA {torch.version.cuda}, available={cuda}"
        results.append(check("pytorch-cuda", cuda, detail, "Install the CUDA 12.8 PyTorch build (see scripts/setup-wsl.sh)."))
        if cuda:
            cap = torch.cuda.get_device_capability(0)
            free, total = torch.cuda.mem_get_info()
            results.append(check("gpu", True, f"{torch.cuda.get_device_name(0)} sm_{cap[0]}{cap[1]}, {total / 1e9:.1f} GB total, {free / 1e9:.1f} GB free"))
            arch = f"sm_{cap[0]}{cap[1]}"
            supported = arch in torch.cuda.get_arch_list()
            results.append(check("gpu-arch-supported", supported, f"{arch} in {torch.cuda.get_arch_list()}", "This PyTorch build does not include kernels for your GPU; install the cu128 wheels."))
            results.append(check("vram-budget", total / 1e9 >= 7.5, f"{total / 1e9:.1f} GB", "Use the 0.6B models (FRAME_WORKER_CLONE_MODEL) on GPUs with less than 8 GB."))
    except ImportError:
        results.append(check("pytorch-cuda", False, "PyTorch not installed", "pip install -e '.[gpu]' with the CUDA 12.8 index (scripts/setup-wsl.sh)."))
    for mod, label in (("qwen_tts", "qwen-tts"), ("whisperx", "whisperx"), ("g2p_en", "g2p-en")):
        try:
            __import__(mod)
            results.append(check(label, True, "installed"))
        except ImportError:
            results.append(check(label, False, "not installed", "pip install -e '.[gpu]'"))
    try:
        from huggingface_hub import try_to_load_from_cache  # type: ignore[import-not-found]

        for model in (cfg.design_model, cfg.clone_model):
            cached = try_to_load_from_cache(model, "config.json")
            results.append(check(f"model:{model}", isinstance(cached, str), "cached" if isinstance(cached, str) else "not downloaded", "Run frame-voice-worker fetch-models --accept-licences"))
    except ImportError:
        results.append(check("models", False, "huggingface_hub not installed", "pip install -e '.[gpu]'"))
    ffmpeg = shutil.which("ffmpeg")
    results.append(check("ffmpeg", bool(ffmpeg), ffmpeg or "not found", "sudo apt install ffmpeg"))
    ok = all(r["ok"] for r in results)
    if args.json:
        print(json.dumps({"ok": ok, "checks": results}, indent=2))
    else:
        for r in results:
            print(f"{'✔' if r['ok'] else '✖'} {r['check']}: {r['detail']}" + (f"\n    → {r['hint']}" if not r["ok"] and r.get("hint") else ""))
        print("All checks passed." if ok else "Some checks failed.")
    return 0 if ok else 1


def cmd_fetch(args: argparse.Namespace) -> int:
    """Downloads models only after the owner accepts their licences (FR-VWK-08)."""
    cfg = Config.from_env()
    wanted = [cfg.design_model, cfg.clone_model, "Qwen/Qwen3-TTS-Tokenizer-12Hz"]
    print("Models and licences:")
    for m in wanted:
        print(f"  {m}: {LICENCES.get(m, 'unknown — review the model card')}")
    if not args.accept_licences:
        print("\nRe-run with --accept-licences to confirm you accept these licences. Nothing was downloaded.")
        return 8
    from huggingface_hub import snapshot_download  # type: ignore[import-not-found]

    for m in wanted:
        print(f"Downloading {m}…")
        snapshot_download(m)
    print("Done.")
    return 0


def cmd_benchmark(args: argparse.Namespace) -> int:
    """Measures real-time factor and peak VRAM on this host and records the result (FR-VWK-04, NFR-06)."""
    from .app import create_app

    cfg = Config.from_env()
    if args.engine:
        cfg.engine = args.engine
    app = create_app(cfg)
    q = app.state.queue
    results = []
    for model in args.models or [None]:
        job = q.submit("benchmark", {"model": model})
        while job.state in ("queued", "running"):
            time.sleep(0.2)
        results.append({"model": model, "state": job.state, **(job.result or {}), **({"error": job.error} if job.error else {})})
    report = {"engine": cfg.engine, "host": platform.node(), "platform": platform.platform(), "time": time.strftime("%Y-%m-%dT%H:%M:%S"), "results": results}
    out = cfg.cache_dir / "benchmarks.jsonl"
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("a") as f:
        f.write(json.dumps(report) + "\n")
    print(json.dumps(report, indent=2))
    print(f"Recorded in {out}")
    return 0 if all(r["state"] == "succeeded" for r in results) else 1


def cmd_openapi(_args: argparse.Namespace) -> int:
    from .app import create_app

    print(json.dumps(create_app(Config()).openapi(), indent=2, sort_keys=True))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="frame-voice-worker", description="Frame Voice Worker")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve", help="Run the Voice API server")
    s.add_argument("--host")
    s.add_argument("--port", type=int)
    s.add_argument("--engine", choices=["fixture", "qwen3"])
    s.set_defaults(fn=cmd_serve)
    d = sub.add_parser("doctor", help="Check drivers, CUDA, model files and VRAM")
    d.add_argument("--json", action="store_true")
    d.set_defaults(fn=cmd_doctor)
    f = sub.add_parser("fetch-models", help="Download models after accepting their licences")
    f.add_argument("--accept-licences", action="store_true")
    f.set_defaults(fn=cmd_fetch)
    b = sub.add_parser("benchmark", help="Measure real-time factor and peak VRAM")
    b.add_argument("--engine", choices=["fixture", "qwen3"])
    b.add_argument("--models", nargs="*")
    b.set_defaults(fn=cmd_benchmark)
    o = sub.add_parser("openapi", help="Print the OpenAPI document")
    o.set_defaults(fn=cmd_openapi)
    args = p.parse_args(argv)
    return int(args.fn(args))


if __name__ == "__main__":
    raise SystemExit(main())
