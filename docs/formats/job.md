# job

A job on the Frame Server (exports, voice generation, imports, thumbnails).

JSON Schema: [schemas/job.schema.json](schemas/job.schema.json) · `frame schema job`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `kind` | string | yes |  |
| `title` | string | yes |  |
| `state` | `"queued"` \| `"running"` \| `"succeeded"` \| `"failed"` \| `"cancelled"` | yes |  |
| `progress` | number | yes | ≥ 0, ≤ 1 |
| `message` | string | yes |  |
| `project` | string | no |  |
| `result` | any | no |  |
| `error` | object | no |  |
| `error.code` | `"USAGE"` \| `"VALIDATION_FAILED"` \| `"REVISION_CONFLICT"` \| `"NOT_FOUND"` \| `"WORKER_UNAVAILABLE"` \| `"RENDER_FAILED"` \| `"CANCELLED"` \| `"PERMISSION_REQUIRED"` \| `"CONSENT_REQUIRED"` \| `"INTERNAL"` \| `"SCHEMA_TOO_NEW"` \| `"MIGRATION_REQUIRED"` \| `"CONFLICT"` \| `"UNSUPPORTED"` \| `"IO_ERROR"` \| `"INVALID_PACKAGE"` | yes |  |
| `error.message` | string | yes |  |
| `error.details` | any | no |  |
| `error.hint` | string | no |  |
| `createdAt` | string | yes |  |
| `startedAt` | string | no |  |
| `finishedAt` | string | no |  |
