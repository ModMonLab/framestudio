# 0017 — Packages: fflate zip, declared contents, refuse-or-rename conflicts

Status: Accepted · Requirements: FR-DAT-10/11, FR-IMP-04, FR-VOI-04, NFR-09, AC-20, AC-21

## Decision

- **Zip library:** `fflate` **0.8.2** (MIT, pure JavaScript, no native code; works in Node and the browser). Verified in
  the shipped `lib/index.d.ts`: `zipSync(files, opts)` with per-entry `{ level, mtime }`, and `unzipSync(data,
  { filter })` where the filter sees `name`, `size` and `originalSize` before an entry is inflated.
- **Layout:** `manifest.json` (schema `package`, format version 1) lists every entry with SHA-256, size and role.
  Asset packages (`.framechar`, `.frameasset`, `.framevoice`) hold `assets/<id>@<v>.json` and
  `media/<sha256>.<ext>`; project packages (`.frameproj`) hold `project/<files>` (project.json, episodes, assets,
  locks — not versions, renders or history) and `library/<id>@<v>.json` for user-library assets the project uses.
  Bundled assets travel as `requires: [{ref, hash}]` only (SRS §3.6). Entries are written in path order with a fixed
  timestamp, so the same input produces the same bytes.
- **Reader rules (NFR-09):** only declared entries; safe relative paths (no `..`, no absolute paths, no drive letters,
  restricted character set); an allow-list of file types (JSON, audio, PNG/JPEG/WebP, text) — scripts, HTML and SVG
  are refused; per-entry, total and count limits checked from the zip headers before inflating; every entry's
  size and hash verified; media must be named after its hash; nothing is written until the whole package verifies,
  and project packages unpack only below the chosen empty folder.
- **Dependency discovery:** generic — every `id@version` string and every media object in a manifest (except the
  `capabilities` tokens such as `rig.biped@1`), followed transitively through non-bundled assets (FR-ARC-06).
  References nothing can resolve (e.g. a starter voice not yet authored) are reported as warnings, not fatal: the
  source has the same gap and validation reports it where it is used.
- **Conflicts (FR-DAT-11):** an existing `id@version` with identical content is skipped; different content is
  refused with a report, or — on request (`--new-ids`, `onConflict=new-id`) — the conflicting `user.*` assets get new
  IDs and every reference inside the imported set is rewritten. Bundled IDs are never renamed.
- **Consent:** cloned voices without a consent record cannot be exported or imported (`CONSENT_REQUIRED`).
- **Where imports go:** asset packages import into the open project as project-local assets in one undoable step;
  project packages open as a new project folder.

## Evidence

`packages/io/test/package.test.ts` (round trip, byte stability, conflicts, consent, malicious archives, project
package opened without the user library), `packages/cli/test/packages.test.ts`, `packages/server/test/packages.test.ts`.
