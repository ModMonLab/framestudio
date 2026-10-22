# 0001 — Monorepo and toolchain

**Context.** SRS §2.2 lists the packages; §2.3 recommends TypeScript strict and Vitest.

**Decision.**
- pnpm 10 workspaces (`packages/*`, `apps/*`), Node 22 LTS.
- TypeScript 5.9.3 (`strict`, `noUncheckedIndexedAccess`), one root `tsconfig.json` type-checking all packages with `noEmit`.
  TypeScript 7 (native) was available but skipped: the ecosystem tooling in use (typescript-eslint, Vite plugins) targets the 5.x API.
- Packages export their TypeScript source (`exports: ./src/index.ts`); Node runs it through `tsx` (`node --import tsx`), the browser through Vite. A bundling step for distribution is added in M6.
- Vitest 3 for unit/integration tests; ESLint 9 + typescript-eslint.

**Consequences.** No build orchestration needed during development; CI runs `pnpm typecheck && pnpm lint && pnpm test` on Linux, Windows and macOS (NFR-15).
Note: spawning the `tsx` CLI wraps a second node process; tests that kill processes must spawn `node --import tsx` directly (found in the NFR-08 test).
