/** Regenerates docs/spec/03-CATALOG.md from catalog/ (CAT-07). Run: pnpm catalog:doc */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, renderCatalogMarkdown } from '@frame/assets/catalog';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const md = renderCatalogMarkdown(loadCatalog(path.join(repo, 'catalog')));
fs.writeFileSync(path.join(repo, 'docs/spec/03-CATALOG.md'), md);
console.log('wrote docs/spec/03-CATALOG.md');
