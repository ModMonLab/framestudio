# command

One engine command (name + params): the only way state changes.

JSON Schema: [schemas/command.schema.json](schemas/command.schema.json) · `frame schema command`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Command name, e.g. scene.add, clip.move. |
| `params` | map of any | yes |  |
