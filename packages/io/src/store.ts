import fs from 'node:fs';
import path from 'node:path';
import {
  AssetManifest, CURRENT_SCHEMA_VERSION, Episode, FrameError, issues, Locks, migrate, Project, Scene, Take,
  type FileKind, type MediaRef, type Problem, type TSchema,
} from '@frame/schema';
import { allEntityKeys, applyDeltaInPlace, entityValue, type ProjectState } from '@frame/core';
import { appendLineDurable, readJson, sha256, sha256File, stableStringify, writeFileAtomic, writeJsonAtomic } from './fsutil.js';

export const PROJECT_FILE = 'project.json';

export interface JournalEntry {
  revision: number;
  at: string;
  label: string;
  source: string;
  commands: unknown[];
  /** Post-commit content of every changed entity (null = deleted). Replaying is idempotent. */
  entities: Record<string, unknown>;
}

export interface LoadOptions {
  /** Write migrated files back to disk (the user or `--yes` confirmed; FR-DAT-05). */
  writeMigrations?: boolean;
  /** Read only the entity files: unsaved journaled commits are not replayed (choosing the disk version, FR-PER-05). */
  skipJournal?: boolean;
}

export interface LoadResult {
  state: ProjectState;
  revision: number;
  problems: Problem[];
  /** Files that were migrated in memory (and written back if confirmed). */
  migrated: string[];
  /** Journal entries replayed after an unclean shutdown (FR-PER-04). */
  recovered: number;
}

export interface VersionInfo {
  id: string;
  name: string;
  createdAt: string;
  revision: number;
}

const kindSchema: Record<FileKind, TSchema> = { project: Project, episode: Episode, scene: Scene, take: Take, asset: AssetManifest, locks: Locks };

/** True if the folder looks like a Frame project. */
export function isProjectFolder(dir: string): boolean {
  return fs.existsSync(path.join(dir, PROJECT_FILE));
}

/**
 * The project folder on disk (SRS §3.2) — the source of truth (FR-ARC-01).
 * Commits are journaled durably first; entity files are then written atomically with stable key order.
 */
export class ProjectStore {
  readonly root: string;
  /** entity key → relative path last written/read, to remove stale files after moves and deletions. */
  private paths = new Map<string, string>();
  /** relative path → content hash last written or read, to detect external changes (FR-PER-05). */
  private known = new Map<string, string>();

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /* ---------------------------------------------------------------- paths */

  private abs(rel: string): string {
    return path.join(this.root, rel);
  }

  entityPath(state: ProjectState, key: string): string | undefined {
    const [kind, ...rest] = key.split('/');
    const id = rest.join('/');
    switch (kind) {
      case 'project':
        return PROJECT_FILE;
      case 'locks':
        return 'locks/assets.json';
      case 'episodes':
        return `episodes/${id}/episode.json`;
      case 'scenes': {
        const ep = state.sceneEpisode[id];
        return ep ? `episodes/${ep}/scenes/${id}.json` : undefined;
      }
      case 'takes':
        return `assets/takes/${id}.json`;
      case 'assets':
        return `assets/local/${id}.json`;
      default:
        return undefined;
    }
  }

  private entityValue(state: ProjectState, key: string): unknown {
    return entityValue(state, key);
  }

  allEntityKeys(state: ProjectState): string[] {
    return allEntityKeys(state);
  }

  /** Expand engine change keys (including sceneEpisode moves) into entity keys. */
  expandChanged(changed: string[]): string[] {
    const out = new Set<string>();
    for (const c of changed) {
      if (c === '*') return ['*'];
      if (c.startsWith('sceneEpisode/')) out.add('scenes/' + c.slice('sceneEpisode/'.length));
      else if (c === 'sceneEpisode') return ['*'];
      else out.add(c);
    }
    return [...out];
  }

  /* ---------------------------------------------------------------- create / load */

  static create(root: string, state: ProjectState): ProjectStore {
    const abs = path.resolve(root);
    if (fs.existsSync(path.join(abs, PROJECT_FILE))) {
      throw new FrameError('CONFLICT', `A project already exists at ${abs}`);
    }
    fs.mkdirSync(abs, { recursive: true });
    for (const d of ['episodes', 'cast', 'assets/media', 'assets/takes', 'assets/local', 'locks', 'history', 'renders', 'versions']) {
      fs.mkdirSync(path.join(abs, d), { recursive: true });
    }
    const store = new ProjectStore(abs);
    store.save(state, 0, ['*']);
    return store;
  }

