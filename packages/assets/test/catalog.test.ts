import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, renderCatalogMarkdown } from '../src/catalog.js';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

describe('catalog source (CAT-01, CAT-07)', () => {
  const cat = loadCatalog(path.join(repo, 'catalog'));
  it('has 53 lists and 1254 unique items', () => {
    expect(cat.lists).toHaveLength(53);
    expect(cat.byId.size).toBe(1254);
  });
  it('document 03 is generated from the catalog source (no drift)', () => {
    const doc = fs.readFileSync(path.join(repo, 'docs/spec/03-CATALOG.md'), 'utf8');
    expect(renderCatalogMarkdown(cat)).toBe(doc);
  });
});
