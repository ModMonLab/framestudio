/**
 * The user library (FR-AST-01) and preferences (FR-AST-06): assets the user keeps across projects, in the profile
 * folder (`<dir>/<id>@<v>.json` + `<dir>/media/<hash>.<ext>`), plus favourites and named collections
 * (`<dir>/../prefs.json`). Versions are immutable: saving different content under an existing `id@version` is
 * refused. Projects never reference the user library directly at render time — using a user asset copies it (and
 * the media and non-bundled assets it needs) into the project, so projects stay self-contained (FR-DAT-06).
 */
import fs from 'node:fs';
import path from 'node:path';
import { refClosure, collectMedia, type Library } from '@frame/assets';
import { FrameError, type AssetManifest, type Command, type MediaRef } from '@frame/schema';
import { readJson, sha256, stableStringify, writeFileAtomic, writeJsonAtomic } from './fsutil.js';
import { manifestHash } from './package.js';
import type { OpenProject } from './project.js';

export interface Collection {
  id: string;
  name: string;
  /** Asset ids (any version). */
  items: string[];
}

export interface UserPrefs {
  schemaVersion: 1;
  favourites: string[];
  collections: Collection[];
}

const EMPTY: UserPrefs = { schemaVersion: 1, favourites: [], collections: [] };

export class UserLibrary {
  readonly dir: string;
  constructor(dir: string) {
    this.dir = path.resolve(dir);
  }

  private get prefsFile() {
    return path.join(path.dirname(this.dir), 'prefs.json');
  }

  prefs(): UserPrefs {
    try {
      const p = readJson<UserPrefs>(this.prefsFile);
      return { schemaVersion: 1, favourites: Array.isArray(p.favourites) ? p.favourites.filter((x) => typeof x === 'string') : [], collections: Array.isArray(p.collections) ? p.collections : [] };
    } catch {
      return { ...EMPTY };
    }
  }

  setPrefs(p: Omit<UserPrefs, 'schemaVersion'>): UserPrefs {
    const clean: UserPrefs = {
      schemaVersion: 1,
      favourites: [...new Set(p.favourites.filter((x) => typeof x === 'string' && x.length < 200))],
      collections: p.collections.map((c) => {
        if (!c.id || !c.name?.trim()) throw new FrameError('USAGE', 'Collections need an id and a name');
        return { id: String(c.id), name: c.name.trim().slice(0, 100), items: [...new Set((c.items ?? []).filter((x) => typeof x === 'string'))] };
      }),
    };
    if (new Set(clean.collections.map((c) => c.id)).size !== clean.collections.length) throw new FrameError('USAGE', 'Collection ids must be unique');
    writeJsonAtomic(this.prefsFile, clean);
    return clean;
  }

  mediaFile(hash: string): string | undefined {
    const dir = path.join(this.dir, 'media');
    if (!fs.existsSync(dir)) return undefined;
    const f = fs.readdirSync(dir).find((n) => n.startsWith(hash + '.'));
    return f ? path.join(dir, f) : undefined;
  }

  /**
   * Saves assets (with their non-bundled dependencies and media) from a project into the user library. Identical
   * versions are left as they are; different content under an existing version is refused.
   */
  saveFromProject(p: OpenProject, lib: Library, refs: string[]): { added: string[]; unchanged: string[] } {
    const { refs: all, missing } = refClosure(refs, (r) => lib.manifest(r), (r) => lib.get(r)?.source !== 'bundled');
    const absent = missing.filter((r) => refs.includes(r));
    if (absent.length) throw new FrameError('NOT_FOUND', `${absent.join(', ')} not found`);
    const out = { added: [] as string[], unchanged: [] as string[] };
    const writes: [string, AssetManifest][] = [];
    for (const ref of all) {
      const e = lib.get(ref)!;
      if (e.source === 'bundled') continue;
      if (!e.manifest.id.startsWith('user.')) continue;
      const file = path.join(this.dir, `${ref}.json`);
      if (fs.existsSync(file)) {
        const existing = readJson<AssetManifest>(file);
        if (manifestHash(existing) !== manifestHash(e.manifest)) throw new FrameError('CONFLICT', `${ref} already exists in your library with different content`, { ref }, 'Library versions are immutable; save a new version instead.');
        out.unchanged.push(ref);
        continue;
      }
      for (const m of collectMedia(e.manifest).values()) {
        const src = p.store.findMedia(m.hash);
        if (!src) throw new FrameError('NOT_FOUND', `Media ${m.hash} of ${ref} is missing from the project`);
        const dst = path.join(this.dir, 'media', `${m.hash}.${m.ext}`);
        if (!fs.existsSync(dst)) writeFileAtomic(dst, fs.readFileSync(src));
      }
      writes.push([file, e.manifest]);
      out.added.push(ref);
    }
    for (const [file, m] of writes) writeJsonAtomic(file, m);
    return out;
  }

  /**
   * Commands (and media copies) that bring user-library assets into a project as project-local assets so the project
   * renders and packages without the user library. Assets already in the project are skipped.
   */
  adoptCommands(p: OpenProject, lib: Library, refs: string[]): Command[] {
    const { refs: all } = refClosure(refs, (r) => lib.manifest(r), (r) => lib.get(r)?.source === 'user');
    const cmds: Command[] = [];
    for (const ref of all) {
      const e = lib.get(ref);
      if (!e || e.source !== 'user' || p.state.assets[ref]) continue;
      for (const m of collectMedia(e.manifest).values()) {
        if (p.store.findMedia(m.hash)) continue;
        const f = this.mediaFile(m.hash);
        if (!f) throw new FrameError('NOT_FOUND', `Media ${m.hash} of ${ref} is missing from your library`);
        const bytes = fs.readFileSync(f);
        if (sha256(bytes) !== m.hash) throw new FrameError('VALIDATION_FAILED', `Media ${m.hash} in your library does not match its hash`);
        p.store.putMedia(bytes, { ...(m as MediaRef) });
      }
      cmds.push({ name: 'asset.addLocal', params: { manifest: JSON.parse(stableStringify(e.manifest)) as unknown } });
    }
    return cmds;
  }
}
