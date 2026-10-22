/** `frame mcp` over stdio (FR-AGT-01): the real CLI process with an embedded Frame Server; stdout is protocol only. */
import { expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

it('frame mcp serves tools over stdio with an embedded server', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', 'tsx', path.join(repo, 'packages/cli/src/bin.ts'), 'mcp', '--session', 'stdio-test'],
    cwd: repo,
    env: { ...(process.env as Record<string, string>), FRAME_WORKER_URL: '' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'stdio-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    expect(client.getServerVersion()?.name).toBe('frame');
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(17);
    const r = (await client.callTool({ name: 'describe_capabilities', arguments: {} })) as { content: { text: string }[] };
    expect(JSON.parse(r.content[0]!.text).session).toBe('agent:stdio-test');
  } finally {
    await client.close();
  }
}, 60_000);

it('docs/reference/mcp-tools.md matches the tool definitions', async () => {
  const fs = await import('node:fs');
  const { mcpReference } = await import('../../../tools/docs/mcp-reference.js');
  expect(fs.readFileSync(path.join(repo, 'docs/reference/mcp-tools.md'), 'utf8'), 'run pnpm docs:mcp').toBe(mcpReference());
});
