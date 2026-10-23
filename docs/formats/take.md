# take

`assets/takes/<tak_id>.json`: one recording or generation of a line, with its media and alignment.

JSON Schema: [schemas/take.schema.json](schemas/take.schema.json) · `frame schema take`

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | File schema version (FR-DAT-05). ≥ 1 |
| `id` | string | yes | Project-local ID with prefix tak_. |
| `line` | string | yes | Project-local ID with prefix clp_. |
| `lineRevision` | integer | yes | ≥ 1 |
| `confirmedRevision` | integer | no | Recorded/uploaded take explicitly confirmed for a newer revision (FR-DLG-03). ≥ 1 |
| `number` | integer | yes | ≥ 1 |
| `source` | `"generated"` \| `"recorded"` \| `"uploaded"` | yes |  |
| `voice` | string | no | Asset reference id@version. |
| `engine` | string | no |  |
| `model` | string | no |  |
| `fixture` | boolean | yes | Produced by the fixture worker; never real speech (API-04). |
| `seed` | integer | no |  |
| `settings` | object | no |  |
| `settings.preset` | string | no | Asset reference id@version. |
| `settings.emotion` | string | no |  |
| `settings.pace` | number | no | ≥ 0.5, ≤ 2 |
| `settings.instruction` | string | no |  |
| `reference` | string | no | Emotion of the voice reference the take was synthesised from, as reported by the engine (FR-VOI-03). |
| `media` | object | no |  |
| `media.hash` | string | yes |  |
| `media.mime` | string | yes |  |
| `media.ext` | string | yes |  |
| `media.bytes` | integer | yes | ≥ 0 |
| `media.durationS` | number | no | ≥ 0 |
| `media.sampleRate` | integer | no | ≥ 1 |
| `media.channels` | integer | no | ≥ 1 |
| `media.width` | integer | no | ≥ 1 |
| `media.height` | integer | no | ≥ 1 |
| `durationS` | number | no | ≥ 0 |
| `alignment` | object | no | Times in seconds relative to the take start (SRS §3.5). |
| `alignment.words` | object[] | yes |  |
| `alignment.phonemes` | object[] | yes |  |
| `alignment.method` | `"forced"` \| `"transcribed+forced"` \| `"amplitude"` \| `"fixture"` | yes |  |
| `alignment.confidence` | number | yes | ≥ 0, ≤ 1 |
| `alignment.aligner` | string | no |  |
| `alignment.envelope` | object | no | RMS envelope for the amplitude lip-sync fallback (FR-LIP-02, method "amplitude"). |
| `status` | `"queued"` \| `"generating"` \| `"ready"` \| `"failed"` \| `"cancelled"` | yes |  |
| `error` | object | no |  |
| `error.code` | string | yes |  |
| `error.message` | string | yes |  |
| `job` | string | no |  |
| `createdAt` | string | yes |  |
