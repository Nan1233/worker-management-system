# KTC — Giai đoạn 4/10: Excel import identity integrity

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`.

## Executed code

- `desktop/electron/excelDbSync.cjs`: the parser of veryHidden `_KTC_SYNC` now refuses repeated positive report IDs with `EXCEL_SYNC_DUPLICATE_META_ID`. Previously `Map.set(id, ...)` silently replaced the earlier original snapshot, which could mask a corrupt/malicious workbook and create wrong approved-report patches.
- `desktop/tests/phase2-batch4-xlsx-isolated-roundtrip.test.cjs`: constructs a real synthetic DO paper XLSX, duplicates the hidden identity metadata row, writes the XLSX into a disposable OS temporary directory and asserts import rejects it. No backend API or company Excel folder.
- Existing six Workbook1 paper sheets, K1/K2, multi-date row identity, generic CVK, source concurrency token and Windows runner compatibility tests remain part of the consolidated workflow.

## Verification

- Latest confirmed baseline: Phase 2 CI [44511311244](https://github.com/Nan1233/worker-management-system/actions/runs/44511311244) 292/292 tests PASS.
- Phase 3 CI [44516748840](https://github.com/Nan1233/worker-management-system/actions/runs/44516748840) Backend/Frontend/Linux Desktop/Windows Desktop jobs completed SUCCESS, Windows 22/22. Browser job was still running at last observation; check final result.
- Phase 4 CI runs on pushes touching `desktop/electron/excelDbSync.cjs` or `desktop/tests/phase2-batch4-xlsx-isolated-roundtrip.test.cjs`; consult latest run status before treating the new test as PASS.

## Release gates

No merge, deploy, TiDB production/shared TEST write, NAS or company Documents folder write. **D-19 remains PARTIAL** until all paper NG/deduction field edits, backend CAS conflicts, and user import preview pass against disposable fixtures. **D-18 remains PARTIAL** until installed Windows NSIS/portable/device UAT. Other D-IDs unchanged: 8 PASS, 11 PARTIAL, 1 OPEN. D-07 final sign-off OPEN. Production release NOT APPROVED.

Next: run authenticated role flows against disposable TiDB and Windows installed-app E2E, then record evidence in `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`.
