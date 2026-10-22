/**
 * HTTP client for the Frame Server used by the MCP server. Every request carries the agent session id
 * (`x-frame-agent`), so the server tags the changes `agent:<session>` in history and on clips (FR-AGT-04).
 */
import { FrameError, type ErrorCode } from '@frame/schema';

export interface FrameApi {
  readonly url: string;
  readonly session: string;
  json<T>(method: string, path: string, body?: unknown): Promise<T>;
  bytes(path: string): Promise<{ bytes: Uint8Array; type: string }>;
}

export function frameApi(o: { url: string; session: string; token?: string }): FrameApi {
  const base = o.url.replace(/\/+$/, '');
  const headers = (json: boolean) => ({ ...(json ? { 'content-type': 'application/json' } : {}), ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), 'x-frame-agent': o.session });
  const send = async (method: string, path: string, body?: unknown) => {
    try {
      return await fetch(base + path, { method, headers: headers(body !== undefined), ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    } catch {
      throw new FrameError('WORKER_UNAVAILABLE', `The Frame Server at ${base} is not reachable`, undefined, 'Start it with `frame server start`, or run `frame mcp` without --server to use an embedded one.');
    }
  };
  const fail = async (res: Response): Promise<never> => {
    const j = (await res.json().catch(() => ({}))) as { error?: { code: ErrorCode; message: string; details?: unknown; hint?: string } };
    throw new FrameError(j.error?.code ?? 'INTERNAL', j.error?.message ?? `Server error ${res.status}`, j.error?.details, j.error?.hint);
  };
  return {
    url: base,
    session: o.session,
    async json<T>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await send(method, path, body);
      if (!res.ok) return fail(res);
      return (await res.json()) as T;
    },
    async bytes(path: string) {
      const res = await send('GET', path);
      if (!res.ok) return fail(res);
      return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') ?? 'application/octet-stream' };
    },
  };
}
