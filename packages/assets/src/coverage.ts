/**
 * Catalog coverage report (CAT-10): for every catalog ID — families present, views present, validator status,
 * previews, review status and licence. Release requires 100 % green; the report is generated, never hand-edited.
 */
import { AssetManifest, issues } from '@frame/schema';
import type { AssetManifest as Manifest } from '@frame/schema';
import type { Catalog } from './catalog.js';

/** Kinds whose items are artwork drawn in both families (Catalog §0 rule 1). */
const FAMILY_KINDS = new Set(['body', 'head', 'eyes', 'brow', 'nose', 'mouth', 'ears', 'hair', 'fringe', 'facial-hair', 'skin', 'skin-detail', 'makeup', 'hand', 'feet', 'mouthshape', 'identity', 'top', 'outer', 'bottom', 'dress', 'shoe', 'pattern', 'look', 'acc', 'chr', 'exp', 'overlay', 'act', 'prop', 'kit', 'set', 'layer', 'atmo', 'fx', 'tr', 'txt', 'tpl']);
/** Kinds that must exist in all four views or declare an exemption (Catalog §0 rule 2). */
const VIEW_KINDS = new Set(['body', 'head', 'eyes', 'brow', 'nose', 'mouth', 'ears', 'hair', 'fringe', 'facial-hair', 'skin-detail', 'makeup', 'hand', 'feet', 'mouthshape', 'identity', 'top', 'outer', 'bottom', 'dress', 'shoe', 'look', 'acc', 'chr', 'exp', 'overlay', 'act']);
/** Character-attached kinds that must pass the rig check (Catalog §0 rule 3, FR-AST-08). */
const RIG_KINDS = new Set(['body', 'head', 'eyes', 'brow', 'nose', 'mouth', 'ears', 'hair', 'fringe', 'facial-hair', 'skin-detail', 'makeup', 'hand', 'feet', 'mouthshape', 'identity', 'top', 'outer', 'bottom', 'dress', 'shoe', 'acc', 'overlay']);
const VIEWS = ['front', 'three', 'side', 'back'] as const;

export type Check = 'ok' | 'missing' | 'n/a' | 'pending' | 'invalid' | 'not run';

export interface CoverageRow {
  id: string;
  list: string;
  name: string;
  manifest: Check;
  families: Check;
  familiesPresent: string[];
  views: Check;
  viewsPresent: string[];
  validator: Check;
  previews: Check;
  review: Check;
  licence: Check;
  green: boolean;
}

export interface CoverageReport {
  generatedAt: string;
  total: number;
  green: number;
  withManifest: number;
  lists: { list: string; title: string; prefix: string; total: number; withManifest: number; green: number }[];
  rows: CoverageRow[];
}

export function coverage(cat: Catalog, manifestOf: (id: string) => Manifest | undefined, rigCheck?: (m: Manifest) => boolean | undefined, now = new Date().toISOString()): CoverageReport {
  const rows: CoverageRow[] = [];
  const lists: CoverageReport['lists'] = [];
  for (const list of cat.lists) {
    let withManifest = 0;
    let green = 0;
    for (const item of list.items) {
      const m = manifestOf(item.id);
      const kind = list.prefix;
      const row: CoverageRow = { id: item.id, list: list.list, name: item.name, manifest: 'missing', families: 'missing', familiesPresent: [], views: 'missing', viewsPresent: [], validator: 'not run', previews: 'missing', review: 'missing', licence: 'missing', green: false };
      if (m) {
        withManifest++;
        row.manifest = 'ok';
        row.familiesPresent = [...m.families];
        row.viewsPresent = [...m.views];
        row.families = !FAMILY_KINDS.has(kind) ? 'n/a' : m.families.includes('flat') && m.families.includes('illustrated') ? 'ok' : 'missing';
        row.views = !VIEW_KINDS.has(kind) ? 'n/a' : VIEWS.every((v) => m.views.includes(v) || m.viewExemptions[v]) ? 'ok' : 'missing';
        const schemaOk = issues(AssetManifest, m, 1).length === 0;
        const rig = RIG_KINDS.has(kind) ? rigCheck?.(m) : true;
        row.validator = !schemaOk ? 'invalid' : rig === undefined ? 'not run' : rig ? 'ok' : 'invalid';
        const previews = m.previews as { flat?: unknown; illustrated?: unknown } | undefined;
        row.previews = !FAMILY_KINDS.has(kind) ? 'n/a' : previews?.flat && previews.illustrated ? 'ok' : 'missing';
        row.review = m.review?.status === 'approved' ? 'ok' : 'pending';
        row.licence = m.license.redistributable && m.license.commercialUse && m.provenance?.author ? 'ok' : 'invalid';
        row.green = [row.families, row.views, row.validator, row.previews, row.review, row.licence].every((c) => c === 'ok' || c === 'n/a');
      }
      if (row.green) green++;
      rows.push(row);
    }
    lists.push({ list: list.list, title: list.title, prefix: list.prefix, total: list.items.length, withManifest, green });
  }
  return { generatedAt: now, total: rows.length, green: rows.filter((r) => r.green).length, withManifest: rows.filter((r) => r.manifest === 'ok').length, lists, rows };
}

export function coverageMarkdown(r: CoverageReport): string {
  const pct = (a: number, b: number) => `${b ? Math.round((a / b) * 1000) / 10 : 0} %`;
  const L: string[] = [];
  L.push('# Catalog coverage report (CAT-10)', '');
  L.push(`Generated ${r.generatedAt} by \`pnpm catalog:coverage\` — do not edit. Release requires 100 % green.`, '');
  L.push(`**Green: ${r.green} / ${r.total} (${pct(r.green, r.total)})** · manifests present: ${r.withManifest} / ${r.total} (${pct(r.withManifest, r.total)})`, '');
  L.push('An item is green when it has a manifest, both families and all four views (or documented exemptions) where they apply, passes the validators (schema and, for character-attached items, the rig check), has previews in both families, is approved in visual review (CAT-06) and carries a redistributable, commercial-use licence with provenance.', '');
  L.push('| List | Prefix | Items | Manifests | Green |', '|---|---|---|---|---|');
  for (const l of r.lists) L.push(`| ${l.list} ${l.title} | \`${l.prefix}\` | ${l.total} | ${l.withManifest} | ${l.green} |`);
  L.push('', '## Items', '', '| ID | Families | Views | Validator | Previews | Review | Licence |', '|---|---|---|---|---|---|---|');
  for (const x of r.rows) {
    if (x.manifest === 'missing') L.push(`| \`${x.id}\` | — | — | — | — | — | — (no manifest) |`);
    else L.push(`| \`${x.id}\` | ${x.families === 'n/a' ? 'n/a' : `${x.families} (${x.familiesPresent.join(', ') || '—'})`} | ${x.views === 'n/a' ? 'n/a' : `${x.views} (${x.viewsPresent.length})`} | ${x.validator} | ${x.previews} | ${x.review} | ${x.licence} |`);
  }
  return L.join('\n') + '\n';
}
