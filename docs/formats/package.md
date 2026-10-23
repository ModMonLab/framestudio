# package

`manifest.json` inside a .frameproj, .framechar, .framevoice or .frameasset zip.

JSON Schema: [schemas/package.schema.json](schemas/package.schema.json) · `frame schema package`

| Field | Type | Required | Notes |
|---|---|---|---|
| `format` | `"frameproj"` \| `"framechar"` \| `"frameasset"` \| `"framevoice"` | yes |  |
| `formatVersion` | integer | yes | ≥ 1 |
| `appVersion` | string | yes |  |
| `createdAt` | string | yes |  |
| `contents` | object[] | yes |  |
| `assets` | string[] | yes | The package's root assets (characters, voices, packed assets); empty for projects. |
| `requires` | object[] | no | Bundled assets the contents reference but do not carry, pinned by content hash (SRS §3.6). |
| `project` | object | no |  |
| `project.id` | string | yes |  |
| `project.name` | string | yes |  |
