# asset

Every library or project-local asset manifest (parts, props, kits, actions, voices, templates, …).

JSON Schema: [schemas/asset.schema.json](schemas/asset.schema.json) · `frame schema asset`

| Field | Type | Required | Notes |
|---|---|---|---|
| `schemaVersion` | integer | yes | File schema version (FR-DAT-05). ≥ 1 |
| `id` | string | yes | Asset ID. |
| `version` | integer | yes | ≥ 1 |
| `kind` | string | yes | Catalog prefix of the asset category (e.g. hair, act, prop). |
| `name` | string | yes |  |
| `category` | string | yes |  |
| `group` | string | no |  |
| `tags` | string[] | yes |  |
| `synonyms` | string[] | yes |  |
| `families` | `"flat"` \| `"illustrated"`[] | yes |  |
| `views` | `"front"` \| `"three"` \| `"side"` \| `"back"`[] | yes |  |
| `viewExemptions` | map of string | yes | view → documented reason. |
| `anchors` | map of any | yes |  |
| `capabilities` | string[] | yes |  |
| `parameters` | object[] | yes |  |
| `dependencies` | string[] | yes |  |
| `layering` | map of any | yes |  |
| `previews` | object | yes |  |
| `previews.flat` | string | no |  |
| `previews.illustrated` | string | no |  |
| `license` | object | yes |  |
| `license.id` | string | yes | SPDX identifier or "proprietary-owner". |
| `license.redistributable` | boolean | yes |  |
| `license.commercialUse` | boolean | yes |  |
| `license.attribution` | string | no |  |
| `provenance` | object | yes |  |
| `provenance.method` | `"authored"` \| `"ai-assisted-human-reviewed"` \| `"imported"` \| `"generated"` \| `"recorded"` | yes |  |
| `provenance.author` | string | yes |  |
| `provenance.date` | string | yes |  |
| `provenance.sourceFile` | string | no |  |
| `provenance.rightsStatement` | string | no |  |
| `provenance.notes` | string | no |  |
| `review` | object | no |  |
| `review.status` | `"pending"` \| `"approved"` \| `"changes-requested"` | yes |  |
| `review.by` | string | no |  |
| `review.date` | string | no |  |
| `review.sheet` | string | no |  |
| `deprecated` | object | no |  |
| `deprecated.replacement` | string | yes | Asset ID. |
| `changes` | string | no | What changed in this version (FR-AST-05). |
| `data` | any | yes | Kind-specific definition, validated by the kind schema in @frame/assets. |
