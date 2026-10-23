# line

A line of dialogue inside a dialogue clip: speaker, text, revision, delivery, chosen take.

JSON Schema: [schemas/line.schema.json](schemas/line.schema.json) · `frame schema line`

| Field | Type | Required | Notes |
|---|---|---|---|
| `speaker` | string | yes | Project-local ID with prefix ins_. |
| `text` | string | yes |  |
| `revision` | integer | yes | ≥ 1 |
| `delivery` | object | yes |  |
| `delivery.preset` | string | no | Asset reference id@version. |
| `delivery.emotion` | string | no |  |
| `delivery.pace` | number | no | ≥ 0.5, ≤ 2 |
| `delivery.instruction` | string | no |  |
| `take` | string | no | Project-local ID with prefix tak_. |
| `muted` | boolean | yes | Intentionally silent line (take state "Muted"). |
| `caption` | object | no |  |
| `caption.text` | string | no |  |
| `caption.hidden` | boolean | no |  |
| `mouthOverrides` | object[] | no |  |
