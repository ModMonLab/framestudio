# episode

`episodes/<id>/episode.json`: name, scene order and notes.

JSON Schema: [schemas/episode.schema.json](schemas/episode.schema.json) · `frame schema episode`

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | File schema version (FR-DAT-05). ≥ 1 |
| `id` | string | yes | Project-local ID with prefix ep_. |
| `name` | string | yes |  |
| `notes` | string | yes |  |
| `scenes` | string[] | yes |  |
| `sceneTransitions` | map of object | yes | Transition into the keyed scene from the previous one (FR-FX-03, FR-TML-09). |
