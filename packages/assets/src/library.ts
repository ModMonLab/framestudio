/**
 * Asset library index (FR-AST-01..05): bundled, user, project-local and imported sources; every asset is addressed
 * by `id@version`, versions are immutable, invalid manifests are reported and excluded.
 */
import { AssetManifest, issues, type AssetManifest as Manifest, type View, type StyleFamily } from '@frame/schema';

export type AssetSource = 'bundled' | 'user' | 'project' | 'imported';

export interface LibraryEntry {
  manifest: Manifest;
  source: AssetSource;
  /** File the manifest came from (for diagnostics). */
  file?: string;
}

export interface LibraryProblem {
  file: string;
  message: string;
}

export interface SearchFilters {
  kind?: string | string[];
  family?: StyleFamily;
  view?: View;
  source?: AssetSource;
  tags?: string[];
  /** Restrict to entries for which this predicate is true (compatibility with the selection). */
  compatible?: (m: Manifest) => true | string;
  limit?: number;
}

export interface SearchHit {
  ref: string;
  manifest: Manifest;
  source: AssetSource;
  score: number;
  /** Reason when incompatible (shown but disabled, P11). */
  incompatible?: string;
}

export const refOf = (m: Pick<Manifest, 'id' | 'version'>) => `${m.id}@${m.version}`;

export function parseRef(ref: string): { id: string; version: number } {
  const i = ref.lastIndexOf('@');
  return i < 0 ? { id: ref, version: NaN } : { id: ref.slice(0, i), version: Number(ref.slice(i + 1)) };
}

/** Parses simple search filters: `type:expression style:illustrated view:side` (Design System §5.4). */
export function parseQuery(q: string): { text: string; filters: Partial<Record<'type' | 'style' | 'view' | 'source' | 'tag', string>> } {
  const filters: Record<string, string> = {};
  const text = q
    .replace(/\b(type|style|view|source|tag):(\S+)/gi, (_m, k: string, v: string) => {
      filters[k.toLowerCase()] = v.toLowerCase();
      return ' ';
    })
    .trim()
    .toLowerCase();
  return { text, filters };
}

export class Library {
  private entries = new Map<string, LibraryEntry>();
  private latest = new Map<string, number>();
  readonly problems: LibraryProblem[] = [];

  /** Adds a manifest after validating it; refuses to replace an existing id@version with different content (FR-DAT-11). */
  add(manifest: unknown, source: AssetSource, file = '(memory)'): LibraryEntry | undefined {
    const iss = issues(AssetManifest, manifest, 5);
    if (iss.length) {
      this.problems.push({ file, message: iss.map((i) => `${i.path}: ${i.message}`).join('; ') });
      return undefined;
    }
    const m = manifest as Manifest;
    const ref = refOf(m);
    const existing = this.entries.get(ref);
    if (existing && JSON.stringify(existing.manifest) !== JSON.stringify(m)) {
      this.problems.push({ file, message: `${ref} already exists with different content (from ${existing.source}); not replaced` });
      return undefined;
    }
    const entry: LibraryEntry = { manifest: m, source, file };
    this.entries.set(ref, entry);
    if (!((this.latest.get(m.id) ?? 0) >= m.version)) this.latest.set(m.id, m.version);
    return entry;
  }

  remove(ref: string): void {
    const e = this.entries.get(ref);
    if (!e) return;
    this.entries.delete(ref);
    const versions = [...this.entries.values()].filter((x) => x.manifest.id === e.manifest.id).map((x) => x.manifest.version);
    if (versions.length) this.latest.set(e.manifest.id, Math.max(...versions));
    else this.latest.delete(e.manifest.id);
  }

  has(ref: string): boolean {
    return this.entries.has(ref);
  }

  get(ref: string): LibraryEntry | undefined {
    return this.entries.get(ref);
  }

  manifest(ref: string): Manifest | undefined {
    return this.entries.get(ref)?.manifest;
  }

  /** Latest version of an id (for "update usages", FR-AST-05). */
  latestRef(id: string): string | undefined {
    const v = this.latest.get(id);
    return v ? `${id}@${v}` : undefined;
  }

  versions(id: string): Manifest[] {
    return [...this.entries.values()].filter((e) => e.manifest.id === id).map((e) => e.manifest).sort((a, b) => a.version - b.version);
  }

  all(): LibraryEntry[] {
    return [...this.entries.values()];
  }

  byKind(kind: string): LibraryEntry[] {
    return this.all().filter((e) => e.manifest.kind === kind);
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Search across names, tags, synonyms and values (FR-AST-03). Only the latest version of each id is returned.
   * Incompatible items are returned with a reason unless `compatible` filtering is strict.
   */
  search(query: string, f: SearchFilters = {}): SearchHit[] {
    const { text, filters } = parseQuery(query);
    const kinds = f.kind ? (Array.isArray(f.kind) ? f.kind : [f.kind]) : filters.type ? [filters.type] : undefined;
    const family = f.family ?? (filters.style as StyleFamily | undefined);
    const view = f.view ?? (filters.view as View | undefined);
    const source = f.source ?? (filters.source as AssetSource | undefined);
    const tags = [...(f.tags ?? []), ...(filters.tag ? [filters.tag] : [])];
    const words = text.split(/\s+/).filter(Boolean);
    const hits: SearchHit[] = [];
    for (const e of this.entries.values()) {
      const m = e.manifest;
      if (this.latest.get(m.id) !== m.version) continue;
      if (kinds && !kinds.some((k) => m.kind === k || m.category.toLowerCase() === k || m.kind.startsWith(k))) continue;
      if (family && m.families.length && !m.families.includes(family)) continue;
      if (view && m.views.length && !m.views.includes(view)) continue;
      if (source && e.source !== source) continue;
      if (tags.length && !tags.every((t) => m.tags.includes(t))) continue;
      let score = 0;
      if (words.length) {
        const name = m.name.toLowerCase();
        const hay = [m.id, m.category, m.group ?? '', ...m.tags, ...m.synonyms].join(' ').toLowerCase();
        let ok = true;
        for (const w of words) {
          if (name.startsWith(w)) score += 10;
          else if (name.includes(w)) score += 6;
          else if (hay.includes(w)) score += 2;
          else ok = false;
        }
        if (!ok) continue;
      }
      const compat = f.compatible?.(m);
      hits.push({ ref: refOf(m), manifest: m, source: e.source, score, ...(compat && compat !== true ? { incompatible: compat } : {}) });
    }
    hits.sort((a, b) => b.score - a.score || a.manifest.category.localeCompare(b.manifest.category) || a.manifest.name.localeCompare(b.manifest.name));
    return f.limit ? hits.slice(0, f.limit) : hits;
  }

  /** Category → count of latest versions (library browser groups, Design System §5.3). */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries.values()) {
      if (this.latest.get(e.manifest.id) !== e.manifest.version) continue;
      out[e.manifest.category] = (out[e.manifest.category] ?? 0) + 1;
    }
    return out;
  }
}
