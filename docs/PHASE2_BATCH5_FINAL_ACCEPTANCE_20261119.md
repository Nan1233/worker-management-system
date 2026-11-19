# KTC — Phase 2 Deferred Batch 5/5: Final source checks and release decision

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`.

## Decision

**Five batches of safe source fixes and focused CI checks are complete. Production release approval: NOT APPROVED.** This is an evidence-based gate, not an implicit merge/deploy authorization.

## Final passing evidence

[GitHub Actions run 44511311244](https://github.com/Nan1233/worker-management-system/actions/runs/44511311244), tested exact source commit `356e6052e6e8ca8742049e945fd5ace68005fa06`:
- Backend: **162/162** selected Node tests PASS; check PASS.
- Frontend: **73/73** selected Node tests PASS; TypeScript, lint and build PASS.
- Desktop: **57/57** selected Node tests PASS; renderer source checks PASS.
- Combined: **292/292** tests; **4/4** jobs PASS.
- Independent synthetic worker Excel smoke and packaging shared-contract script: PASS.
- All Excel writes were to disposable OS temp folders on isolated CI runners; no shared database credentials, NAS or company Documents export path used.

This evidence does **not** cover browser click/UI, real Windows builds/device UAT, disposable DB concurrency, deployed service, end-user flow or production data.

## Source changes delivered for the highest-risk gap (D-19)

1. `desktop/electron/monthlyWorkbookLocal.cjs`: paper templates have no visible ID; the export now records source row, report ID, worker code, work date, per-day STT and concurrency timestamp in veryHidden `_KTC_SYNC`. It derives row positions using the same stable sort and day separators as the paper renderer (linear time). It records the actual paper worksheet name to fix prior metadata mismatch. This preserves visible Workbook1 headers, data columns, styles and print layout.
2. `desktop/electron/excelDbSync.cjs`: reads row identity from hidden metadata if no visible ID column, fails closed on missing old mappings or mismatch of date/worker/STT, rejects untracked new paper rows until submitted through the application, and only allows mapped paper fields into a patch. Original `expected_updated_at` is retained. GC without an explicit helper value no longer generates a phantom `operation_type: null` patch on an unchanged file.
3. `desktop/tests/phase2-batch4-xlsx-isolated-roundtrip.test.cjs`: real XLSX creation, temp-file write/read/edit/reimport for six Workbook1 process forms, older K1/K2 paper forms and generic CVK; verifies original file gives zero proposed update, an actualTime edit produces the exact report ID/patch/expectedUpdatedAt, identity mismatch is rejected, and two different reporting dates preserve independent source rows. The existing 11-file monthly export and Workbook1 template/style tests also pass.

The new verification initially exposed false change detection for GC; logs recorded an unwanted `operation_type: null` patch. The importer was fixed, then the final focused CI run passed. Nothing was bypassed to conceal this failure.

## What still blocks production acceptance

| Ledger | State | Required proof |
|---|---|---|
| D-04 / D-05 | PARTIAL | Real browser Manager and Admin Ops row navigation, checkbox/select-all, filters/pagination, bulk approval/rejection, keyboard interactions |
| D-09 / D-17 | PARTIAL | Worker draft/offline recovery in browser; Admin mobile and dark/light visual and accessible interactions |
| D-11 / D-13 / D-14 / D-15 / D-16 | PARTIAL | Disposable TiDB transactions, RBAC, concurrent submissions, snapshot stability, approved KPI/physical machine totals |
| D-18 | PARTIAL | Windows NSIS/portable installation, signing and physical device smoke |
| D-19 | PARTIAL | Multi-field NG/deduction edits across paper layouts, actual import preview and backend CAS with disposable DB; legacy-file re-export instructions and manual new-row UX |
| D-07 | OPEN | Final complete cross-system regression evidence and explicit release approval |

Previously verified PASS codes remain: **D-01, D-02, D-03, D-06, D-08, D-10, D-12, D-20**. Remaining **11 PARTIAL, 1 OPEN**. Persistent source of truth: `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`.

## Deployment and data safety

- No merge, no manual deployment, no production/shared TEST TiDB writes, no NAS or company reporting folder writes were performed.
- Cloudflare test Worker build triggers were read-only inspected earlier; both were configured for branch `test`, not `refactor/ktc-local-cleanup`.
- VeryHidden worksheet content is **not tamper-resistant**; the backend must enforce role and process scope plus optimistic concurrency against DB state before any approved edit.
- No Windows signing/packaging commands or real company Excel sync were run in this batch.

## Exact next release gate

1. On a disposable backend/TiDB fixture, prove unauthorized changes return 403, stale `expected_updated_at` returns conflict, concurrent submission commits once, rollback is atomic, and historical snapshots remain unchanged after changing current standards.
2. In an isolated browser/fixture environment, prove Manager Pending/Approved navigation, approval selections, Worker draft/offline, Admin role management, and mobile/dark mode.
3. On a non-production Windows machine, create and inspect NSIS/portable builds and real XLSX roundtrip for representative NG, deduction and changed product fields. Never sync to the real company DB during acceptance.
4. Record each evidence link/sha under D-04..D-19; only then close D-07 with authorized approval for a separately reviewed merge/deploy.

**Phase 2 source and safe CI handoff complete; production release acceptance remains blocked.**
