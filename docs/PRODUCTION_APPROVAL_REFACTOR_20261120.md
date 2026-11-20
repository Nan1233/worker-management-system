# Backend approval/rejection refactor — 2026-11-20

## Scope

`backend/models/productionTempApprovalModel.js` is now an **8-line compatibility facade** exporting the unchanged `approveSelected(targets, reviewerId, isAdmin?, options?)` and `rejectSelected(targets, reviewerId, reason, isAdmin?)` entry points. It previously contained approximately 517 lines of intertwined SQL, historical snapshots, transaction orchestration and side effects.

## Module ownership

| File | Responsibility |
| --- | --- |
| `productionApprovalWorkflow.js` | Approval transaction, permissions/optimistic-version selection, snapshot validation, report creation, audit, commit |
| `productionRejectionWorkflow.js` | Atomic rejection selection, version check, status update, audit and notification |
| `productionApprovalMachineCopy.js` | Copy machine lines and defects in statement order; verify persisted identity and avoid duplicate physical output |
| `productionApprovalMachineQueries.js` | Deterministic parameterized SQL for machine-line and defect operations |
| `productionApprovedMachineLineVerification.js` | Fail-closed comparison of approved machine lines, precise decimals and source lineage |
| `productionApprovalSnapshotValidation.js` | Validate historical saved standards and approved machine production events before insert |
| `productionApprovalPersistence.js` | Parent insert, deductions/defects copy, sequential TiDB reads, legacy v1 snapshot |
| `productionApprovalReviewSideEffects.js` | Report version history inside transaction, rollback on errors and post-commit notifications |
| `productionApprovalReviewBuilders.js` | Pure transition assertions, audit/notification payloads and response builders |
| `productionTempApprovalSelection.js` | Batch ID normalization, permission visibility, stale/version conflicts |
| `productionTempApprovalQueries.js` | Existing scoped approval/rejection and parent-detail SQL contracts |

## Critical invariants retained

- Reviewer permissions are scoped by assigned processes; admin scope is explicit.
- Approval rejects stale selections and conflicting `expected_updated_at` versions.
- All report, child lines, snapshot versions and audit writes share the same TiDB transaction.
- TiDB transaction-bound statements run **sequentially**; do not add `Promise.all()` on one connection.
- Machine production events, machine-line copied IDs and decimal values are verified *fail closed* before committing.
- Historical standard identity and `standard_output` snapshots remain immutable and checked.
- Physical machine quantity and worker-credited production remain separate.
- Temp report status update must affect **exactly one** row; otherwise the whole approval rolls back.
- Rejection requires a nonempty reason, performs an optimistic version check and keeps its version/activity writes in the same transaction.
- Notifications are delivered only after commit (or registered with the owner of an external transaction).
- For a caller-owned transaction, a `postCommitCallbacks` array is **required before any DB write**, rather than raising that error after writes have begun.
- Rollback failures are recorded without masking the original approval/rejection error.

## Review performed

Reviewed the extracted functions and verified by repository source inspection that both public method names remain exported. A static file existence audit covered **45 relative imports across seven refactored entry modules**, with no missing paths in the inspected backend directories. This does **not** establish runtime correctness.

## Validation still required before production

Per the user's earlier request to focus on code changes first, no tests, typechecks/builds, database queries or deployed Cloudflare requests were executed for this refactor. Before merging, verify transaction rollback/races, TiDB shared-connection behavior, saved historical standard snapshots, GC shared-machine accounting, notification timing, and approval/rejection endpoint contracts.

Branch: `refactor/ktc-local-cleanup`. No merge/deploy or production DB modifications.
