# 0002 — Schemas with TypeBox

**Decision.** `@sinclair/typebox` 0.34.41 (MIT) defines every file format and payload once; it yields both TypeScript types (`Static<>`) and JSON Schema (draft 2020-12 compatible objects). Validation uses TypeBox's own `TypeCompiler` (no Ajv dependency). `frame schema <type>` prints the schema with `$schema`/`$id`.

**Verified.** Compiled checks and error iteration (`TypeCompiler.Compile(schema).Errors(value)`) used in `@frame/schema/src/validate.ts`; tests exercise them.

**Alternatives.** Zod + zod-to-json-schema (two sources of truth for JSON Schema output); hand-written JSON Schema + Ajv (no types).
