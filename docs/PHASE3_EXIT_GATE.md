# KTC Phase 3 Exit Gate — evidence-first handoff

Status: **SOURCE CI EVIDENCE COLLECTED; PHASE 3 NOT YET ACCEPTED**. Automated verification on the PR #277 HEAD passed; no live TiDB or Cloudflare staging UAT has been performed.

## Scope freeze

After PR #270, stop opening incremental approved-machine-copy hardening PRs unless a reproducible P0/P1 defect or a failing required test demonstrates a release blocker. Record other improvements as follow-up issues.

## Exit criteria

| Gate | Evidence required | Status |
| --- | --- | --- |
| Source integrity | `test` merge commit `e38596900cf0b67ff112a53d0f50f0d1f80aef35`; PR #277 HEAD `27438fe0aa82397f40ae412f1e14f50b563f77bc` passed 4 workflows | SOURCE CI PASS; POST-MERGE CHECK PENDING |
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
