# KTC — clean-code baseline (2026-11-17)

Scope: GitHub branch `refactor/ktc-local-cleanup`; baseline commit `11d00182`. This audit is based on repository contents only. It is not a claim that local build, integration tests, or the deployed TEST site passed.

## Findings and priorities

1. **P0: keep environments and secrets isolated.** Local scratch files, database exports and installer artifacts must not accidentally enter commits. `.env` is already ignored. Never commit TiDB credentials or user data. A shared TEST database means local writes also modify TEST data.
2. **P0: confirm build/test baseline before structural refactors.** Run frontend `npm run typecheck`, `npm run build`, and `npm test`; backend `npm run check` and relevant tests. Report failures before modifying unrelated code. The TEST deployment workflow has different build paths; avoid assuming production build success implies TypeScript validation.
3. **P1: split worker form orchestration.** `frontend/src/pages/worker/ProcessPage.tsx` is ~1,758 lines. Extract one responsibility at a time (master data, machine lines, draft state, validation, submission, UI composition). Existing helper hooks/services must be assessed first to avoid duplicate abstractions. Keep payloads and error handling stable.
4. **P1: reduce CSS cascade coupling.** `frontend/src/App.tsx` imports many global/role CSS layers, and `frontend/src/pages/worker/WorkerHome.css` is ~977 lines. Document layer ownership and migrate page-only rules into page-scoped styles, backed by screenshots for desktop/mobile. Do not remove rules by name alone; the order may be intentional.
5. **P1: isolate high-complexity backend operations.** Large files include `backend/models/productionTempApprovalModel.js` and `backend/services/productionTempSubmissionService.js`. Separate normalization/validation from transactional writes; preserve idempotency, concurrency and machine-accounting invariants.
6. **P2: simplify desktop Excel modules.** `desktop/electron/monthlyWorkbookLocal.cjs` is ~73 KB. Extract pure formatting and mapping logic before touching workbook I/O; use existing Excel round-trip/regression tests.
7. **P2: remove tracked generated artifacts with a dedicated change.** The repository includes Android compiled assets and a historical canonical SQL snapshot. Inventory build references before any removal; adding ignore patterns alone does not untrack files.

## First safe cleanup applied on this branch

- Ignore **untracked** local `backups/`, `backend/templates_backup/`, `desktop/release-*/`, desktop scratch directory and `*.before-style-fix`. Existing tracked files are not removed; no files on disk are deleted.
- In `canonicalSchemaContractService.js`, express the migration-060 exclusion as a named set of retired tables filtered when the canonical contract is built. This leaves the canonical SQL snapshot unchanged and preserves the resulting table contract.

## Refactor discipline

- Refactor only on `refactor/ktc-local-cleanup` or subsequent feature branches. No changes to `test` or production before review and tests.
- Every extraction needs a focused regression test; don't change process rules, worker-facing forms, report calculations, approvals, or Excel column mapping as a side effect.
- Preserve any outstanding untracked local scripts intentionally (such as `run-tidb-test.cmd`); inspect before adding and never embed secrets.
- Before merging, check: TypeScript build; worker login, input and history; manager approve/reject; GC shared-machine accounting; MAI multi-run behavior; month-end Excel exports; mobile layout; Cloudflare deploy bundle.

## Validation status

GitHub file contents and commit results verified. Full runtime, compilation, browser visual parity and data-backed regression tests **not run** in this session; execute them on the Windows checkout before integrating.
