# track

A timeline track (shot, camera move, dialogue, lip sync, acting, face, gaze, effect, music, ambience, sfx, text).

JSON Schema: [schemas/track.schema.json](schemas/track.schema.json) · `frame schema track`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Project-local ID with prefix trk_. |
| `kind` | `"shot"` \| `"camera-move"` \| `"dialogue"` \| `"lipsync"` \| `"acting"` \| `"face"` \| `"gaze"` \| `"effect"` \| `"music"` \| `"ambience"` \| `"sfx"` \| `"text"` | yes |  |
| `owner` | `"scene"` \| string | yes |  |
| `name` | string | yes |  |
| `mute` | boolean | yes |  |
| `solo` | boolean | yes |  |
| `lock` | boolean | yes |  |
| `hidden` | boolean | yes |  |
| `gainDb` | number | yes | ≥ -60, ≤ 12 |
