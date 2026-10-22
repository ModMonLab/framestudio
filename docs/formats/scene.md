# scene

`episodes/<id>/scenes/<scn_id>.json`: stage, instances, cameras, tracks and clips (times in ticks, 48 000 per second; half-open intervals).

JSON Schema: [schemas/scene.schema.json](schemas/scene.schema.json) · `frame schema scene`

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | File schema version (FR-DAT-05). ≥ 1 |
| `id` | string | yes | Project-local ID with prefix scn_. |
| `name` | string | yes |  |
| `notes` | string | yes |  |
| `duration` | integer | yes | Time in ticks (48 000 per second). ≥ 0 |
| `kit` | string | no | Asset reference id@version. |
| `seed` | integer | yes | ≥ 0 |
| `stage` | object | yes |  |
| `stage.width` | number | yes | Stage width in stage units (1 unit = 1 px at 1920-wide reference). |
| `stage.height` | number | yes |  |
| `stage.groundLines` | object[] | yes |  |
| `stage.marks` | object[] | yes |  |
| `stage.depthPlanes` | object[] | yes |  |
| `instances` | object[] | yes |  |
| `cameras` | object[] | yes |  |
| `defaultCamera` | string | yes | Project-local ID with prefix cam_. |
| `tracks` | object[] | yes |  |
| `clips` | object[] | yes |  |
| `markers` | object[] | yes |  |
| `loop` | object | no |  |
| `loop.start` | integer | yes | Time in ticks (48 000 per second). ≥ 0 |
| `loop.end` | integer | yes | Time in ticks (48 000 per second). ≥ 0 |
| `audio` | object | yes |  |
| `audio.duckingDb` | number | yes | ≥ -40, ≤ 0 |
| `audio.duckAttack` | number | yes | ≥ 0 |
| `audio.duckRelease` | number | yes | ≥ 0 |
| `audio.roomTone` | boolean | yes |  |
