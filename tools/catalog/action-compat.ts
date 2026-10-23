/**
 * Generates the action compatibility matrix (FR-AST-08, CAT-03): every bundled action × every character-attached
 * item, with the reasons for each incompatible pair. Writes content/action-compat.json (read by the server for asset
 * details) and docs/catalog/action-compat.md. Run: pnpm catalog:compat
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATTACHED_KINDS, actionCompatIssues } from '@frame/core';
import { bundledLibrary, loadStyles } from '@frame/assets/node';

export interface CompatMatrix {
  generated: string;
  actions: string[];
  items: string[];
  pairs: number;
  incompatible: { action: string; item: string; reasons: string[] }[];
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function matrixInputs() {
  const content = path.join(repo, 'content');
  const lib = bundledLibrary(content);
  const pc = (JSON.parse(fs.readFileSync(path.join(content, 'library.json'), 'utf8')).defaults as { previewCharacter: string }).previewCharacter;
  const actions = lib.search('', { kind: 'act', limit: 10000 }).map((h) => ({ ref: h.ref, manifest: h.manifest })).sort((a, b) => a.ref.localeCompare(b.ref));
  const items = ATTACHED_KINDS.flatMap((k) => lib.search('', { kind: k, limit: 10000 })).filter((h) => !h.manifest.tags.includes('draft')).map((h) => ({ ref: h.ref, manifest: h.manifest })).sort((a, b) => a.ref.localeCompare(b.ref));
  const opts = { lookup: (r: string) => lib.manifest(r), styles: loadStyles(content), previewCharacter: { ref: pc, manifest: lib.manifest(pc)! } };
  return { actions, items, opts };
}

export function matrixMarkdown(m: CompatMatrix): string {
  const pct = m.pairs ? (100 * m.incompatible.length) / m.pairs : 0;
  return [
    '# Action compatibility matrix (CAT-03)',
    '',
    `Generated ${m.generated} by \`pnpm catalog:compat\` — do not edit. Every bundled action × every character-attached item, performed in both style families, the three-quarter and side views and each posture the action supports; a pair is incompatible when its rigs differ or the action raises problems the item does not have at rest.`,
    '',
    `**${m.actions.length} actions × ${m.items.length} items = ${m.pairs} pairs · incompatible: ${m.incompatible.length} (${pct.toFixed(2)} %; limit 2 %)**`,
    '',
    ...(m.incompatible.length ? ['| Action | Item | Reasons |', '|---|---|---|', ...m.incompatible.map((x) => `| \`${x.action}\` | \`${x.item}\` | ${x.reasons.join('; ').replace(/\|/g, '\\|')} |`)] : ['Every pair is compatible.']),
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { actions, items, opts } = matrixInputs();
  const incompatible: CompatMatrix['incompatible'] = [];
  const t0 = Date.now();
  for (const [i, it] of items.entries()) {
    for (const a of actions) {
      const reasons = actionCompatIssues(it, a, opts);
      if (reasons.length) incompatible.push({ action: a.ref, item: it.ref, reasons });
    }
    if (i % 20 === 0) console.error(`${i}/${items.length} items · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  const m: CompatMatrix = { generated: new Date().toISOString().slice(0, 10), actions: actions.map((a) => a.ref), items: items.map((x) => x.ref), pairs: actions.length * items.length, incompatible };
  fs.writeFileSync(path.join(repo, 'content/action-compat.json'), JSON.stringify(m, null, 2) + '\n');
  fs.writeFileSync(path.join(repo, 'docs/catalog/action-compat.md'), matrixMarkdown(m));
  console.log(`${m.pairs} pairs, ${incompatible.length} incompatible`);
}
