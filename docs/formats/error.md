# error

A structured error (code, message, details, hint) used by the engine, CLI, server and MCP.

JSON Schema: [schemas/error.schema.json](schemas/error.schema.json) · `frame schema error`

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | `"USAGE"` \| `"VALIDATION_FAILED"` \| `"REVISION_CONFLICT"` \| `"NOT_FOUND"` \| `"WORKER_UNAVAILABLE"` \| `"RENDER_FAILED"` \| `"CANCELLED"` \| `"PERMISSION_REQUIRED"` \| `"CONSENT_REQUIRED"` \| `"INTERNAL"` \| `"SCHEMA_TOO_NEW"` \| `"MIGRATION_REQUIRED"` \| `"CONFLICT"` \| `"UNSUPPORTED"` \| `"IO_ERROR"` \| `"INVALID_PACKAGE"` | yes |  |
| `message` | string | yes |  |
| `details` | any | no |  |
| `hint` | string | no |  |
