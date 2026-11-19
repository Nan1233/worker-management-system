# KTC Phase 2 — Deferred batch 3/5: Backend, concurrency, historical KPI and shared machines

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`.

## CI result

**[GitHub Actions run 44507431486](https://github.com/Nan1233/worker-management-system/actions/runs/44507431486)**, application/test source SHA `73aa3db7b4f8cb45abc4a438357c8030382fbff3`: **4/4 jobs SUCCESS**.
- Backend: **162/162** focused/mocked tests PASS; syntax/source checks PASS.
- Frontend: **73/73** tests PASS; TypeScript typecheck, lint and build PASS.
- Desktop: **21/21** selected contract/metric tests PASS, renderer checks PASS.
- **256/256 total Node test cases PASS**. No database credentials or E2E was used.

## Source and test changes

1. New `backend/tests/phase2-batch3-historical-kpi-parity.test.js` (five tests): verifies the immutable `training_percent_snapshot` supersedes mutable worker profile, Backend/Desktop agreement on persisted historical report fields, fail-closed handling of missing training snapshots, and single counted physical event across participants.
2. The Backend GitHub Actions gate now includes mocked transaction/rollback, approved-edit lock, logical duplicate, machine submission locking, historical standard versions and overlap, approved snapshot version determinism, rollback snapshot, physical machine event accounting and cross-engine metrics.
3. Corrected outdated `backend/tests/approved-machine-copy-real-mapping-integration.test.js` extraction boundary, which referenced a helper moved out of its original file. Corrected `backend/tests/shared-machine-accounting-flow.test.js` source contract, which expected an inline net-hour map that had already been replaced by the existing shared pure helper. These are test fixes, **not changes to business calculations or transactions**.

The initial expanded run [44507150277](https://github.com/Nan1233/worker-management-system/actions/runs/44507150277) failed 2 obsolete harness assertions (157/159); the next run passed all 162. This is documented, not suppressed.

## Ledger decisions

| Item | Source/fixture verification | Still required |
|---|---|---|
| D-11 — transaction and proposal review | rollback, commit ordering and approved-edit concurrency mocked tests PASS | Real database lock/rollback, process scope and permission authorization under concurrent requests |
| D-13 — report submission idempotency | mocked logical duplicate, submission lock, queue and shared-machine tests PASS | Disposable DB simultaneous create, group submission/rollback and idempotency |
| D-14 — historical standards & training | historical effective-date, overlap, fail-closed snapshot, daily hours and physical accounting tests PASS | DB version mutation/approval snapshot immutability and historical KPI comparison |
| D-15 — physical machine + KPI parity | new cross-engine five-case test and existing physical dedup tests PASS | Actual approved rows and synthetic XLSX roundtrip verifying stable machine totals and formula values |

All four remain **PARTIAL**, including D-15 (previously OPEN). This CI does not prove production behavior or real user authorization.

## Remaining project ledger

7 PASS, 11 PARTIAL, 2 OPEN: see `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`. All prior cases remain tracked. Avoid re-running already-PASS tests on unchanged code; rerun affected tests on new changes.

## Safety and next batch

No production/TEST TiDB operations, no deploy, no merge, no NAS file write. GitHub CI uses ephemeral runners without DB credentials and `npm ci --ignore-scripts`.

**Next batch 4/5 — Desktop Excel: D-02, D-18, D-19**, focused on synthetic workbook/template sync parity in a temporary isolated workspace. Continue to track the browser and DB leftovers for final acceptance.
