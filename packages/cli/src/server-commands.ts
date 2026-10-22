/** `frame server start` (FR-CLI services): runs the Frame Server for the Studio, CLI server mode and agents. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FrameError } from '@frame/schema';
import { createServer } from '@frame/server';
import { command } from './framework.js';
import { contentDir } from './env.js';

command({
  path: ['server', 'start'],
  summary: 'Start the Frame Server (Studio, REST and WebSocket API). Binds to 127.0.0.1 unless --host is given.',
  args: [
    { name: 'port', description: 'Port (default 4848)', type: 'number' },
    { name: 'host', description: 'Bind address (default 127.0.0.1; other addresses need --token)' },
    { name: 'token', description: 'Bearer token required on non-loopback binds (or FRAME_SERVER_TOKEN)' },
    { name: 'worker', description: 'Voice Worker URL (or FRAME_WORKER_URL); its token comes from FRAME_WORKER_TOKEN' },
    { name: 'open', description: 'Open this project folder at start', },
  ],
  examples: ['frame server start', 'FRAME_WORKER_URL=http://127.0.0.1:8765 frame server start --open MyShow.frame'],
  run: async (ctx) => {
    const host = (ctx.args.host as string | undefined) ?? '127.0.0.1';
    const port = (ctx.args.port as number | undefined) ?? 4848;
    const token = (ctx.args.token as string | undefined) ?? ctx.io.env.FRAME_SERVER_TOKEN;
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(host);
    if (!loopback && !token) throw new FrameError('PERMISSION_REQUIRED', `Binding to ${host} exposes your projects on the network`, undefined, 'Pass --token (or set FRAME_SERVER_TOKEN) and put a TLS proxy in front of the server.');
    const workerUrl = (ctx.args.worker as string | undefined) ?? ctx.io.env.FRAME_WORKER_URL;
    const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/studio/dist');
    if (ctx.opts.dryRun) return { dryRun: true, host, port, workerUrl: workerUrl ?? null, studioDir };
    const srv = await createServer({
      contentDir: contentDir(), studioDir, host, ...(token ? { token } : {}), watchMs: 1000,
      ...(workerUrl ? { workerUrl } : {}), ...(ctx.io.env.FRAME_WORKER_TOKEN ? { workerToken: ctx.io.env.FRAME_WORKER_TOKEN } : {}),
    });
    if (ctx.args.open) srv.hub.open(path.resolve(ctx.io.cwd, String(ctx.args.open)));
    await srv.app.listen({ host, port });
    const url = `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
    ctx.log(`Frame Server listening on ${url}`);
    await new Promise<void>((resolve) => {
      const stop = () => resolve();
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    await srv.close();
    return { stopped: true, url };
  },
  human: (r) => (r.dryRun ? `Dry run: would listen on ${r.host}:${r.port}` : `Server stopped (${r.url}).`),
});
