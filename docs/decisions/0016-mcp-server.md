# 0016 — MCP server: low-level SDK Server over the Frame Server API

Status: Accepted · Requirements: FR-AGT-01..04, FR-ARC-01, AC-13 (agent path)

## Decision

- **Package:** `@frame/mcp` with `@modelcontextprotocol/sdk` **1.31.0** (pinned; published 2026-09-28; MIT). The SDK's
  shipped README and type definitions were checked for the APIs used: `Server` (`server/index.js`) with
  `setRequestHandler` for `tools/list`, `tools/call`, `resources/list`, `resources/templates/list` and
  `resources/read`; `StdioServerTransport`; `Client`, `StdioClientTransport` and `InMemoryTransport` in tests. Zod is
  a peer dependency installed with it; Frame does not use it.
- **Low-level `Server`, not `McpServer`:** `McpServer.registerTool` takes Zod schemas. Frame's types are TypeBox JSON
  Schemas shared with the engine, so the low-level server publishes them directly as `inputSchema`. The SDK marks
  `Server` for "advanced use cases"; this is one.
- **One engine path:** every tool calls the Frame Server REST API. `frame mcp` connects to `--server URL` or starts an
  embedded server on a random loopback port (no logger, so stdout carries only protocol messages). Agents get the
  same validation, permissions, journaling and live updates as the Studio and the CLI.
- **Tagging and safety (FR-AGT-04):** requests carry `x-frame-agent: <session>`; the server sets `source:
  agent:<session>` on every change made by commands, character creation, voices and takes. Agents cannot change
  permissions (engine guard), cannot redo, can undo only when the newest undo step is their own, cannot call
  `revert-source`, and can render only inside the project folder. A person reverts an agent session as one step with
  `POST /api/projects/:id/revert-source`.
- **New server routes used by agents and later by the Studio:** `POST /api/projects/create` (library defaults, as
  `frame init`), `POST /api/projects/:id/characters` (`buildCharacter` in `@frame/core`: base character + changes, every
  ref checked for existence and kind), `POST /api/projects/:id/revert-source`.
- **Units:** tool arguments use seconds; commands use ticks (48 000 per second), stated in `describe_capabilities`.
- **Tool reference:** `docs/reference/mcp-tools.md` is generated from the tool definitions
  (`pnpm docs:mcp`); a test fails when it is stale.

## Evidence

`packages/mcp/test/mcp.test.ts` (SDK client over an in-memory transport against a real Frame Server: all FR-AGT-02
tools listed with JSON Schemas; create project → character → lines; dry run; base-revision conflict after a human
edit, resolved by re-reading; undo refused for a person's change; agent tagging on clips and in diffs; PNG frames;
permission guard; group revert; all FR-AGT-03 resources; with a worker: design voice → takes → video job).
`packages/mcp/test/stdio.test.ts` (the real `frame mcp` process over stdio).
