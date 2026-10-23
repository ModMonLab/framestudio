# instance

One object on a scene's stage (character, prop, image, set piece, group, text).

JSON Schema: [schemas/instance.schema.json](schemas/instance.schema.json) · `frame schema instance`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Project-local ID with prefix ins_. |
| `kind` | `"character"` \| `"prop"` \| `"set-piece"` \| `"effect"` \| `"text"` \| `"image"` \| `"group"` | yes |  |
| `asset` | string | no | Asset reference id@version. |
| `media` | string | no | Media hash for image instances. |
| `name` | string | yes |  |
| `transform` | object | yes |  |
| `transform.x` | number | yes |  |
| `transform.y` | number | yes |  |
| `transform.scale` | number | yes |  |
| `transform.rotation` | number | yes | Degrees, clockwise. |
| `transform.flipX` | boolean | yes |  |
| `depthPlane` | string | yes |  |
| `order` | number | yes | Layer order within the depth plane. |
| `parallax` | number | yes | Parallax factor (independent of draw order; FR-STG-02). |
| `opacity` | number | yes | ≥ 0, ≤ 1 |
| `parent` | string | no | Project-local ID with prefix ins_. |
| `visible` | boolean | yes |  |
| `locked` | boolean | yes |  |
| `character` | object | no |  |
| `character.look` | string | yes | Look id within the character asset. |
| `character.view` | `"front"` \| `"three"` \| `"side"` \| `"back"` | yes |  |
| `character.posture` | `"standing"` \| `"seated"` \| `"crouched"` \| `"kneeling"` \| `"lying"` | yes |  |
| `character.baseExpression` | string | no | Asset reference id@version. |
| `character.voice` | string | no | Asset reference id@version. |
| `character.auto` | object | yes | Automatic behaviour generators (FR-ACT-07, FR-ACT-08, FR-EXP-03). |
| `propState` | string | no | Initial prop state. |
| `params` | map of any | yes | Kind-specific parameters (text content, palette, colours...). |
