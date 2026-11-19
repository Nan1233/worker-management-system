# KTC Phase 2 — Part 4/10: Worker ProcessPage refactor

Date: 2026-11-19; branch `refactor/ktc-local-cleanup`.

## Source findings

- `frontend/src/pages/worker/ProcessPage.tsx` was 1,569 source lines before this change.
- It already delegates master data, worker profile, autosave/restore, machine-line lookup, aggregation, validation and submission payload construction to other dedicated modules.
- Two side-effect responsibilities remained inline: resolving the single-product standard and surfacing a one-time local draft-save warning.
- Submission anti-duplicate lock, `clientRequestIdRef`, multi-machine validation, split-report logic and `buildProductionReportPayloads` are sensitive and are intentionally left unchanged.

## Changes

1. Added `useProcessSingleStandardLookup.ts` to own standard resolution. Existing behavior retained: no request without product/date, current selection only, positive standard overwrite only, manual standard preserved on lookup failure.
2. Added `useProcessDraftSaveWarning.ts` to own the local storage failure event listener, one-time toast and cleanup on unmount.
3. Updated `ProcessPage.tsx` to call both hooks and remove inline effects; file reduced to ~1,538 lines.
4. Added `frontend/tests/f02-process-form-extracted-hooks.test.cjs`: simulated delayed standard responses, selection changes, failed lookup, warning deduplication and listener cleanup, plus source contract for untouched submission path.

## Verification

Re-fetched all changed files on GitHub and checked 13 independent source invariants: **13/13 true**. This is static verification, not a test runner result.

**Not run:** Node test, TypeScript compile, lint, browser flow, DB integration. No checkout/dependencies are available in the execution container, and direct GitHub access from that container is blocked.

To verify in isolated checkout:

```bash
cd frontend
node --test tests/f02-process-form-extracted-hooks.test.cjs
npm run typecheck
npm run lint
```

Then test worker entry: standard lookup with product change mid-request, manual fallback on error, draft-save failure toast once, reload/restored draft, submit idempotency, split machine lines and offline queue. Do not use shared TEST/production DB.

## Acceptance

**Part 4 source refactor: implemented and source-verified. Full Part 4 acceptance: pending runtime/browser gates D-08 and D-09.**

Unresolved items are tracked in `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`. On final consolidated verification, skip checks that already have a recorded PASS on unchanged commit; re-run only impacted checks.

No schema, backend, template, approved-report data, deploy or production changes.
