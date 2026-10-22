# camera

A scene camera: centre, width, rotation, lens, framing preset and subjects.

JSON Schema: [schemas/camera.schema.json](schemas/camera.schema.json) · `frame schema camera`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Project-local ID with prefix cam_. |
| `name` | string | yes |  |
| `center` | object | yes |  |
| `center.x` | number | yes |  |
| `center.y` | number | yes |  |
| `width` | number | yes | Framing width in stage units at stage scale. |
| `rotation` | number | yes |  |
| `lens` | `"24mm"` \| `"35mm"` \| `"50mm"` \| `"85mm"` | yes |  |
| `preset` | string | no | Asset reference id@version. |
| `subjects` | string[] | yes |  |
| `ratioRule` | `"center"` \| `"headroom"` | yes |  |
| `ratioOverrides` | map of object | yes |  |
