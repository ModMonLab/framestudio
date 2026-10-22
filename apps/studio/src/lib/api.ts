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

/** One committed change in the project history (FR-PER-02, FR-AGT-05). */
export interface HistoryEntry { revision: number; at: string; label: string; source: string; commands: { name: string }[] }

export const api = {
  health: () => req<{ ok: boolean; version: string }>('GET', '/api/health'),
  projects: () => req<{ projects: { id: string; name: string; root: string; revision: number }[] }>('GET', '/api/projects'),
  open: (path: string, migrate = false) => req<{ id: string; root: string; revision: number; problems: Problem[] }>('POST', '/api/projects/open', { path, migrate }),
  state: (pid: string) => req<Snapshot>('GET', `/api/projects/${pid}/state`),
  apply: (pid: string, commands: Command[], o: { baseRevision?: number; label?: string } = {}) => req<{ revision: number; label: string; commands: Command[]; reports: unknown[] }>('POST', `/api/projects/${pid}/commands`, { commands, ...o }),
  undo: (pid: string) => req<{ revision: number; label: string }>('POST', `/api/projects/${pid}/undo`),
  redo: (pid: string) => req<{ revision: number; label: string }>('POST', `/api/projects/${pid}/redo`),
  save: (pid: string) => req<SaveState>('POST', `/api/projects/${pid}/save`),
  history: (pid: string) => req<{ history: HistoryEntry[] }>('GET', `/api/projects/${pid}/history`),
  revertSource: (pid: string, source: string) => req<{ revision: number; label: string }>('POST', `/api/projects/${pid}/revert-source`, { source }),
  validate: (pid: string) => req<{ revision: number; problems: Problem[] }>('GET', `/api/projects/${pid}/validate`),
  sceneAssets: (pid: string, scene: string) => req<{ revision: number; manifests: Record<string, unknown> }>('GET', `/api/projects/${pid}/scene-assets?scene=${encodeURIComponent(scene)}`),
  manifest: (ref: string, pid?: string) => req<unknown>('GET', `/api/library/manifest?ref=${encodeURIComponent(ref)}${pid ? `&project=${pid}` : ''}`),
  library: (q: string, kind?: string, pid?: string, limit = 200, sel?: { scene: string; instance: string }) => req<{ results: { ref: string; kind: string; name: string; category: string; group?: string; tags: string[]; preview?: boolean; incompatible?: string; source?: string }[] }>('GET', `/api/library?q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ''}${pid ? `&project=${pid}` : ''}&limit=${limit}${sel ? `&scene=${encodeURIComponent(sel.scene)}&instance=${encodeURIComponent(sel.instance)}` : ''}`),
  styles: () => req<Record<string, unknown>>('GET', '/api/styles'),
  jobs: (pid?: string) => req<{ jobs: JobInfo[] }>('GET', `/api/jobs${pid ? `?project=${pid}` : ''}`),
  cancelJob: (id: string) => req<{ cancelled: boolean }>('DELETE', `/api/jobs/${id}`),
  render: (pid: string, body: Record<string, unknown>) => req<JobInfo>('POST', `/api/projects/${pid}/renders`, body),
  worker: (pid?: string) => req<WorkerStatus>('GET', `/api/worker/status${pid ? `?project=${pid}` : ''}`),
  designVoice: (pid: string, body: { description: string; sampleText: string; candidates: number; language?: string; seed?: number }) => req<JobInfo>('POST', `/api/projects/${pid}/voices/design`, body),
  saveVoice: (pid: string, body: Record<string, unknown>) => req<{ ref: string; revision: number }>('POST', `/api/projects/${pid}/voices`, body),
  voiceRange: (pid: string, body: { voice: string; emotions?: string[]; text?: string }) => req<JobInfo>('POST', `/api/projects/${pid}/voices/range`, body),
  voiceVersion: (pid: string, body: { voice: string; accept: unknown[]; updateUsers: boolean }) => req<{ ref: string; revision: number; updated: number }>('POST', `/api/projects/${pid}/voices/version`, body),
  generateTakes: (pid: string, body: { scene: string; lines: string[]; takes: number; seed?: number }) => req<JobInfo>('POST', `/api/projects/${pid}/takes/generate`, body),
  uploadTake: (pid: string, scene: string, line: string, file: File) => {
    const ext = (file.name.split('.').pop() ?? '').toLowerCase();
    return file.arrayBuffer().then((b) => req<JobInfo>('POST', `/api/projects/${pid}/takes/upload?scene=${encodeURIComponent(scene)}&line=${encodeURIComponent(line)}&ext=${encodeURIComponent(ext)}`, new Uint8Array(b), { 'content-type': 'application/octet-stream' }));
  },
  mediaUrl: (pid: string, hash: string) => `/api/projects/${pid}/media/${hash}`,
  libraryDefaults: () => req<{ builderTests?: { expressions: string[]; gestures: string[]; lipSyncText?: string }; previewCharacter?: string }>('GET', '/api/library/defaults'),
  checkCharacter: (pid: string, body: { from: string; spec: unknown }) => req<CharacterCheckResult>('POST', `/api/projects/${pid}/characters/check`, body),
  saveCharacterVersion: (pid: string, body: { from: string; spec: unknown; asNew?: boolean; update?: { scope: 'instance' | 'scene' | 'project'; scene?: string; instance?: string } }) => req<{ ref: string; version: number; isNew: boolean; revision: number }>('POST', `/api/projects/${pid}/characters/versions`, body),
  usages: (id: string) => req<{ id: string; projects: { project: string; name: string; usages: { ref: string; scene: string; sceneName: string; kind: string; id: string; name: string }[] }[] }>('GET', `/api/library/usages?id=${encodeURIComponent(id)}`),
  packageExportUrl: (pid: string, format: 'framechar' | 'frameasset' | 'framevoice', refs: string[]) => `/api/projects/${pid}/packages/export?format=${format}&refs=${encodeURIComponent(refs.join(','))}`,
  projectPackageUrl: (pid: string) => `/api/projects/${pid}/package`,
  importPackage: (pid: string, file: File, o: { newIds?: boolean; dryRun?: boolean } = {}) =>
    file.arrayBuffer().then((b) => req<{ format: string; roots: string[]; added: string[]; unchanged: string[]; renamed: { from: string; to: string }[]; missing: string[]; revision: number }>('POST', `/api/projects/${pid}/packages/import?${o.newIds ? 'onConflict=new-id&' : ''}${o.dryRun ? 'dryRun=true' : ''}`, new Uint8Array(b), { 'content-type': 'application/zip' })),
  importFile: (pid: string, file: File, o: { rights: string; licence?: string; scene?: string; as?: string; at?: number; x?: number; y?: number }) => {
    const q = new URLSearchParams({ name: file.name, rights: o.rights, ...(o.licence ? { licence: o.licence } : {}), ...(o.scene ? { scene: o.scene } : {}), ...(o.as ? { as: o.as } : {}), ...(o.at !== undefined ? { at: String(Math.round(o.at)) } : {}), ...(o.x !== undefined ? { x: String(o.x) } : {}), ...(o.y !== undefined ? { y: String(o.y) } : {}) });
    return file.arrayBuffer().then((b) => req<{ kind: 'image' | 'audio'; asset?: string; instance?: string; clip?: string; warnings: string[]; revision: number }>('POST', `/api/projects/${pid}/import?${q}`, new Uint8Array(b), { 'content-type': 'application/octet-stream' }));
  },
  readArtwork: (pid: string, name: string, bytes: Uint8Array) => req<unknown>('POST', `/api/projects/${pid}/rigging/read?name=${encodeURIComponent(name)}`, bytes, { 'content-type': 'application/octet-stream' }),
  buildRig: (pid: string, body: Record<string, unknown>) => req<unknown>('POST', `/api/projects/${pid}/rigging/build`, body),
  autoPerformance: (pid: string, scene: string, body: { instances?: string[]; kinds?: ('talking' | 'listening')[] } = {}) => req<{ revision: number; added: number; removed: number }>('POST', `/api/projects/${pid}/scenes/${scene}/auto-performance`, body),
  prefs: () => req<UserPrefs>('GET', '/api/user/prefs'),
  setPrefs: (p: Omit<UserPrefs, 'schemaVersion'>) => req<UserPrefs>('PUT', '/api/user/prefs', p),
  saveToLibrary: (pid: string, refs: string[]) => req<{ added: string[]; unchanged: string[] }>('POST', `/api/projects/${pid}/library/save`, { refs }),
  adopt: (pid: string, refs: string[]) => req<{ added: string[]; revision: number }>('POST', `/api/projects/${pid}/library/adopt`, { refs }),
  savePart: (pid: string, body: { from: string; name: string; data: unknown; draft?: boolean; asNew?: boolean; changes?: string }) => req<{ ref: string; isNew: boolean; draft: boolean; revision: number }>('POST', `/api/projects/${pid}/parts`, body),
  versions: (pid: string) => req<{ versions: { id: string; name: string; createdAt: string; revision: number }[] }>('GET', `/api/projects/${pid}/versions`),
  saveVersion: (pid: string, name: string) => req<{ id: string; name: string; createdAt: string; revision: number }>('POST', `/api/projects/${pid}/versions`, { name }),
  compareVersion: (pid: string, vid: string) => req<VersionComparison>('GET', `/api/projects/${pid}/versions/${vid}/compare`),
  copyVersion: (pid: string, vid: string, path: string) => req<{ id: string; root: string; name: string }>('POST', `/api/projects/${pid}/versions/${vid}/copy`, { path }),
  restoreVersion: (pid: string, vid: string) => req<{ revision: number; label: string }>('POST', `/api/projects/${pid}/versions/${vid}/restore`),
};

export interface CharacterCheckResult {
  ok: boolean;
  families: string[];
  views: string[];
  mouthShapes: number;
  actions: { compatible: number; total: number };
  problems: { severity: 'error' | 'warning'; part?: string; message: string }[];
}

export interface VersionComparison {
  identical: boolean;
  project: string[];
  scenes: { id: string; name: string; change: 'added' | 'removed' | 'changed'; clips?: { added: number; removed: number; changed: number }; instances?: { added: number; removed: number; changed: number }; versions?: { instance: string; from: string; to: string }[] }[];
  assets: { added: string[]; removed: string[] };
  takes: { added: number; removed: number };
}

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

export interface UserPrefs {
  schemaVersion: 1;
  favourites: string[];
  collections: { id: string; name: string; items: string[] }[];
}