  load(opts: LoadOptions = {}): LoadResult {
    if (!isProjectFolder(this.root)) {
      throw new FrameError('NOT_FOUND', `No Frame project at ${this.root}`, undefined, 'Choose a folder containing project.json.');
    }
    const problems: Problem[] = [];
    const missing = new Map<Problem, string>();
    const migrated: string[] = [];
    this.paths.clear();
    this.known.clear();

    const read = <T>(rel: string, kind: FileKind): T | undefined => {
      const file = this.abs(rel);
      let raw: string;
      try {
        raw = fs.readFileSync(file, 'utf8');
      } catch {
        const pr: Problem = { severity: 'error', code: 'MISSING_FILE', message: `${rel} is missing`, blocksExport: true };
        problems.push(pr);
        missing.set(pr, rel);
        return undefined;
      }
      let doc: Record<string, unknown>;
      try {
        doc = JSON.parse(raw);
      } catch (e) {
        problems.push({ severity: 'error', code: 'INVALID_JSON', message: `${rel} is not valid JSON: ${(e as Error).message}`, blocksExport: true });
        return undefined;
      }
      const m = migrate(kind, doc);
      if (m.migrated) {
        migrated.push(rel);
        if (opts.writeMigrations) writeJsonAtomic(file, m.doc);
      }
      for (const i of issues(kindSchema[kind], m.doc, 10)) {
        problems.push({ severity: 'error', code: 'SCHEMA', message: `${rel} ${i.path}: ${i.message}`, blocksExport: true });
      }
      this.known.set(rel, sha256(raw));
      return m.doc as T;
    };

    const project = read<Project>(PROJECT_FILE, 'project');
    if (!project) throw new FrameError('VALIDATION_FAILED', 'project.json could not be read', { problems });
    this.paths.set('project', PROJECT_FILE);

    const state: ProjectState = {
      project, episodes: {}, sceneEpisode: {}, scenes: {}, takes: {}, assets: {},
      locks: { schemaVersion: CURRENT_SCHEMA_VERSION, assets: {} },
    };
    const locksRel = 'locks/assets.json';
    if (fs.existsSync(this.abs(locksRel))) {
      const l = read<ProjectState['locks']>(locksRel, 'locks');
      if (l) state.locks = l;
    }
    this.paths.set('locks', locksRel);

    for (const epId of project.episodes) {
      const rel = `episodes/${epId}/episode.json`;
      const ep = read<Episode>(rel, 'episode');
      if (!ep) continue;
      state.episodes[epId] = ep;
      this.paths.set(`episodes/${epId}`, rel);
      for (const sid of ep.scenes) {
        const srel = `episodes/${epId}/scenes/${sid}.json`;
        const sc = read<Scene>(srel, 'scene');
        if (!sc) continue;
        state.scenes[sid] = sc;
        state.sceneEpisode[sid] = epId;
        this.paths.set(`scenes/${sid}`, srel);
      }
    }
    for (const f of listJson(this.abs('assets/takes'))) {
      const rel = `assets/takes/${f}`;
      const t = read<Take>(rel, 'take');
      if (t) {
        state.takes[t.id] = t;
        this.paths.set(`takes/${t.id}`, rel);
      }
    }
    for (const f of listJson(this.abs('assets/local'))) {
      const rel = `assets/local/${f}`;
      const a = read<ProjectState['assets'][string]>(rel, 'asset');
      if (a) {
        const ref = `${a.id}@${a.version}`;
        state.assets[ref] = a;
        this.paths.set(`assets/${ref}`, rel);
      }
    }

    // Crash recovery: replay journaled commits newer than the last checkpoint (FR-PER-04, NFR-08).
    const saved = this.savedRevision();
    let revision = saved;
    let recovered = 0;
    for (const entry of opts.skipJournal ? [] : this.readJournal()) {
      if (entry.revision <= saved) continue;
      applyDeltaInPlace(state, entry.entities);
      revision = entry.revision;
      recovered++;
    }
    if (recovered > 0) {
      problems.push({ severity: 'info', code: 'RECOVERED', message: `Recovered ${recovered} change(s) that were not yet saved when Frame stopped`, blocksExport: false });
      this.save(state, revision, ['*']);
      // A crash between writing an episode and its scene leaves a dangling reference that the journal repairs;
      // only report files that are still missing after recovery.
      for (const [pr, rel] of missing) if (fs.existsSync(this.abs(rel))) problems.splice(problems.indexOf(pr), 1);
    }
    return { state, revision, problems, migrated, recovered };
  }

