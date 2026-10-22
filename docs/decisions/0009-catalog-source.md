# 0009 — Catalog source

`catalog/document.yaml` (header, part titles, appendix) and `catalog/lists/NN-<list>-<prefix>.yaml` (one per Catalog list: code, title, prefix, columns, intro, items with `id`, `name` and the list's detail column under a semantic key such as `group`, `notes`, `kit`). Converted once from document 03; from now on the YAML is the authority (Catalog appendix). `pnpm catalog:doc` regenerates `docs/spec/03-CATALOG.md`; `packages/assets/test/catalog.test.ts` fails CI if the document drifts and checks 53 lists / 1 254 unique, prefix-consistent IDs.
Per-item content status (families, views, validator, previews, review, licence) lives in each item's asset manifest under `content/`, and the CAT-10 coverage report is generated from manifests joined to this source.
