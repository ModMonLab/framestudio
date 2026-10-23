# history

One entry of `history/commands.jsonl`: a committed change with its source and commands.

JSON Schema: [schemas/history.schema.json](schemas/history.schema.json) · `frame schema history`

| Field | Type | Required | Notes |
|---|---|---|---|
| `revision` | integer | yes | ≥ 1 |
| `at` | string | yes |  |
| `label` | string | yes |  |
| `source` | string | yes |  |
| `commands` | object[] | yes |  |
