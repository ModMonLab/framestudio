# 0014 — Frame Server: Fastify, entity-delta live updates, job queues

Status: Accepted · Requirements: FR-ARC-01..05, FR-PER-05, FR-RND-07, FR-VOI-02/07/12, FR-CLI (services)

## Decision

- **Fastify 5.12.5** (MIT) with **@fastify/websocket 11.3.3** (MIT, wraps `ws` 8) and **@fastify/static 10.1.5** (MIT).
  APIs checked against the installed READMEs: `get(path, { websocket: true }, (socket, req) => …)`, `addContentTypeParser`
  with `parseAs: 'buffer'`, `register(static, { root, prefix, decorateReply: false })`. Versions chosen ≥ 2 weeks old.
- **One engine path:** every edit is `POST /api/projects/:id/commands` with a `CommandBatch` executed by the same
  `ProjectSession` the CLI uses; `REVISION_CONFLICT` and commutative rebase come from the engine (FR-ARC-04). Error
  bodies carry the Frame error code and the CLI exit code.
- **Live updates (FR-ARC-03):** `GET /api/events?project=` (WebSocket) publishes `change` events with an **entity
  delta** (`@frame/core/sync`) — the same format the journal stores — plus `save`, `external` and `job` events.
  Clients rebuild state with `applyDelta`; a test checks the mirror equals the server state.
- **Jobs (FR-ARC-05):** two in-memory queues (render, voice), concurrency 1 each, with state, progress (throttled),
  logs and cancellation through `AbortSignal`. Renders snapshot the state at submission (FR-RND-05).
- **Voice workflows** live in `@frame/voice-client/workflow` (design candidates, save designed voice as a project-local
  `user.<uuid>` asset, generate takes with placeholder "Generating" take records, align, auto-choose only for the
  current text). Delivery controls are sent only when the worker reports them (FR-VOI-08).
- **Security:** loopback bind by default with Host-header checks (DNS rebinding); non-loopback binds require a token
  (`frame server start` refuses otherwise). Worker tokens come from the environment, never from project files (NFR-09).
- **External edits (FR-PER-05):** polling `store.externalChanges()` (1 s in `frame server start`); reload when nothing
  is pending, otherwise an `external` event lets the Studio ask.

## Evidence

`packages/server/test/server.test.ts` (7 tests) and `tools/test/slice.test.ts` (M1 exit path with the fixture worker:
two designed voices, four aligned takes, export, server and CLI frames byte-identical). CI job `slice`.
