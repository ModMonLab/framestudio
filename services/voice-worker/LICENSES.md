# Voice Worker — model and library licences (FR-VWK-08, NFR-17)

Verified 2026-10-22 from the published packages and model listings. The worker refuses to download models until the owner runs `frame-voice-worker fetch-models --accept-licences`.

| Component | Version | Licence | Use |
|---|---|---|---|
| Qwen3-TTS models (VoiceDesign 1.7B, Base 1.7B/0.6B, Tokenizer 12Hz) | 2026-01 release | Apache-2.0 (per Qwen3-TTS repository and model cards — reconfirm on the model card before accepting) | Voice design, cloning, takes |
| qwen-tts | 0.1.1 | Apache-2.0 | Python inference package |
| transformers | 4.57.3 | Apache-2.0 | Model runtime |
| accelerate | 1.12.0 | Apache-2.0 | Model loading |
| PyTorch / torchaudio | 2.8.0 (cu128) | BSD-3-Clause | Tensor runtime |
| WhisperX | 3.8.6 | BSD-2-Clause | Forced alignment, transcription |
| faster-whisper / CTranslate2 | ≥1.2 / ≥4.5 | MIT | Transcription |
| wav2vec2 alignment models (torchaudio pipelines) | — | per model (torchaudio WAV2VEC2_ASR_BASE_960H: BSD/MIT-compatible, trained on LibriSpeech CC-BY-4.0) | Alignment |
| g2p-en | 2.1.0 | Apache-2.0 | Grapheme-to-phoneme |
| FastAPI / Starlette / Uvicorn / Pydantic | 0.120.0 / 0.48 / 0.38.0 / 2.14 | MIT / BSD-3-Clause | HTTP server |
| NumPy / soundfile | 2.x / 0.14.0 | BSD-3-Clause | Audio |
| python-multipart | 0.0.20 | Apache-2.0 | Uploads |

Generated audio belongs to the owner; Frame never sends it to third parties (P8). Voice cloning requires the consent record stored by Frame (FR-VOI-04); the worker does not store project data.
