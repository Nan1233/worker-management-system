# KTC Phase 3 Exit Gate — evidence-first handoff

Status: **SOURCE CI EVIDENCE COLLECTED; PHASE 3 NOT YET ACCEPTED**. Automated verification has passed on multiple later PR heads through #288; no live isolated TiDB staging UAT or production release approval has been recorded.

## Scope freeze

After PR #270, stop opening incremental approved-machine-copy hardening PRs unless a reproducible P0/P1 defect or a failing required test demonstrates a release blocker. Record other improvements as follow-up issues.

## Exit criteria

| Gate | Evidence required | Status |
| --- | --- | --- |
| Source integrity | `test` merge commit `67c78605f3a5f9bfd26a0d35927aa59a235c4bcd`; PR #288 HEAD `8c3bb64d632f5fb0b66c0bb2525f07a22e608bb8` passed 2 workflows | PR-HEAD SOURCE CI PASS; POST-MERGE CHECK PENDING |
| Business regression | Approve/reject/edit, RBAC, historical standard snapshots, decimal precision, machine/worker credit, NG associations | AUTOMATED BACKEND/FRONTEND CI PASS; STAGING UAT PENDING |
| GC shared machines | Physical machine output and machine hours counted once, worker credits tracked separately | XLSX/CONTRACT CI PASS; LIVE DB RECONCILIATION PENDING |
| Desktop Excel | Monthly export smoke, totals, dates, dynamic NG/deductions, sync metadata, no duplicate shared-machine hours | SMOKE/XLSX CI PASS; DEVICE/UAT PENDING |
| Security | No privilege escalation, secrets in source, or unauthorized export | RBAC/DEPENDENCY HIGH AUDIT PASS; LIVE SECURITY UAT PENDING |
| Staging readiness | Isolated non-production TiDB, migration/restore plan, credentials and test identities verified | PENDING |

Phase 3 source acceptance requires the first five gates PASS, with dated evidence linked to the exact commit. Staging readiness may be handed off as a Phase 4 prerequisite, but **Phase 4 UAT cannot pass without real isolated staging verification**.

## Verified CI evidence (2026-11-09)

All four workflows completed SUCCESS on **PR #277 HEAD `27438fe0aa82397f40ae412f1e14f50b563f77bc`**:

