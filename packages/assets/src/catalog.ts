/**
 * Loader for the machine-readable catalog source (`catalog/`), which is the authority for document 03 (CAT-07).
 * Runtime code uses it only as data; it never branches on specific IDs (FR-ARC-06).
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export interface CatalogItem {
  id: string;
  name: string;
  [detail: string]: string;
}

export interface CatalogList {
  list: string;
  order: number;
  part: string;
  title: string;
  prefix: string;
  columns: [string, string, string];
  detailKey: string;
  intro: string;
  items: CatalogItem[];
}

export interface CatalogDocument {
  header: string;
  parts: Record<string, string>;
  appendix: string;
}

export interface Catalog {
  document: CatalogDocument;
  lists: CatalogList[];
  byId: Map<string, { item: CatalogItem; list: CatalogList }>;
}

export function loadCatalog(catalogDir: string): Catalog {
  const document = YAML.parse(fs.readFileSync(path.join(catalogDir, 'document.yaml'), 'utf8')) as CatalogDocument;
  const files = fs.readdirSync(path.join(catalogDir, 'lists')).filter((f) => f.endsWith('.yaml')).sort();
  const lists = files.map((f) => YAML.parse(fs.readFileSync(path.join(catalogDir, 'lists', f), 'utf8')) as CatalogList);
  lists.sort((a, b) => a.order - b.order);
  const byId = new Map<string, { item: CatalogItem; list: CatalogList }>();
  for (const list of lists) {
    for (const item of list.items) {
      if (byId.has(item.id)) throw new Error(`Duplicate catalog ID ${item.id}`);
      if (!item.id.startsWith(`${list.prefix}.`)) throw new Error(`Catalog ID ${item.id} does not use prefix ${list.prefix}`);
      if (!/^[a-z0-9-]+\.[a-z0-9-]+$/.test(item.id)) throw new Error(`Catalog ID ${item.id} is not a lowercase dotted ID`);
      byId.set(item.id, { item, list });
    }
  }
  return { document, lists, byId };
}

/** Renders document 03 from the catalog source. */
export function renderCatalogMarkdown(cat: Catalog): string {
  const total = cat.lists.reduce((n, l) => n + l.items.length, 0);
  const out: string[] = [];
  out.push(cat.document.header.replace(/\n+$/, ''), '');
  out.push('## Summary', '', '| Part | List | Prefix | Items |', '|---|---|---|---|');
  for (const l of cat.lists) out.push(`| ${l.part} | ${l.list} ${l.title} | \`${l.prefix}\` | ${l.items.length} |`);
  out.push(`| | **Total** | | **${total}** |`, '');
  let part = '';
  for (const l of cat.lists) {
    if (l.part !== part) {
      part = l.part;
      out.push(`## ${part} ${cat.document.parts[part]}`, '');
    }
    out.push(`### ${l.list} ${l.title} (${l.items.length})`, '');
    if (l.intro) out.push(l.intro, '');
    out.push(`| ${l.columns.join(' | ')} |`, '|---|---|---|');
    for (const it of l.items) out.push(`| \`${it.id}\` | ${it.name} | ${it[l.detailKey] ?? ''} |`);
    out.push('');
  }
  out.push(cat.document.appendix.replace(/\n$/, ''));
  return out.join('\n') + '\n';
}
