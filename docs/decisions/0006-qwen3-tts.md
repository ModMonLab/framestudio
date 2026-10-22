# 0006 — Qwen3-TTS engine API

**Verified from the published package** `qwen-tts` 0.1.1 (PyPI wheel metadata and README, licence Apache-2.0, homepage github.com/Qwen/Qwen3-TTS), 2026-10-22:
- Models: `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` (description → voice, instruction control), `Qwen/Qwen3-TTS-12Hz-1.7B-Base` and `-0.6B-Base` (3-second voice clone from reference audio + transcript), `-CustomVoice` variants (9 preset timbres), tokenizer `Qwen3-TTS-Tokenizer-12Hz`. 10 languages including English.
- API: `Qwen3TTSModel.from_pretrained(id, device_map="cuda:0", dtype=torch.bfloat16, attn_implementation=...)`;
  `generate_voice_design(text, language, instruct)`; `create_voice_clone_prompt(ref_audio, ref_text, x_vector_only_mode=False)`;
  `generate_voice_clone(text, language, ref_audio|voice_clone_prompt)`; all return `(wavs, sample_rate)`; accept HF `generate` kwargs (e.g. `top_p`, `max_new_tokens`).
- Dependencies pinned by the package: `transformers==4.57.3`, `accelerate==1.12.0`, plus torchaudio, librosa, soundfile, onnxruntime.

**Consequences for Frame.**
- The Base (clone) model has **no instruction control**; only VoiceDesign accepts `instruct`. Therefore the emotional range bank (FR-VOI-03) is built with the VoiceDesign model using the voice description plus an emotion instruction; the design model cannot condition on reference audio, so "conditioned on the neutral reference" is implemented by (1) reusing the exact neutral description and seed family, and (2) a speaker-similarity check of each emotion reference against the neutral reference (embedding distance) before it is offered for acceptance. Takes are then synthesised with the Base model cloning from the range-bank reference matching the delivery. Recorded as an interpretation of FR-VOI-03; listening tests (AC-03) validate it.
- Capability report: `instruction: true` only for the design model; `pace` is not a native control and is reported as unsupported unless implemented by post-processing (time-stretch is not used for takes), keeping FR-VOI-08 honest.

**Not verified here.** Running the models: no GPU in this container (see 0008).