  /* ---------------------------------------------------------------- save */

  /** Durably records a commit before files are written (the commit point). */
  journal(state: ProjectState, entry: Omit<JournalEntry, 'entities'>, changed: string[]): void {
    const keys = this.expandChanged(changed);
    const all = keys[0] === '*' ? this.allEntityKeys(state).concat([...this.paths.keys()]) : keys;
    const entities: Record<string, unknown> = {};
    for (const k of new Set(all)) {
      const v = this.entityValue(state, k);
      entities[k] = v;
      if (k.startsWith('scenes/') && v) entities[`sceneEpisode/${k.slice(7)}`] = state.sceneEpisode[k.slice(7)];
    }
    appendLineDurable(this.abs('history/journal.jsonl'), JSON.stringify({ ...entry, entities }));
    appendLineDurable(this.abs('history/commands.jsonl'), JSON.stringify({ revision: entry.revision, at: entry.at, label: entry.label, source: entry.source, commands: entry.commands }));
  }

  /**
   * Writes changed entity files atomically and removes stale ones, then checkpoints the revision
   * and clears the journal (FR-PER-01, FR-DAT-08).
   */
  save(state: ProjectState, revision: number, changed: string[]): void {
    const keys = this.expandChanged(changed);
    const targets = keys[0] === '*' ? new Set([...this.allEntityKeys(state), ...this.paths.keys()]) : new Set(keys);
    // Episodes must exist before scenes are written into them; write project.json last so a partial save never lists missing episodes.
    const ordered = [...targets].sort((a, b) => rank(a) - rank(b));
    for (const key of ordered) {
      const value = this.entityValue(state, key);
      const rel = value === null ? undefined : this.entityPath(state, key);
      const prev = this.paths.get(key);
      if (rel) {
        const text = stableStringify(value);
        writeFileAtomic(this.abs(rel), text);
        this.known.set(rel, sha256(text));
        this.paths.set(key, rel);
      }
      if (prev && prev !== rel) {
        fs.rmSync(this.abs(prev), { force: true });
        this.known.delete(prev);
        if (!rel) this.paths.delete(key);
        removeEmptyDirs(path.dirname(this.abs(prev)), this.root);
      }
    }
    writeJsonAtomic(this.abs('history/state.json'), { revision, savedAt: new Date().toISOString() });
    fs.rmSync(this.abs('history/journal.jsonl'), { force: true });
  }

  savedRevision(): number {
    try {
      return readJson<{ revision: number }>(this.abs('history/state.json')).revision;
    } catch {
      return 0;
    }
  }

