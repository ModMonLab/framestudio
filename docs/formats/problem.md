# problem

A validation problem with severity and an optional fix.

JSON Schema: [schemas/problem.schema.json](schemas/problem.schema.json) · `frame schema problem`

| Field | Type | Required | Notes |
|---|---|---|---|
| `severity` | `"error"` \| `"warning"` \| `"info"` | yes |  |
| `code` | string | yes |  |
| `message` | string | yes |  |
| `scene` | string | no |  |
| `target` | object | no |  |
| `target.kind` | string | yes |  |
| `target.id` | string | yes |  |
| `blocksExport` | boolean | yes |  |
| `fix` | object | no |  |
| `fix.label` | string | yes |  |
| `fix.command` | any | no |  |
