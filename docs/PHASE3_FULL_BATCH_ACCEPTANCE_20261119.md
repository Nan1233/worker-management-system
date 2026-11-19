# KTC — Phase 3 consolidated execution and evidence-based acceptance

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`. No merge, deploy or production DB/NAS write.

## Scope performed in one change set

- Added `frontend/tests/e2e/phase3-public-security.spec.ts`: browser-only tests for unauthenticated management/worker route guards, mobile login viewport and keyboard focus. No backend or seeded account required.
- Added `frontend/playwright.phase3.config.ts`: isolated Vite on localhost, Chromium desktop and mobile contexts, fake unreachable localhost API, no DB.
- Expanded `.github/workflows/phase2-consolidated-safe.yml` with dedicated real Chromium job on Ubuntu 24.04 (Playwright 1.56 does not support Ubuntu 26.04), plus Windows runner compatibility job.
- Windows job runs actual synthetic XLSX read/write/import regression and packaging source contracts. It does **not** build or sign NSIS/portable, nor run an installed Desktop app.

## Evidence and known environment blockers

- Previous Phase 2 pinned source [run 44511311244](https://github.com/Nan1233/worker-management-system/actions/runs/44511311244): 292/292 Node tests PASS across Backend/Frontend/Desktop.
- Phase 3 new run [44516748840](https://github.com/Nan1233/worker-management-system/actions/runs/44516748840) tests additional Windows and browser jobs; consult its **current conclusion** rather than assuming it passed at document creation time.
- Windows runner (same run) **22/22** synthetic Node tests PASS, packaged shared Excel contract PASS.
- Backend, Frontend and Desktop Linux jobs in that run completed SUCCESS.
- Initial browser run [44516576138](https://github.com/Nan1233/worker-management-system/actions/runs/44516576138) failed on runner dependency install, **not app behavior**: ubuntu-latest resolved to Ubuntu 26.04, unsupported by Playwright 1.56. Fixed by pinning ubuntu-24.04. Follow-up browser execution must be checked.
- Workflow schema initially failed because job-level `runner.temp` expression was invalid in Windows env. Removed that expression; current run has five real jobs.

## Remaining acceptance gates (not safely executable with current credentials/devices)

| Codes | Status | Real proof still required |
|---|---|---|
| D-04/D-05 | PARTIAL | Authenticated Manager/Admin Ops browser pending/approved selection, detail navigation and bulk approval/reject |
| D-09 | PARTIAL | Real Worker form/draft/offline recovery in browser against disposable API |
| D-11/D-13/D-16 | PARTIAL | Concurrent approvals/submissions, rollback, RBAC/cache invalidation on disposable TiDB |
| D-14/D-15 | PARTIAL | Historical effective-date and physical machine KPI parity across approved database rows |
| D-17 | PARTIAL | Authenticated Admin responsive/dark/light UI regression |
| D-18 | PARTIAL | Real Windows installer/portable build, signing and installed-device UAT (Windows runner source tests are not installer tests) |
| D-19 | PARTIAL | Complete defect/deduction editing/import across all paper templates and server CAS conflict tests |
| D-07 | OPEN | Final full-system acceptance and authorized sign-off |

Previous PASS items remain D-01, D-02, D-03, D-06, D-08, D-10, D-12 and D-20. **No status is upgraded merely because a test file exists.**

## Release decision

**NOT APPROVED FOR PRODUCTION.** CI source/fixture success and browser-only public route smoke cannot substitute for authenticated browser flows, disposable TiDB transaction tests or Windows installed-device acceptance. To complete those remaining tasks, use isolated `ktc_it_*` database credentials, a browser-capable CI runner and an authorized nonproduction Windows test device. Never point the integration suite at shared TEST/production data.

See `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md` for the authoritative D-01..D-20 statuses.
