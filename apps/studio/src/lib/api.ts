/** Frame Server client for the Studio: REST commands and the live event stream (FR-ARC-01/03). */
import type { Command, Problem } from '@frame/schema';
import type { ProjectState } from '@frame/core';

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly hint?: string, public readonly details?: unknown) {
    super(message);
  }
}

async function req<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : body instanceof Uint8Array ? (body as BodyInit) : JSON.stringify(body) });
  } catch {
    throw new ApiError('SERVER_UNAVAILABLE', 'The Frame Server is not reachable', 'Start it with `frame server start`.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; hint?: string; details?: unknown } };
  if (!res.ok) throw new ApiError(json.error?.code ?? 'INTERNAL', json.error?.message ?? `Request failed (${res.status})`, json.error?.hint, json.error?.details);
  return json as T;
}

export interface Snapshot {
  revision: number;
  state: ProjectState;
  save: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

export interface SaveState {
  status: 'saved' | 'saving' | 'unsaved' | 'error';
  revision: number;
  savedRevision: number;
  error?: string;
}

export interface JobInfo {
  id: string;
  kind: string;
  project?: string;
  title: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  message: string;
  result?: any;
  error?: { code: string; message: string; hint?: string };
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface WorkerStatus {
  state: 'connected' | 'busy' | 'offline' | 'misconfigured';
  url?: string;
  busy?: number;
  fixture?: boolean;
  label?: string;
  message?: string;
  hint?: string;
  capabilities?: { engines: { id: string; label: string; controls: { emotion: string[]; pace: unknown; instruction: boolean } }[]; limits: { minRefSeconds: number } };
}

export const api = {
  health: () => req<{ ok: boolean; version: string }>('GET', '/api/health'),
  projects: () => req<{ projects: { id: string; name: string; root: string; revision: number }[] }>('GET', '/api/projects'),
  open: (path: string, migrate = false) => req<{ id: string; root: string; revision: number; problems: Problem[] }>('POST', '/api/projects/open', { path, migrate }),
  state: (pid: string) => req<Snapshot>('GET', `/api/projects/${pid}/state`),
  apply: (pid: string, commands: Command[], o: { baseRevision?: number; label?: string } = {}) => req<{ revision: number; label: string; commands: Command[]; reports: unknown[] }>('POST', `/api/projects/${pid}/commands`, { commands, ...o }),
  undo: (pid: string) => req<{ revision: number; label: string }>('POST', `/api/projects/${pid}/undo`),
  redo: (pid: string) => req<{ revision: number; label: string }>('POST', `/api/projects/${pid}/redo`),
  save: (pid: string) => req<SaveState>('POST', `/api/projects/${pid}/save`),
  validate: (pid: string) => req<{ revision: number; problems: Problem[] }>('GET', `/api/projects/${pid}/validate`),
  sceneAssets: (pid: string, scene: string) => req<{ revision: number; manifests: Record<string, unknown> }>('GET', `/api/projects/${pid}/scene-assets?scene=${encodeURIComponent(scene)}`),
  manifest: (ref: string, pid?: string) => req<unknown>('GET', `/api/library/manifest?ref=${encodeURIComponent(ref)}${pid ? `&project=${pid}` : ''}`),
  library: (q: string, kind?: string, pid?: string, limit = 200) => req<{ results: { ref: string; kind: string; name: string; category: string; group?: string; tags: string[] }[] }>('GET', `/api/library?q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ''}${pid ? `&project=${pid}` : ''}&limit=${limit}`),
  styles: () => req<Record<string, unknown>>('GET', '/api/styles'),
  jobs: (pid?: string) => req<{ jobs: JobInfo[] }>('GET', `/api/jobs${pid ? `?project=${pid}` : ''}`),
  cancelJob: (id: string) => req<{ cancelled: boolean }>('DELETE', `/api/jobs/${id}`),
  render: (pid: string, body: Record<string, unknown>) => req<JobInfo>('POST', `/api/projects/${pid}/renders`, body),
  worker: (pid?: string) => req<WorkerStatus>('GET', `/api/worker/status${pid ? `?project=${pid}` : ''}`),
  designVoice: (pid: string, body: { description: string; sampleText: string; candidates: number; language?: string; seed?: number }) => req<JobInfo>('POST', `/api/projects/${pid}/voices/design`, body),
  saveVoice: (pid: string, body: Record<string, unknown>) => req<{ ref: string; revision: number }>('POST', `/api/projects/${pid}/voices`, body),
  generateTakes: (pid: string, body: { scene: string; lines: string[]; takes: number; seed?: number }) => req<JobInfo>('POST', `/api/projects/${pid}/takes/generate`, body),
  mediaUrl: (pid: string, hash: string) => `/api/projects/${pid}/media/${hash}`,
};

export type ServerEvent =
  | { type: 'hello'; version: string; project?: string; revision?: number }
  | { type: 'change'; project: string; revision: number; label: string; source: string; delta: Record<string, unknown>; full: boolean; undo: { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null } }
  | { type: 'save'; project: string; save: SaveState }
  | { type: 'external'; project: string; files: string[]; reloaded: boolean }
  | { type: 'job'; job: JobInfo };

/** WebSocket event stream with automatic reconnect; calls onReconnect so the client can resync. */
export function connectEvents(pid: string, onEvent: (e: ServerEvent) => void, onStatus: (connected: boolean) => void): () => void {
  let ws: WebSocket | undefined;
  let closed = false;
  let retry = 500;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/api/events?project=${encodeURIComponent(pid)}`);
    ws.onopen = () => {
      retry = 500;
      onStatus(true);
    };
    ws.onmessage = (m) => onEvent(JSON.parse(String(m.data)) as ServerEvent);
    ws.onclose = () => {
      onStatus(false);
      if (!closed) setTimeout(open, (retry = Math.min(8000, retry * 2)));
    };
  };
  open();
  return () => {
    closed = true;
    ws?.close();
  };
}
