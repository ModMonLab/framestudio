# project

`project.json` at the root of a project folder: name, settings, style family, frame rate, output, captions, cast and episode order.

JSON Schema: [schemas/project.schema.json](schemas/project.schema.json) · `frame schema project`

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | File schema version (FR-DAT-05). ≥ 1 |
| `id` | string | yes | Project-local ID with prefix prj_. |
| `name` | string | yes |  |
| `description` | string | yes | Rich text (Markdown subset: headings, lists, bold, italic). |
| `styleFamily` | `"flat"` \| `"illustrated"` | yes |  |
| `frameRate` | `24` \| `25` \| `30` | yes |  |
| `output` | object | yes |  |
| `output.preset` | string | yes | Asset reference id@version. |
| `output.width` | integer | yes | ≥ 16, ≤ 8192 |
| `output.height` | integer | yes | ≥ 16, ≤ 8192 |
| `output.aspectRatios` | string[] | yes | Aspect ratios previewed per camera (FR-CAM-06). |
| `captions` | object | yes |  |
| `captions.enabled` | boolean | yes |  |
| `captions.style` | string | no | Asset reference id@version. |
| `captions.speakerLabels` | boolean | yes |  |
| `captions.burnIn` | boolean | yes |  |
| `voiceWorkerUrl` | string | no | Endpoint override; tokens are never stored in projects (NFR-09). |
| `renderDir` | string | no |  |
| `episodes` | string[] | yes |  |
| `cast` | object[] | yes |  |
| `permissions` | object | yes |  |
| `permissions.agent` | object | yes | Human-granted agent permissions (FR-AGT-04). |
| `seed` | integer | yes | ≥ 0 |
| `createdAt` | string | yes |  |
| `appVersion` | string | yes |  |
| `template` | string | no | Asset reference id@version. |
