# voice

The `data` of a voice asset: method, language, references, consent.

JSON Schema: [schemas/voice.schema.json](schemas/voice.schema.json) · `frame schema voice`

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | yes |  |
| `method` | `"design"` \| `"clone"` \| `"preset"` \| `"recorded"` | yes |  |
| `language` | string | yes |  |
| `consent` | object | no | Mandatory for cloned voices (FR-VOI-04). |
| `consent.statement` | `"own-voice"` \| `"documented-consent"` | yes |  |
| `consent.speakerName` | string | yes |  |
| `consent.confirmedBy` | string | yes |  |
| `consent.date` | string | yes |  |
| `consent.notes` | string | no |  |
| `references` | object[] | yes |  |
| `auditions` | object[] | yes |  |
| `engineData` | map of object | yes |  |
