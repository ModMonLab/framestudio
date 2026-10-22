# 0004 — Persistence: commit journal

**Context.** FR-PER-01 allows debounced writes (≤ 1 s) but FR-PER-04/NFR-08 require that no committed command is lost.

**Decision.** On each commit, before returning, Frame appends to `history/journal.jsonl` (fsync) the post-commit content of every changed entity (`scenes/<id>`, `episodes/<id>`, `project`, `takes/<id>`…; `null` = deleted). Replaying is idempotent, so it is correct even if a debounced save had partially written newer files. A save writes entity files atomically (temp + fsync + rename, stable key order), then `history/state.json` with the saved revision, then removes the journal. A torn last journal line is ignored (that commit never completed). `history/commands.jsonl` keeps the command log for audits and `frame history`.

**Additions to the SRS folder layout.** `versions/<snapshot-id>/` holds named snapshots (FR-PER-03); `history/state.json` holds the saved revision.

**Evidence.** `packages/io/test/crash.test.ts` kills a child process (SIGKILL) during ≥ 1 000 random edits over several rounds and verifies the reopened project equals the last committed state hash.
