/**
 * Project browser support (FR-PRJ-06): the recent-projects registry kept by the server (pinned, last opened, counts),
 * duplicating a project folder under a new project id, and moving a folder to the operating system's trash.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FrameError } from '@frame/schema';
import type { ProjectState } from '@frame/core';
import { readJson, writeJsonAtomic } from './fsutil.js';
import { isProjectFolder, ProjectStore } from './store.js';

export interface RecentEntry {
  root: string;
  name: string;
  openedAt: string;
  pinned?: boolean;
  episodes: number;
  scenes: number;
  /** The scene shown as the thumbnail (first scene). */
  thumbScene?: string;
}

export class RecentProjects {
  constructor(readonly file: string, private readonly limit = 50) {}

  list(): (RecentEntry & { exists: boolean })[] {
    const all = (fs.existsSync(this.file) ? readJson<RecentEntry[]>(this.file) : []) ?? [];
    return all.map((e) => ({ ...e, exists: isProjectFolder(e.root) }));
  }

  private write(list: RecentEntry[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    // Pinned entries are never trimmed.
    const pinned = list.filter((e) => e.pinned);
    const rest = list.filter((e) => !e.pinned).slice(0, Math.max(0, this.limit - pinned.length));
    writeJsonAtomic(this.file, [...pinned, ...rest].sort((a, b) => b.openedAt.localeCompare(a.openedAt)));
  }

  touch(root: string, state: ProjectState, now = new Date().toISOString()): void {
    const list = this.list().map(({ exists: _e, ...r }) => r);
    const prev = list.find((e) => e.root === root);
    const scenes = state.project.episodes.flatMap((e) => state.episodes[e]?.scenes ?? []);
    const entry: RecentEntry = { root, name: state.project.name, openedAt: now, ...(prev?.pinned ? { pinned: true } : {}), episodes: state.project.episodes.length, scenes: scenes.length, ...(scenes[0] ? { thumbScene: scenes[0] } : {}) };
    this.write([entry, ...list.filter((e) => e.root !== root)]);
  }

  update(root: string, patch: Partial<Pick<RecentEntry, 'pinned' | 'name'>>): void {
    const list = this.list().map(({ exists: _e, ...r }) => r);
    const e = list.find((x) => x.root === root);
    if (!e) throw new FrameError('NOT_FOUND', `${root} is not in the recent projects list`);
    Object.assign(e, patch);
    if (patch.pinned === false) delete e.pinned;
    this.write(list);
  }

  forget(root: string): void {
    this.write(this.list().map(({ exists: _e, ...r }) => r).filter((e) => e.root !== root));
  }
}

/** Copies a project folder's current state and media to `dest` with a new project id (FR-PRJ-06 duplicate). */
export function duplicateProject(src: string, dest: string, o: { projectId: string; name: string }): ProjectStore {
  const from = new ProjectStore(path.resolve(src));
  const state = from.load().state;
  if (fs.existsSync(dest) && fs.readdirSync(dest).length) throw new FrameError('CONFLICT', `${dest} is not empty`, undefined, 'Choose a new folder name.');
  const copy: ProjectState = { ...state, project: { ...state.project, id: o.projectId as ProjectState['project']['id'], name: o.name } };
  const target = ProjectStore.create(dest, copy);
  for (const d of ['assets/media', 'assets/takes']) {
    const dir = path.join(from.root, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('.') || !fs.statSync(path.join(dir, f)).isFile()) continue;
      fs.copyFileSync(path.join(dir, f), path.join(target.root, d, f));
    }
  }
  return target;
}

/**
 * Moves a folder to the OS trash (FR-PRJ-06 delete; never a permanent delete). Linux: the freedesktop trash in
 * $XDG_DATA_HOME; macOS: ~/.Trash; Windows: the Recycle Bin via PowerShell. Returns where it went.
 */
export function moveToTrash(target: string, o: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform; now?: Date } = {}): string {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new FrameError('NOT_FOUND', `${abs} does not exist`);
  const env = o.env ?? process.env;
  const platform = o.platform ?? process.platform;
  const base = path.basename(abs);
  const unique = (dir: string) => {
    let name = base;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base} ${i}`;
    return name;
  };
  if (platform === 'win32') {
    const ps = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory('${abs.replace(/'/g, "''")}', 'OnlyErrorDialogs', 'SendToRecycleBin')`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
    if (r.status !== 0) throw new FrameError('IO_ERROR', `Could not move ${abs} to the Recycle Bin`);
    return 'Recycle Bin';
  }
  if (platform === 'darwin') {
    const trash = path.join(env.HOME ?? os.homedir(), '.Trash');
    fs.mkdirSync(trash, { recursive: true });
    const dest = path.join(trash, unique(trash));
    fs.renameSync(abs, dest);
    return dest;
  }
  const data = env.XDG_DATA_HOME || path.join(env.HOME ?? os.homedir(), '.local/share');
  const files = path.join(data, 'Trash/files');
  const info = path.join(data, 'Trash/info');
  fs.mkdirSync(files, { recursive: true });
  fs.mkdirSync(info, { recursive: true });
  const name = unique(files);
  const when = (o.now ?? new Date()).toISOString().slice(0, 19);
  fs.writeFileSync(path.join(info, `${name}.trashinfo`), `[Trash Info]\nPath=${encodeURI(abs)}\nDeletionDate=${when}\n`);
  try {
    fs.renameSync(abs, path.join(files, name));
  } catch (e) {
    fs.rmSync(path.join(info, `${name}.trashinfo`), { force: true });
    // Across file systems a rename fails: copy then remove keeps the delete recoverable.
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
    fs.cpSync(abs, path.join(files, name), { recursive: true });
    fs.writeFileSync(path.join(info, `${name}.trashinfo`), `[Trash Info]\nPath=${encodeURI(abs)}\nDeletionDate=${when}\n`);
    fs.rmSync(abs, { recursive: true, force: true });
  }
  return path.join(files, name);
}

/** Opens the OS file manager at a folder (FR-PRJ-06 reveal). The server and the person share a machine. */
export function revealInFileManager(target: string, platform: NodeJS.Platform = process.platform): void {
  const abs = path.resolve(target);
  const [cmd, args] = platform === 'darwin' ? ['open', ['-R', abs]] : platform === 'win32' ? ['explorer.exe', [`/select,${abs}`]] : ['xdg-open', [abs]];
  const r = spawnSync(cmd, args as string[], { stdio: 'ignore', timeout: 5000 });
  if (r.error || (r.status !== 0 && platform !== 'win32')) throw new FrameError('UNSUPPORTED', 'No file manager is available on the server machine', undefined, `The project is at ${abs}.`);
}
