/** `@frame/mcp`: the Frame MCP server (FR-AGT-01). */
import { randomUUID } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '@frame/server';
import { frameApi } from './api.js';
import { createFrameMcp } from './server.js';

export * from './api.js';
export * from './server.js';
export { TOOLS, summarize } from './tools.js';

export interface StartOptions {
  /** Running Frame Server to use; without it an embedded server is started on a loopback port. */
  serverUrl?: string;
  token?: string;
  /** Embedded server: content library and voice worker. */
  contentDir: string;
  userDir?: string;
  workerUrl?: string;
  workerToken?: string;
  /** Agent session id (default: random); changes are tagged `agent:<session>`. */
  session?: string;
  log?: (s: string) => void;
}

/** Runs the MCP server on stdio until the client disconnects. stdout carries only protocol messages. */
export async function runStdio(o: StartOptions): Promise<void> {
  const session = o.session ?? `mcp-${randomUUID().slice(0, 8)}`;
  let url = o.serverUrl;
  let embedded: Awaited<ReturnType<typeof createServer>> | undefined;
  if (!url) {
    embedded = await createServer({ contentDir: o.contentDir, ...(o.userDir ? { userDir: o.userDir } : {}), host: '127.0.0.1', logger: false, watchMs: 1000, ...(o.workerUrl ? { workerUrl: o.workerUrl } : {}), ...(o.workerToken ? { workerToken: o.workerToken } : {}) });
    url = await embedded.app.listen({ host: '127.0.0.1', port: 0 });
  }
  o.log?.(`Frame MCP: session agent:${session}, server ${url}${embedded ? ' (embedded)' : ''}`);
  const server = createFrameMcp({ api: frameApi({ url, session, ...(o.token ? { token: o.token } : {}) }) });
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => (server.onclose = () => resolve()));
  await server.connect(transport);
  await closed;
  await embedded?.close();
}
