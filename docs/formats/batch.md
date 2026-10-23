# batch

A list of commands applied atomically (`frame apply`, `POST /commands`, MCP apply_commands).

JSON Schema: [schemas/batch.schema.json](schemas/batch.schema.json) · `frame schema batch`

| Field | Type | Required | Notes |
|---|---|---|---|
| `baseRevision` | integer | no | ≥ 0 |
| `label` | string | no |  |
| `source` | string | no |  |
| `commands` | object[] | yes |  |
