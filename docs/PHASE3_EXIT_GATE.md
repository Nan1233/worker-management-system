# KTC Phase 3 Exit Gate — evidence-first handoff

Status: **NOT YET ACCEPTED**. This document defines a finite exit decision, not a claim that live TiDB or Cloudflare checks have passed.

## Scope freeze

After PR #270, stop opening incremental approved-machine-copy hardening PRs unless a reproducible P0/P1 defect or a failing required test demonstrates a release blocker. Record other improvements as follow-up issues.

## Exit criteria

| Gate | Evidence required | Status |
| --- | --- | --- |
| Source integrity | Exact `test` commit SHA and both required workflows successful on that SHA | PENDING |
| Business regression | Approve/reject/edit, RBAC, historical standard snapshots, decimal precision, machine/worker credit, NG associations | PENDING |
| GC shared machines | Physical machine output and machine hours counted once, worker credits tracked separately | PENDING |
| Desktop Excel | Monthly export smoke, totals, dates, dynamic NG/deductions, sync metadata, no duplicate shared-machine hours | PENDING |
| Security | No privilege escalation, secrets in source, or unauthorized export | PENDING |
| Staging readiness | Isolated non-production TiDB, migration/restore plan, credentials and test identities verified | PENDING |

Phase 3 source acceptance requires the first five gates PASS, with dated evidence linked to the exact commit. Staging readiness may be handed off as a Phase 4 prerequisite, but **Phase 4 UAT cannot pass without real isolated staging verification**.

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
