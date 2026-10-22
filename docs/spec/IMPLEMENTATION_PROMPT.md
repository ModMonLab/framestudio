# Implementation prompt — Frame (paste this into a new session)

You are the implementation agent for **Frame**, a 2D animation directing studio. The complete specification is attached as `frame-spec.zip`. Your job is to implement **all of it**, in this repository, to the standard the documents define, and to keep working across as many sessions as needed until every requirement is met and verified.

## 1 Set up the repository (first session only)

1. Unzip `frame-spec.zip` into the repository root so it contains:
   - `docs/spec/01-VISION.md`, `02-DESIGN-SYSTEM.md`, `03-CATALOG.md`, `04-SRS.md`
   - `docs/spec/mockups/` — source of the two approved reference screens (visual reference only; read its README)
   - this prompt as `docs/spec/IMPLEMENTATION_PROMPT.md`
2. Commit that as the first commit ("Add Frame specification set").
3. Create `docs/PROGRESS.md` (§4) and `docs/decisions/` before writing any code.

If the repository already contains `docs/PROGRESS.md`, this is a **continuation session**: skip setup, read `docs/PROGRESS.md` first, and resume from the next unfinished item.

## 2 Read before building

Read all four documents completely, in order: Vision → Design System → Catalog → SRS. They are the contract:

- **01 Vision** decides intent and trade-offs (principles P1–P14).
- **02 Design System** is binding for all UI: tokens, patterns, components, reference screens. Its §7 describes the two approved reference screens; their mockup source is in `docs/spec/mockups/` — use it to match layout and behaviour, but do not port its code (see the mockups README).
- **03 Catalog** is the binding list of content (1,254 items with stable IDs). Every item is required (decision D-05).
- **04 SRS** is binding for behaviour, data, interfaces, quality and acceptance (FR-, NFR-, CAT-, UI-, API-, AC- IDs). Decisions D-01…D-12 are settled; do not reopen them.

Precedence when documents conflict is in SRS §0.2. If something is genuinely ambiguous and blocks progress, record the question and your chosen interpretation in `docs/decisions/` and continue; do not stop to ask unless the choice would be expensive to reverse.

## 3 How to work

**Order.** Follow SRS §11 milestones M0 → M6. Do not start polishing later features before the M1 vertical slice works end to end (a designed voice speaking aligned lines in a two-character scene, exported identically from Studio and CLI). Content production (catalog art, sounds, voices, templates) runs as a parallel track once the part contract is frozen at the end of M1.

**Architecture.** Use the monorepo and packages in SRS §2.2 and the recommended stack in §2.3 unless a recorded decision replaces an item. Verify every external dependency (Qwen3-TTS, WhisperX/MFA, CanvasKit, ffmpeg, MCP SDK, etc.) against its official documentation at the time you use it and record the verified API, version and licence in `docs/decisions/`. An install is not evidence that a capability works.

**Quality bar.** Professional, finished, polished — matching the Design System in both themes. No placeholder controls (UI-06): every visible control works or states its prerequisite. No hard-coded catalog names in runtime code (FR-ARC-06).

**Tests and evidence.** For every requirement you implement, add or update tests (unit, integration, golden-frame, E2E, worker) and map them to requirement IDs. A requirement is "done" only with passing evidence. Keep the acceptance report (SRS §12 item 7) current as you go, not at the end.

**Commits.** Commit small, coherent changes with clear messages referencing requirement IDs. Push after each meaningful step so no work is lost if the session ends. Run the fast checks (typecheck, lint, unit tests) before every push; never push a broken main build.

**Content.** Bundled content is produced with the same part editor, importers and validators users get (CAT-07). Use AI assistance for drafting parts where helpful, but every item must pass the rig check, have both style families and all four views (or a documented exemption), real previews, recorded licence/provenance, and a visual review sheet (CAT-06). Track content per catalog ID in the coverage report (CAT-10).

**Environment limits — be honest about them.** Some requirements need hardware or services this cloud container may not have:
- The **Voice Worker** targets the owner's RTX 5060 Laptop GPU (8 GB VRAM) under WSL2/Docker. If no suitable GPU is available here, implement the worker fully, verify its contract with the **fixture worker** (API-04) and CPU-mode smoke tests where feasible, and mark live GPU checks (NFR-06, AC-03, AC-17, AC-24) as **Not verified — requires reference machine**, with exact steps for the owner to run them.
- Listening panels (AC-03), human visual sign-off (CAT-06) and reference-machine performance numbers (NFR-01/02/05) likewise require the owner; prepare everything, produce the evidence you can, and list precisely what remains.
Never claim a capability works without evidence; never present fixture output as real speech (P7, NFR-18).

## 4 Progress tracking (mandatory, enables resuming)

Maintain `docs/PROGRESS.md` and update it at least at every milestone step and at the end of every session:

```markdown
# Frame — implementation progress
Last updated: <date> · Session <n>
## Current milestone: M<k> — <name>
## Status by milestone
| Milestone | Status | Exit evidence |
## Requirement status
| ID | Status (Not started / In progress / Done / Not verified / Blocked) | Evidence (tests, files, reports) | Notes |
## Catalog coverage
<summary of CAT-10 report: items complete / total per list>
## Next actions (ordered)
1. ...
## Open decisions and blockers
- ...
```

At the start of every session: read `docs/PROGRESS.md`, run the test suites, confirm the state matches, then continue with "Next actions". At the end of every session: update it, commit and push.

## 5 Definition of done

Frame version 1 is complete only when (SRS §12):

1. Every FR, UI, API, CAT and NFR requirement is **Done** with evidence, or **Not verified** solely for the documented reference-hardware/human-review reasons above, with owner instructions.
2. Every acceptance scenario AC-01…AC-24 has run end to end with recorded evidence (or is Not verified for the same documented reasons).
3. The catalog coverage report (CAT-10) is 100 % green.
4. The README lets a new person install and run everything on the reference laptop (AC-24), including the Voice Worker.
5. The acceptance report states passed, failed, skipped and not verified items honestly, with environment details and known limitations.

Do not describe the product as complete while any mandatory item is Failed or unverified for reasons other than those above.

## 6 Start now

If this is the first session: perform §1, read §2, write `docs/PROGRESS.md` with the full requirement table (every ID from the SRS and catalog list summary) set to "Not started", record initial stack decisions, then begin M0. Work continuously and autonomously; keep going milestone after milestone, committing and pushing as you go, until the session ends. Report at the end of the session: what was completed (with evidence), what is in progress, and the next actions.
