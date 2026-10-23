# cli-mutation

The `result` of every command that edits a project (applied, or planned with --dry-run).

JSON Schema: [schemas/cli-mutation.schema.json](schemas/cli-mutation.schema.json) · `frame schema cli-mutation`

| Field | Type | Required | Notes |
|---|---|---|---|
| `dryRun` | boolean | yes | True when nothing was written. |
| `revision` | integer | yes | Project revision after the change (unchanged on a dry run). ≥ 0 |
| `label` | string | yes | Undo label of the change. |
| `commands` | object[] | yes | The engine commands, with ids filled in. |
| `reports` | any[] | yes | Command reports (e.g. clips moved by a frame-rate change). |
| `problems` | object[] | yes | Validation errors and warnings after the change. |
