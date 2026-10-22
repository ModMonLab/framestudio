# 0013 — Export pipeline: offline mix, loudness and ffmpeg

Status: Accepted · Requirements: FR-RND-01..10, FR-SND-02/03/05, FR-TXT-01/02/06, SRS §6 step 6

## Decision

- **Audio scheduling is pure (`@frame/core/audio`).** The plan (events, fades, pan, ducking spans) and the gain
  automation functions are shared by the Studio (Web Audio) and the Node mixer, so preview and export apply the same
  curves. Ducking reaches full depth at speech start (attack before) and releases after it.
- **Offline mixer (`@frame/io/audio`):** 48 kHz stereo float, gain automation evaluated every 32 samples and
  interpolated, constant-power pan. WAV (PCM 16/24/32, float) is parsed natively; other formats decode through ffmpeg.
- **Loudness:** ITU-R BS.1770-4 integrated loudness (K-weighting via bilinear-designed shelf + high-pass at any sample
  rate, 400 ms blocks with 75 % overlap, −70 LUFS absolute and −10 LU relative gates). Verified against the EBU Tech
  3341 sine reference (±0.1 LU). Normalisation to the preset target, then a 5 ms look-ahead peak limiter at −1 dBFS.
  True-peak (oversampled) measurement is not implemented; the report says "sample peak".
- **Encoding: ffmpeg** located via `FRAME_FFMPEG` or `PATH`. Frames are rasterised by the same CanvasKit renderer as
  previews and piped to ffmpeg as raw RGBA (no browser). Codecs: H.264 (libx264, yuv420p, BT.709 tags, faststart),
  H.265 (libx265), VP9 + Opus, ProRes 4444 with alpha, GIF (palettegen/paletteuse), PNG sequence + WAV, WAV/MP3 audio.
  Checked with ffmpeg 6.1.1 (`ffmpeg -encoders`), whose Ubuntu build includes libx264/libx265/libvpx/libopus/libmp3lame.
  **Bundling a static ffmpeg build is deferred to packaging (M6)**: static builds that include libx264/libx265 are
  GPL; the licence obligations for distribution will be recorded with the installer decision.
- **Output presets are content** (`content/assets/out/*.json`, Catalog R1), never hard-coded (FR-ARC-06).
- **Captions:** caption styles are content (`txt.*` data.caption). Paging uses word timings so the burned-in captions,
  SRT and WebVTT always show the same text at the same times. The renderer gained `valign` and per-line `box` on text
  items for stacked, boxed captions.
- **Render report** `<out>.report.json` + `<out>.report.txt` with settings, revision, frames, encoder, loudness,
  warnings and timings. Fixture audio is flagged in both ("not real speech").

## Evidence

`tools/test/export.test.ts`: MP4 probe (codec, size, 216 frames at 24 fps, AAC 48 kHz stereo, duration), loudness
−14 ±1 LUFS and peak ≤ −1 dBFS, SRT/VTT content and times, stems, report text, dialogue present only where lines play,
video frame vs `render frame` PNG (PSNR > 30 dB), export blocked when take media is missing with the project unchanged,
BS.1770 reference. `packages/core/test/audio-captions.test.ts`: scheduling, ducking, fades, pan, paging, karaoke/pop,
SRT/VTT.
