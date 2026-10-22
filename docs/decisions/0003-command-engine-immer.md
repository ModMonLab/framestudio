# 0003 — Command engine on immer patches

**Decision.** Commands are `{name, params}` (FR-ARC-02). Each command definition has a TypeBox params schema, `prepare` (fills generated IDs so the recorded command replays exactly), `apply` (mutates an immer draft), `label` (undo label) and optional `touches` (hierarchical entity keys).
`immer` 10.1 (MIT) `produceWithPatches` provides forward and inverse patches: undo/redo apply stored patches, so undo never re-runs generation (FR-PER-02).

**Concurrency (FR-ARC-04).** A batch with an older `baseRevision` is rebased only when every command declares `touches` and none overlap keys changed since (keys overlap when equal or one is a prefix path of the other, e.g. `scenes/scn_a` ⊃ `scenes/scn_a/clips/clp_b`). Otherwise `REVISION_CONFLICT` with the changes made since.

**Agent revert (FR-AGT-04).** `revertSource(source)` applies the inverse patches of that source's steps in reverse order as one undoable step; if later edits make that impossible it reports `CONFLICT`.
