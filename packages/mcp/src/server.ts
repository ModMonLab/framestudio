/**
 * Frame MCP server (FR-AGT-01..03): typed tools over the Frame Server API and read-only resources (JSON Schemas, the
 * asset catalogue, the command reference and the current project summary). Uses the SDK's low-level `Server` so tool
 * input schemas are the engine's own TypeBox JSON Schemas (decision 0016).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FrameError, jsonSchema, schemas } from '@frame/schema';
import type { FrameApi } from './api.js';
import { summarize, TOOLS, type ToolContent, type ToolCtx } from './tools.js';

export const MCP_VERSION = '0.1.0';

export interface FrameMcpOptions {
  api: FrameApi;
  /** Longest a tool waits for a job before handing back its id (default 120 s). */
  waitMs?: number;
}

export function createFrameMcp(o: FrameMcpOptions): Server {
  const server = new Server(
    { name: 'frame', title: 'Frame', version: MCP_VERSION },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: 'Frame is a 2D animation studio. Call describe_capabilities first, then create_project or open_project. Edit with apply_commands (dry_run first; pass base_revision and re-read on REVISION_CONFLICT). Look up refs with search_assets. Your changes are tagged with your session and people can revert them. Never present fixture voice output as real speech.',
    },
  );
  const ctx: ToolCtx = { api: o.api, waitMs: o.waitMs ?? 120_000, setCurrent: (id) => (ctx.current = id) };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema as never, annotations: { title: t.title, readOnlyHint: t.readOnly, destructiveHint: false, openWorldHint: false } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.name === req.params.name);
    if (!tool) return errorResult(new FrameError('NOT_FOUND', `Unknown tool ${req.params.name}`, { tools: TOOLS.map((t) => t.name) }));
    try {
      const out = await tool.run((req.params.arguments ?? {}) as Record<string, unknown>, ctx);
      if (out && typeof out === 'object' && 'content' in out && Array.isArray((out as { content: unknown }).content)) return { content: (out as { content: ToolContent[] }).content };
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out as Record<string, unknown> };
    } catch (e) {
      return errorResult(e);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: 'frame://schemas', name: 'schemas', title: 'JSON Schemas', description: 'Types with a published JSON Schema (file formats and payloads).', mimeType: 'application/json' },
      { uri: 'frame://catalog', name: 'catalog', title: 'Asset catalogue', description: 'Every library asset: ref, kind, name, group, families, views and capabilities.', mimeType: 'application/json' },
      { uri: 'frame://commands', name: 'commands', title: 'Command reference', description: 'Engine commands with summaries and JSON Schemas of their parameters.', mimeType: 'application/json' },
      ...(ctx.current ? [{ uri: `frame://project/${ctx.current}/summary`, name: 'project-summary', title: 'Current project summary', mimeType: 'application/json' }] : []),
    ],
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [
      { uriTemplate: 'frame://schemas/{type}', name: 'schema', title: 'JSON Schema of a type', mimeType: 'application/schema+json' },
      { uriTemplate: 'frame://project/{id}/summary', name: 'project-summary', title: 'Project summary', mimeType: 'application/json' },
    ],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    const json = (v: unknown, mimeType = 'application/json') => ({ contents: [{ uri, mimeType, text: JSON.stringify(v, null, 2) }] });
    if (uri === 'frame://schemas') return json({ types: Object.keys(schemas), read: 'frame://schemas/{type}' });
    const sm = /^frame:\/\/schemas\/(.+)$/.exec(uri);
    if (sm) {
      const s = jsonSchema(decodeURIComponent(sm[1]!));
      if (!s) throw new FrameError('NOT_FOUND', `Unknown schema ${sm[1]}`);
      return json(s, 'application/schema+json');
    }
    if (uri === 'frame://catalog') {
      const r = await o.api.json<{ results: Record<string, unknown>[] }>('GET', `/api/library?limit=all${ctx.current ? `&project=${encodeURIComponent(ctx.current)}` : ''}`);
      return json({ count: r.results.length, items: r.results.map(({ ref, kind, name, group, category, families, views, capabilities, tags }) => ({ ref, kind, name, group, category, families, views, capabilities, tags })) });
    }
    if (uri === 'frame://commands') return json(await o.api.json('GET', '/api/commands'));
    const pm = /^frame:\/\/project\/([^/]+)\/summary$/.exec(uri);
    if (pm) return json(summarize(await o.api.json('GET', `/api/projects/${pm[1]}/state`)));
    throw new FrameError('NOT_FOUND', `Unknown resource ${uri}`);
  });
  return server;
}

function errorResult(e: unknown) {
  const err = e instanceof FrameError ? { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}), ...(e.hint ? { hint: e.hint } : {}) } : { code: 'INTERNAL', message: e instanceof Error ? e.message : String(e) };
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: err }, null, 2) }] };
}
