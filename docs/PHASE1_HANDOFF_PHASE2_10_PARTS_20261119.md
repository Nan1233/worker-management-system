# KTC — Phase 1 handoff and Phase 2 plan (2026-11-19)

Repository: `Nan1233/worker-management-system`  
Branch: `refactor/ktc-local-cleanup`

## Phase 1 — architecture audit handoff

**Status: architecture/source audit complete for planning, not an exhaustive file-by-file audit or a verified build/test pass.** Source was inspected read-only. No database, deployment, or production runtime was modified as part of this audit.

### System map

- Frontend: React/TypeScript/Vite; roles worker, lead, manager, admin_ops, admin. AppRouter provides role-specific routes, PermissionRoute gates by permission.
- Backend: Express routes -> controllers -> services -> models -> TiDB; shared calculation primitives.
- Desktop: Electron, monthly Excel export, Excel templates, DB sync; test via synthetic fixtures.
- Main flows: worker draft/submit -> production-temp -> lead/manager review -> approved production -> monthly Excel; historical standards/training snapshots and GC shared-machine accounting must be preserved.
- Master Control: admin-only UI/API for users, permissions, audit, health, database metadata, configuration, backup status and security.

### Source-confirmed risks and verification gaps

1. **P0:** Shared TEST database can be affected by write tests. Do not run unreviewed test commands or remote E2E. Do not commit secrets, employee data, backups or installers.
2. **P0:** No verified baseline for typecheck, build, lint, unit, desktop Excel smoke, or staging E2E was obtained during Phase 1. A successful `frontend build:cloudflare` alone does not imply TypeScript passed.
3. **P1:** `frontend/src/services/productionService.ts` calls `POST /machine-production-events/:id/participants`; `backend/routes/machineProductionEventRoutes.js` only defines `POST /:id/link-participants` for linking. Check call-site reachability and add a contract test before fixing.
4. **P1:** `frontend/src/pages/manager/ManagerReportWorkspaceFix.tsx` rewrites table DOM and uses row-index-based approved report navigation. Risk of incorrect navigation and event/React reconciliation issues; reproduce before change.
5. **P1:** `frontend/src/pages/worker/ProcessPage.tsx` remains large despite existing helper hooks/components; avoid duplicate abstraction.
6. **P1:** Approval/edit-proposal transaction, optimistic concurrency, idempotency, historical standards and GC shared-machine accounting are high-risk invariants.
7. **P2:** App-level global CSS import order; duplicated KPI/comparison helpers; large Desktop workbook module; test gaps.
8. **Not established:** exhaustive unused-code/dependency graph, full per-endpoint database mapping, and runtime defect rates. Do not call these verified.

### Non-negotiable invariants

- Preserve public API contracts unless explicitly versioned; role/permission/scope checks remain server-side.
- Preserve 14-day backdate rules, report status transitions, immutable snapshots, optimistic concurrency and idempotency.
- Physical shared-machine output counted once; separate worker credits; preserve GC 5/6/7/11 behavior.
- Preserve monthly Excel sheet mapping, column ordering, template formats, sync metadata and existing report data.
- No production/test shared DB writes, migrations, deployment, or release without separate authorization and safe isolation.

## Phase 2 — ten sequential parts

Only **one part per user-requested iteration**. A part is complete only when its acceptance checks are supported by evidence. Never mark tests PASS without execution.

| Part | Scope | Completion gate |
|---|---|---|
| 1 | Baseline & safety: inventory scripts, CI, test isolation, safe execution matrix | Document safe/unsafe commands, run only verified non-write checks in isolated environment, record results/blockers |
| 2 | API contract and machine-event participant endpoint mismatch | Contract test + minimal fix, role/permission regression |
| 3 | Manager report navigation and DOM table workaround | ID-based navigation + UI/selection/filter tests |
| 4 | Worker entry `ProcessPage` orchestration | Extract one responsibility at a time, submission/duplicate/offline regression |
| 5 | Manager/lead review and edit-proposal flow | Preserve transaction locks, rollback, CAS and scope |
| 6 | Backend production validation and approval modules | Isolate pure logic from writes; idempotency/concurrency tests |
| 7 | Historical standards, training, KPI, shared-machine accounting | Cross-module parity and immutable snapshot tests |
| 8 | Admin/Master Control, permissions, CSS and common UI | Permission/API tests + responsive visual checks |
| 9 | Desktop Excel and sync | Synthetic XLSX parity, formatting, templates and sync safety |
| 10 | Full regression, performance/security review and handoff | Evidence-based release checklist, no automatic production merge/deploy |

## Phase 2 / Part 1 — baseline & safety

### Verified from package scripts (static)

- Frontend `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`; `build:cloudflare` skips `tsc -b`, while `build:cloudflare:test` and `build:cloudflare:production` include it.
- Backend `npm run check` performs syntax/source checks. `npm test` and `test:integration` require per-test safety inspection first.
- Desktop `npm run check`, `npm run smoke:excel`, `npm run test:machine-time`, `npm run test:workbook1`; `preflight` and smoke scripts must be inspected before running.
- `docs/TESTING_BY_PAGE_AND_FLOW.md` explicitly prohibits unreviewed blanket test execution against shared/production TiDB.
- `backend/tests/flowSuiteManifest.cjs` is an allowlist of isolated tests, not proof of all UI/API coverage.

### Execution status

- GitHub source inspection: **DONE**.
- Local checkout, dependency installation, lint/typecheck/build, safe unit tests, Excel smoke, E2E: **NOT RUN**.
- Database writes, schema changes, deployments: **NOT DONE**.
- Part 1 acceptance gate: **PENDING** until a safe execution environment is available and baseline results are recorded.

### Next safe actions for Part 1

1. Obtain an isolated checkout of the exact branch SHA and verify working-tree status; preserve existing local modifications.
2. Inspect test scripts and environment guards before invoking any command; avoid remote write-path tests.
3. Run syntax/typecheck/lint and reviewed pure unit tests only, record command, commit SHA, environment and outcome.
4. Report blockers rather than claiming PASS. Do not start Part 2 until Part 1 gate is met or explicitly waived.
