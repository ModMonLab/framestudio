/**
 * Server mode (FR-CLI-01/02): with --server the CLI sends the same engine commands to a running Frame Server
 * instead of editing the folder itself, so Studio sessions on that server see the edits live.
 */
import { FrameError, type ErrorCode } from '@frame/schema';
import type { ProjectState } from '@frame/core';
import type { CommandContext } from './framework.js';

export interface Remote {
  url: string;
  req<T>(method: string, path: string, body?: unknown): Promise<T>;
}

export function remote(ctx: CommandContext): Remote | undefined {
  const url = ctx.opts.server ?? undefined;
  if (!url) return undefined;
  const token = ctx.opts.token ?? ctx.io.env.FRAME_SERVER_TOKEN;
  const base = url.replace(/\/+$/, '');
  return {
    url: base,
    async req<T>(method: string, path: string, body?: unknown): Promise<T> {
      let res: Response;
      try {
        res = await fetch(base + path, {
          method,
          headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(ctx.io.env.FRAME_AGENT_SESSION ? { 'x-frame-agent': ctx.io.env.FRAME_AGENT_SESSION } : {}) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch {
        throw new FrameError('WORKER_UNAVAILABLE', `The Frame Server at ${base} is not reachable`, undefined, 'Start it with `frame server start` or drop --server to work on the folder directly.');
      }
      const json = (await res.json().catch(() => ({}))) as { error?: { code: ErrorCode; message: string; details?: unknown; hint?: string } };
      if (!res.ok) throw new FrameError(json.error?.code ?? 'INTERNAL', json.error?.message ?? `Server error ${res.status}`, json.error?.details, json.error?.hint);
      return json as T;
    },
  };
}

/** Opens the project folder on the server (idempotent) and returns its id. */
export async function remoteProject(r: Remote, dir: string): Promise<string> {
  return (await r.req<{ id: string }>('POST', '/api/projects/open', { path: dir })).id;
}

export async function remoteState(r: Remote, pid: string): Promise<{ state: ProjectState; revision: number }> {
  return r.req('GET', `/api/projects/${pid}/state`);
}

/** Waits for a server job, logging progress lines. */
export async function waitJob<T>(r: Remote, id: string, log: (s: string) => void): Promise<T> {
  let last = '';
  for (;;) {
    const j = await r.req<{ state: string; message: string; progress: number; result?: T; error?: { code: ErrorCode; message: string; details?: unknown } }>('GET', `/api/jobs/${id}`);
    if (j.message && j.message !== last) log((last = j.message));
    if (j.state === 'succeeded') return j.result as T;
    if (j.state === 'failed' || j.state === 'cancelled') throw new FrameError(j.error?.code ?? (j.state === 'cancelled' ? 'CANCELLED' : 'RENDER_FAILED'), j.error?.message ?? `Job ${j.state}`, j.error?.details);
    await new Promise((res) => setTimeout(res, 250));
  }
}
