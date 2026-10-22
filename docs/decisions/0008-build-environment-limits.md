# 0008 — Implementation environment limits

The cloud implementation container (Linux, 4 vCPU, 15 GB RAM, no GPU, no `nvidia-smi`) cannot run Qwen3-TTS or WhisperX at useful speed, cannot reproduce the reference laptop (RTX 5060 Laptop 8 GB, Windows 11/WSL2), and has no human listeners or reviewers.

Consequences (per the implementation prompt §3):
- The Voice Worker is implemented fully and its contract is verified against the fixture worker (API-04) and CPU smoke tests where feasible. NFR-06, AC-03, AC-17 (GPU OOM part) and AC-24 are **Not verified — requires reference machine**; owner steps are written in `docs/acceptance/owner-checklist.md` (to be created with the worker).
- Listening panels (AC-03, CAT-09), human visual sign-off (CAT-06) and reference-machine performance numbers (NFR-01/02/05) are prepared with tooling and reports, then marked Not verified with instructions.
- Fixture output is labelled `fixture` everywhere and never presented as real speech (P7, NFR-18).
