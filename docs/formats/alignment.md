# alignment

Word and phoneme timings of a take (forced, transcribed+forced, or amplitude).

JSON Schema: [schemas/alignment.schema.json](schemas/alignment.schema.json) · `frame schema alignment`

| Field | Type | Required | Notes |
|---|---|---|---|
| `words` | object[] | yes |  |
| `phonemes` | object[] | yes |  |
| `method` | `"forced"` \| `"transcribed+forced"` \| `"amplitude"` \| `"fixture"` | yes |  |
| `confidence` | number | yes | ≥ 0, ≤ 1 |
| `aligner` | string | no |  |
| `envelope` | object | no | RMS envelope for the amplitude lip-sync fallback (FR-LIP-02, method "amplitude"). |
| `envelope.windowS` | number | yes |  |
| `envelope.values` | number[] | yes |  |