- [Phase 3 Source Acceptance Evidence #5](https://github.com/Nan1233/worker-management-system/actions/runs/42652877555): backend, frontend, desktop, aggregate source-acceptance jobs PASS; desktop production `npm audit --audit-level=high` PASS.
- [Admin Ops RBAC Checks #1418](https://github.com/Nan1233/worker-management-system/actions/runs/42652877480): four required RBAC/backend/frontend jobs PASS.
- [Desktop CVK Excel Regression #119](https://github.com/Nan1233/worker-management-system/actions/runs/42652877435): PASS.
- [Phase 3 Desktop Excel Acceptance #4](https://github.com/Nan1233/worker-management-system/actions/runs/42652877437): PASS.

Merged into `test` via PR #277, squash commit `e38596900cf0b67ff112a53d0f50f0d1f80aef35`. PR-head CI and post-merge CI are distinct. This is **not** evidence of actual database migration, real worker UAT, desktop Windows device verification, or production approval. Moderate transitive `uuid` risk is tracked in [issue #279](https://github.com/Nan1233/worker-management-system/issues/279).

## Subsequent hardening and evidence (2026-11-09)

These checks passed on their **PR heads before merge**, not on the resulting squash merge commits:

| PR | Verified change | PR-head CI evidence | Squash merge into `test` |
| --- | --- | --- | --- |
| [#284](https://github.com/Nan1233/worker-management-system/pull/284) | Cleanup in `finally`, partial artifact recording and failure propagation | [Staging Safety #15](https://github.com/Nan1233/worker-management-system/actions/runs/42654646912), [RBAC #1427](https://github.com/Nan1233/worker-management-system/actions/runs/42654646859) | `4d745893574ba96f48aaf73fdc36f3de4c6c1f62` |
| [#285](https://github.com/Nan1233/worker-management-system/pull/285) | Verified TLS for E2E write connection | [Staging Safety #18](https://github.com/Nan1233/worker-management-system/actions/runs/42655236260), [RBAC #1430](https://github.com/Nan1233/worker-management-system/actions/runs/42655236207) | `c761fb9c9dc194c57f5adb1e1923683e9cbda72f` |
| [#286](https://github.com/Nan1233/worker-management-system/pull/286) | DB port parity and unique cleanup markers | [Staging Safety #20](https://github.com/Nan1233/worker-management-system/actions/runs/42655547559), [RBAC #1432](https://github.com/Nan1233/worker-management-system/actions/runs/42655547938), [Phase 1 #224](https://github.com/Nan1233/worker-management-system/actions/runs/42655548120), [Phase 3 Source #7](https://github.com/Nan1233/worker-management-system/actions/runs/42655547217) | `1ea7429abddcb72c49fdae5d3e0698a645354600` |
| [#287](https://github.com/Nan1233/worker-management-system/pull/287) | Actual writer DB session verification | [Staging Safety #22](https://github.com/Nan1233/worker-management-system/actions/runs/42656285124), [RBAC #1434](https://github.com/Nan1233/worker-management-system/actions/runs/42656285103) | `3703ff2e8e269630c68ff33f3c0bbfdb5cc1d744` |
| [#288](https://github.com/Nan1233/worker-management-system/pull/288) | Literal SQL LIKE cleanup scoping | [Staging Safety #24](https://github.com/Nan1233/worker-management-system/actions/runs/42657132597), [RBAC #1436](https://github.com/Nan1233/worker-management-system/actions/runs/42657132543) | `67c78605f3a5f9bfd26a0d35927aa59a235c4bcd` |

**Release blockers still open:** (1) provision disposable `worker_management_e2e` with independently verified credentials and restore plan, (2) run the 24 write-capable E2E scenarios against a loopback API wired only to that database, (3) reconcile shared-machine credits and Excel on representative staging data, (4) verify desktop Windows export on target hardware, (5) obtain an explicit human release decision. Never interpret green CI as completion of these steps.

### Evidence to attach at staging handoff

- Sanitized database identity check (`SELECT DATABASE()`), migration version, isolation owner and restoration test timestamp.
- E2E JSON with run ID, all 24 results, cleanup errors and pass/fail; do not attach credentials or real worker identifiers.
- Role-based approval/rejection/edit tests and machine-output-versus-worker-credit reconciliation.
- Desktop export file hashes, validation logs, Windows version and app version.
- Signed go/no-go record including unresolved defects, rollback owner and planned deployment window.

## Repeatable verification commands

From a clean checkout of `test`, install dependencies using the checked-in lockfiles, then run the applicable scripts:

```sh
node --test backend/tests/*.test.js backend/tests/*.test.cjs
cd desktop && npm run smoke:excel
```

Also verify both required GitHub Actions workflows (Admin Ops RBAC Checks and Phase 1 clean-code regression) on the final `test` commit. If a command is unsupported on the current OS, run it on the intended CI runner and attach its logs; do not mark PASS without evidence.

## Phase 4 isolated staging handoff

Use `RELEASE-VALIDATION.md` and `scripts/stagingE2E.cjs`. Write-path tests MUST target disposable staging, never production TiDB or the live production API. Record migration checks, role-based UAT, report approval, Excel reconciliation and rollback/restore evidence. Never commit tokens, passwords, connection strings, or real employee data.

## Decision record

- Phase 3 accepted: **NO — awaiting evidence**
- Live staging UAT completed: **NO**
- Production release authorized: **NO**
- Next action: run and attach the final source/CI evidence, then begin isolated Phase 4 UAT.
