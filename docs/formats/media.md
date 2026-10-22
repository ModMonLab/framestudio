# media

A content-addressed media reference (`assets/media/sha256-<hash>.<ext>`).

JSON Schema: [schemas/media.schema.json](schemas/media.schema.json) · `frame schema media`

| Field | Type | Required | Notes |
|---|---|---|---|
| `hash` | string | yes |  |
| `mime` | string | yes |  |
| `ext` | string | yes |  |
| `bytes` | integer | yes | ≥ 0 |
| `durationS` | number | no | ≥ 0 |
| `sampleRate` | integer | no | ≥ 1 |
| `channels` | integer | no | ≥ 1 |
| `width` | integer | no | ≥ 1 |
| `height` | integer | no | ≥ 1 |