  readJournal(): JournalEntry[] {
    const file = this.abs('history/journal.jsonl');
    if (!fs.existsSync(file)) return [];
    const out: JournalEntry[] = [];
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as JournalEntry);
      } catch {
        // A torn final line from a crash mid-append is ignored: that commit never completed.
        break;
      }
    }
    return out;
  }

  /** Command history log (FR-CLI-05 `history`). */
  readHistory(): { revision: number; at: string; label: string; source: string; commands: unknown[] }[] {
    const file = this.abs('history/commands.jsonl');
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
  }

  /* ---------------------------------------------------------------- external changes (FR-PER-05) */

  /** Files whose content on disk differs from what Frame last read or wrote. */
  externalChanges(): string[] {
    const changed: string[] = [];
    for (const [rel, hash] of this.known) {
      const file = this.abs(rel);
      if (!fs.existsSync(file)) changed.push(rel);
      else if (sha256(fs.readFileSync(file)) !== hash) changed.push(rel);
    }
    for (const rel of walkJson(this.root, ['episodes', 'assets/takes', 'assets/local'])) if (!this.known.has(rel)) changed.push(rel);
    return changed;
  }

  /* ---------------------------------------------------------------- media (FR-DAT-07) */

  mediaRel(hash: string, ext: string): string {
    return `assets/media/${hash}.${ext}`;
  }

  /** Stores bytes content-addressed; identical media is stored once. */
  putMedia(data: Uint8Array, meta: { ext: string; mime: string } & Partial<MediaRef>): MediaRef {
    const hash = sha256(data);
    const rel = this.mediaRel(hash, meta.ext);
    if (!fs.existsSync(this.abs(rel))) writeFileAtomic(this.abs(rel), data);
    return { ...meta, hash, bytes: data.byteLength } as MediaRef;
  }

  /** Imports a file by streaming hash + copy. */
  putMediaFile(file: string, meta: { ext: string; mime: string } & Partial<MediaRef>): MediaRef {
    const hash = sha256File(file);
    const rel = this.mediaRel(hash, meta.ext);
    if (!fs.existsSync(this.abs(rel))) {
      fs.mkdirSync(path.dirname(this.abs(rel)), { recursive: true });
      const tmp = this.abs(rel) + '.tmp';
      fs.copyFileSync(file, tmp);
      fs.renameSync(tmp, this.abs(rel));
    }
    return { ...meta, hash, bytes: fs.statSync(file).size } as MediaRef;
  }

  findMedia(hash: string): string | undefined {
    const dir = this.abs('assets/media');
    if (!fs.existsSync(dir)) return undefined;
    const f = fs.readdirSync(dir).find((n) => n.startsWith(hash + '.'));
    return f ? path.join(dir, f) : undefined;
  }

  /** Present and hash-verified (FR-RND-08 hash mismatches block export). */
  verifyMedia(hash: string): boolean {
    const f = this.findMedia(hash);
    return f !== undefined && sha256File(f) === hash;
  }

  /* ---------------------------------------------------------------- versions (FR-PER-03) */

  saveVersion(state: ProjectState, revision: number, name: string, id: string, now = new Date().toISOString()): VersionInfo {
    const dir = this.abs(`versions/${id}`);
    if (fs.existsSync(dir)) throw new FrameError('CONFLICT', `Version ${id} exists`);
    const snapshot = new ProjectStore(dir);
    fs.mkdirSync(dir, { recursive: true });
    snapshot.save(state, revision, ['*']);
    const info: VersionInfo = { id, name, createdAt: now, revision };
    writeJsonAtomic(path.join(dir, 'version.json'), info);
    return info;
  }

  listVersions(): VersionInfo[] {
    const dir = this.abs('versions');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'version.json')))
      .map((d) => readJson<VersionInfo>(path.join(dir, d, 'version.json')))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Opens a saved version as a separate project (FR-PER-03 "open as a copy"): a new folder with a new project id and
   * name, holding the version's files and the media they use.
   */
  copyVersionTo(id: string, dir: string, o: { projectId: string; name: string }): ProjectStore {
    const state = this.loadVersion(id);
    const copy: ProjectState = { ...state, project: { ...state.project, id: o.projectId as ProjectState['project']['id'], name: o.name } };
    const target = ProjectStore.create(dir, copy);
    const media = this.abs('assets/media');
    if (fs.existsSync(media)) {
      for (const f of fs.readdirSync(media)) {
        if (f.startsWith('.')) continue;
        fs.copyFileSync(path.join(media, f), path.join(target.root, 'assets/media', f));
      }
    }
    return target;
  }

  loadVersion(id: string): ProjectState {
    const dir = this.abs(`versions/${id}`);
    if (!fs.existsSync(path.join(dir, 'version.json'))) throw new FrameError('NOT_FOUND', `Version ${id} not found`);
    return new ProjectStore(dir).load().state;
  }
}

function rank(key: string): number {
  if (key.startsWith('episodes/')) return 0;
  if (key.startsWith('scenes/')) return 1;
  if (key === 'project') return 9;
  return 2;
}


function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('.')).sort();
}

function walkJson(root: string, subdirs: string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (e.name.endsWith('.json') && !e.name.startsWith('.')) out.push(r);
    }
  };
  subdirs.forEach(walk);
  return out;
}

function removeEmptyDirs(dir: string, stop: string): void {
  let d = dir;
  while (d.startsWith(stop) && d !== stop) {
    try {
      if (fs.readdirSync(d).length > 0) return;
      fs.rmdirSync(d);
    } catch {
      return;
    }
    d = path.dirname(d);
  }
}
