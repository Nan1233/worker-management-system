# KTC Phase 3 Exit Gate — evidence-first handoff

Status: **SOURCE CI EVIDENCE COLLECTED; FINAL OPERATIONAL ACCEPTANCE DEFERRED**. The complete Phase 3 source-acceptance suite passed on PR #295 HEAD, including Windows CI Excel smoke; isolated TiDB staging UAT, physical Windows device acceptance and release approval remain unverified.

## Scope freeze

After PR #270, stop opening incremental approved-machine-copy hardening PRs unless a reproducible P0/P1 defect or a failing required test demonstrates a release blocker. Record other improvements as follow-up issues.

## Exit criteria

| Gate | Evidence required | Status |
| --- | --- | --- |
| Source integrity | `test` merge commit `4b9fd11805269e9980361e8e256111c9dd036581`; PR #295 HEAD `220bfc1bc1296020bcbdbdae847e449e44a58e0f` passed full Phase 3 source acceptance and RBAC | FULL PR-HEAD SOURCE CI PASS; LATEST MERGE-COMMIT CI NOT YET VERIFIED |
| Business regression | Approve/reject/edit, RBAC, historical standard snapshots, decimal precision, machine/worker credit, NG associations | AUTOMATED BACKEND/FRONTEND CI PASS; STAGING UAT PENDING |
| GC shared machines | Physical machine output and machine hours counted once, worker credits tracked separately | XLSX/CONTRACT CI PASS; LIVE DB RECONCILIATION PENDING |
| Desktop Excel | Monthly export smoke, totals, dates, dynamic NG/deductions, sync metadata, no duplicate shared-machine hours | LINUX + WINDOWS RUNNER SMOKE/XLSX CI PASS; PHYSICAL DEVICE/UAT PENDING |
| Security | No privilege escalation, secrets in source, or unauthorized export | RBAC/DEPENDENCY HIGH AUDIT PASS; LIVE SECURITY UAT PENDING |
| Staging readiness | Isolated non-production TiDB, migration/restore plan, credentials and test identities verified | PENDING |

Phase 3 source acceptance is separate from final operational acceptance. Source checks can be completed and development may proceed to the next phase while isolated staging is deferred to the final integration/acceptance milestone. **Do not mark live UAT or production approval PASS before isolated staging evidence exists.**

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

## Full source acceptance refresh (2026-11-10)

On [PR #295](https://github.com/Nan1233/worker-management-system/pull/295), HEAD `220bfc1bc1296020bcbdbdae847e449e44a58e0f`, these workflows completed **SUCCESS**:

- [Phase 3 Source Acceptance Evidence](https://github.com/Nan1233/worker-management-system/actions/runs/42731407216): all six jobs PASS — backend check/test/audit, frontend typecheck/lint/test/build/audit, desktop Linux Excel regression/audit, **desktop Windows runner Excel smoke and shared-machine tests**, staging safety contracts, aggregate source-acceptance.
- [Admin Ops RBAC Checks](https://github.com/Nan1233/worker-management-system/actions/runs/42731406853): SUCCESS.
- Merged into `test` as `4b9fd11805269e9980361e8e256111c9dd036581`.

**Scope boundary:** This is PR-head source CI, not post-merge CI, not a physical KTC Windows workstation test, and not proof that a production-like TiDB staging database exists.

### Phase 3 closeout: evidence still required

| Evidence | Responsible environment | Pass condition |
| --- | --- | --- |
| Isolated staging DB identity and restore rehearsal | Dedicated disposable TiDB `worker_management_e2e` | Identity verified on actual writer connection; migration version, backup/restore owner and timestamp recorded |
| 24 critical write-path scenarios | Local loopback backend connected only to disposable staging DB | 24/24 PASS, no leaked fixture rows, cleanup manifest and logs attached |
| Manager/lead/worker role UAT | Staging accounts with synthetic data | Unauthorized scope rejected; approve/reject/edit and stale-update conflict demonstrated |
| Shared-machine accounting reconciliation | Staging GC 5/6/7/11 data | Machine physical totals counted once; worker credits separately reconciled |
| Excel physical-device acceptance | KTC Windows PC running intended Electron build | Monthly XLSX output, date grouping, dynamic NG/deductions, sync sheet, file permissions and path verified |
| Release decision | Named KTC approver | Signed go/no-go with known issues, rollback and deployment ownership |

**Do not close Phase 3 or deploy to production until all required evidence is collected.** CI green alone cannot satisfy these acceptance items.

## Source-only development handoff (2026-11-10)

- [PR #297](https://github.com/Nan1233/worker-management-system/pull/297) aligned `push` and `pull_request` source-acceptance triggers for scripts, tests and release documentation; merged into `test` at `1113b4d65a6fdbd60356fdeb810a9f61af0f8343`.
- Source CI and Windows runner Excel checks are automated; a Windows CI runner is **not** the KTC target workstation.
- **User-approved sequence:** continue non-DB development phases now; schedule isolated TiDB staging, write-capable E2E, database reconciliation and production release decision only after the development phases.
- Do not change production data, run destructive remote E2E, or claim final Phase 3 operational acceptance without the deferred evidence.

## Latest Phase 3 source gate (2026-11-10)

- [PR #299](https://github.com/Nan1233/worker-management-system/pull/299) added Windows production dependency audit and syntax checks for staging release scripts; all PR-head workflows passed; merged as `2fa2d43a12668423b7c2cae9e1159d763d40b3a3`.
- [PR #300](https://github.com/Nan1233/worker-management-system/pull/300) fixed missing failure evidence when the performance benchmark cannot connect to staging DB; after correcting the regression assertions, all three PR-head workflows passed; merged as `6d3fb35918b87f7bb146124216dca702e07e5c86`.
- This is the latest known **source-verified development baseline**, not confirmation of post-merge CI on the squash commit, a completed live E2E run, or production approval.
- Handoff: continue source-only development and regression testing; defer TiDB provisioning, write-capable UAT and production release until final integration.

## Repeatable verification commands

From a clean checkout of `test`, install dependencies using the checked-in lockfiles, then run the applicable scripts:

```sh
node --test backend/tests/*.test.js backend/tests/*.test.cjs
cd desktop && npm run smoke:excel
```

Also verify both required GitHub Actions workflows (Admin Ops RBAC Checks and Phase 1 clean-code regression) on the final `test` commit. If a command is unsupported on the current OS, run it on the intended CI runner and attach its logs; do not mark PASS without evidence.

## Final integration and isolated staging handoff (deferred until development phases complete)

Use `RELEASE-VALIDATION.md` and `scripts/stagingE2E.cjs`. Write-path tests MUST target disposable staging, never production TiDB or the live production API. Record migration checks, role-based UAT, report approval, Excel reconciliation and rollback/restore evidence. Never commit tokens, passwords, connection strings, or real employee data.

## Decision record

- Phase 3 accepted: **NO — awaiting evidence**
- Live staging UAT completed: **NO**
- Production release authorized: **NO**
- Next action: finish remaining source-only review and proceed with the next development phase. Defer isolated TiDB setup, 24 write-capable E2E scenarios, live UAT and release decision until the final integration milestone.
