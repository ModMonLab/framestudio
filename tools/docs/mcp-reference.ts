/** Generates docs/reference/mcp-tools.md from the MCP tool definitions (`pnpm docs:mcp`). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOLS } from '../../packages/mcp/src/tools.js';

export function mcpReference(): string {
  const out = ['# Frame MCP tool reference', '', 'Generated from `packages/mcp/src/tools.ts` by `pnpm docs:mcp`. Start the server with `frame mcp` (stdio).', '', 'Resources: `frame://schemas`, `frame://schemas/{type}`, `frame://catalog`, `frame://commands`, `frame://project/{id}/summary`.', ''];
  for (const t of TOOLS) {
    out.push(`## \`${t.name}\`${t.readOnly ? ' (read-only)' : ''}`, '', t.description, '');
    const props = (t.inputSchema as { properties?: Record<string, { description?: string; type?: string; anyOf?: unknown[] }>; required?: string[] }).properties ?? {};
    const req = new Set((t.inputSchema as { required?: string[] }).required ?? []);
    if (!Object.keys(props).length) {
      out.push('No arguments.', '');
      continue;
    }
    out.push('| Argument | Type | Required | Notes |', '|---|---|---|---|');
    for (const [k, v] of Object.entries(props)) out.push(`| \`${k}\` | ${v.type ?? (v.anyOf ? 'union' : 'object')} | ${req.has(k) ? 'yes' : 'no'} | ${(v.description ?? '').replace(/\|/g, '\\|')} |`);
    out.push('');
  }
  return out.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/reference/mcp-tools.md');
  fs.writeFileSync(file, mcpReference());
  console.log(`Wrote ${file}`);
}
