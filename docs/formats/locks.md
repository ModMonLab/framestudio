# locks

`locks/assets.json`: every referenced library asset version with its content hash.

JSON Schema: [schemas/locks.schema.json](schemas/locks.schema.json) · `frame schema locks`

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | File schema version (FR-DAT-05). ≥ 1 |
| `assets` | map of object | yes |  |
