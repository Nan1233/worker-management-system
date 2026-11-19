# KTC Phase 2 — Part 2 of 10: Machine-event participant API contract

Date: 2026-11-19  
Branch: `refactor/ktc-local-cleanup`  
Status: **source fix and static contract verification complete; Node runtime test still pending**

## Issue and root cause

Backend `backend/routes/machineProductionEventRoutes.js` provides:

`POST /api/machine-production-events/:id/link-participants`

with `auth`, roles admin/manager/lead, permission `REPORT_APPROVE`.

`backend/controllers/machineProductionEventController.js` calls `service.linkParticipants` with `tempMachineLineIds: req.body?.temp_machine_line_ids || []`. The service validates/links **temporary machine-line IDs**, not worker IDs, in a transaction, with machine dimension matching and worker limits.

`frontend/src/services/productionService.ts` previously declared `linkMachineEventParticipants(eventId, participantIds)`, calling `POST /:id/participants` with `participant_ids`. That path and payload were inconsistent.

`frontend/src/pages/manager/MachineEventPanel.tsx` already called the correct `/:id/link-participants` endpoint with `temp_machine_line_ids`. Therefore the incorrect helper is not proof of a currently reproducible error in the visible manager panel; correcting it prevents future callers from making an incorrect request. GitHub code search found the helper name in the service and text-based contract tests, but did not identify a live panel call through that helper.

## Changes made

1. Changed helper to `linkMachineEventParticipants(eventId:number,tempMachineLineIds:number[])`.
2. Changed endpoint to `/machine-production-events/${eventId}/link-participants`.
3. Changed body to `{temp_machine_line_ids:tempMachineLineIds}`.
4. Added `frontend/tests/machine-event-participant-api.contract.test.cjs`: asserts helper endpoint, body, backend route/permission/controller contract, and manager panel alignment.

No changes to backend permissions, service, schemas, business logic, TiDB, or desktop Excel.

## Evidence

- Frontend fix commit: `f3de19b89ce26c0d3cad55562afc3543dab8ac6e`
- Test addition commit: `f6d170112d5c39d59de33d29ba13b77d0a982090`
- Independently re-fetched the resulting source using GitHub and evaluated 8 route/payload/permission/controller/panel regex checks in the connector runtime: **8/8 passed**.
- Node test not run because direct GitHub checkout unavailable from current execution container; do NOT call this a unit-test PASS or production approval.

## Test command (isolated checkout)

```bash
cd frontend
node --test tests/machine-event-participant-api.contract.test.cjs
npm run typecheck
```

Run frontend suite/build as part of the broader baseline gate once safe checkout/dependencies are available.

## Acceptance & next step

**Implementation done; runtime verification pending.** Do not merge/deploy until Node test + typecheck + applicable regression gates pass. User requested 10 sequential parts. Next part is Part 3: remove row-index dependence and unsafe DOM mutation from manager report workspace, with behavioral preservation and contract tests.
