# 0011 — Data-model details the SRS leaves open

- **Gaze track.** SRS §3.3 lists track kinds without `gaze`, but FR-TML-01 and FR-CAM-07 treat gaze as its own exclusive channel per character. Track kind `gaze` was added; character groups are Dialogue, Lip sync, Acting, Face, Gaze.
- **Prop states** are clips on an `acting` track owned by the prop instance.
- **Mouth overrides** are stored on the dialogue clip's line (`line.mouthOverrides`) so re-alignment can keep or drop them (FR-LIP-04).
- **Takes** of a duplicated scene/episode are copied as new take records pointing at the same content-addressed media, so the copy plays immediately.
- **Defaults** (output preset, default style family, frame rate, caption style) live in `content/library.json`, not in code (FR-ARC-06).
- **Agent tagging.** Clip `source` is `manual`, `auto`, `import`, `template`, `recipe:<id>` or `agent:<session>`; CLI commands run with `FRAME_AGENT_SESSION` set are tagged as agent changes.
