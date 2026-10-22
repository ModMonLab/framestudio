# clip

A timed item on a track; dialogue clips carry a line.

JSON Schema: [schemas/clip.schema.json](schemas/clip.schema.json) · `frame schema clip`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Project-local ID with prefix clp_. |
| `track` | string | yes | Project-local ID with prefix trk_. |
| `start` | integer | yes | Time in ticks (48 000 per second). ≥ 0 |
| `end` | integer | yes | Time in ticks (48 000 per second). ≥ 0 |
| `asset` | string | no | Asset reference id@version. |
| `params` | map of any | yes |  |
| `blendIn` | integer | yes | Time in ticks (48 000 per second). ≥ 0 |
| `blendOut` | integer | yes | Time in ticks (48 000 per second). ≥ 0 |
| `enabled` | boolean | yes |  |
| `source` | string | yes |  |
| `group` | string | no | Project-local ID with prefix grp_. |
| `line` | object | no |  |
| `line.speaker` | string | yes | Project-local ID with prefix ins_. |
| `line.text` | string | yes |  |
| `line.revision` | integer | yes | ≥ 1 |
| `line.delivery` | object | yes |  |
| `line.take` | string | no | Project-local ID with prefix tak_. |
| `line.muted` | boolean | yes | Intentionally silent line (take state "Muted"). |
| `line.caption` | object | no |  |
| `line.mouthOverrides` | object[] | no |  |
| `media` | string | no | Media hash for imported audio or images. |
| `sourceIn` | integer | no | Time in ticks (48 000 per second). ≥ 0 |
| `name` | string | no |  |
