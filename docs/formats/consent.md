# consent

The consent record stored with every cloned voice and exported with it.

JSON Schema: [schemas/consent.schema.json](schemas/consent.schema.json) · `frame schema consent`

| Field | Type | Required | Notes |
|---|---|---|---|
| `statement` | `"own-voice"` \| `"documented-consent"` | yes |  |
| `speakerName` | string | yes |  |
| `confirmedBy` | string | yes |  |
| `date` | string | yes |  |
| `notes` | string | no |  |
