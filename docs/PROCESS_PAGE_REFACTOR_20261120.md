# ProcessPage frontend refactor — 2026-11-20

## Scope

Refactored `frontend/src/pages/worker/ProcessPage.tsx` from 1,056 to 571 lines. Page-level responsibilities now focus on choosing the process, composing hooks, and rendering form sections. Existing process-specific logic and specialized UI sections remain in their established modules.

## Newly isolated responsibilities

| Hook | Responsibility |
| --- | --- |
| `useProcessSubmission.ts` | Validate before submit; generate idempotent report payloads; handle 429, 409 duplicate challenges, transient network errors and durable remaining-machine queues |
| `useProcessDuplicateActions.ts` | Confirm create or update against the original form signature; protect a completed primary report from resubmission; persist pending split reports; guard cancel |
| `useProcessReset.ts` | Confirm destructive reset; preserve worker identity; invalidate stale draft autosaves; reset machine and NG/deduction inputs |
| `useProcessInputActions.ts` | Ordinary form input updates and clearing zero-valued numeric inputs on blur |
| `useProcessModeResets.ts` | Existing CUT/LONG, MANUAL/MACHINE and process-switch clearing rules; respect draft restoration |
| `useProcessEntryState.ts` | Selected NG and deductions, expanded UI controls, sending status and validation message |
| `useProcessDraftLifecycle.ts` | Compose existing draft restoration and autosave in the original hook order |

Existing domain modules are unchanged: `processFullFormValidation.ts`, `processReportSubmission.ts`, `processMachineReportQueue.ts`, `processSubmitBatchSlices.ts`, `useProcessMachineLineActions.ts`, and the process-specific UI components.

## Contracts preserved by the extraction

- Local form validation precedes network calls, showing the first validation error.
- Report retries retain the original `client_request_id`; confirmed primary reports are not sent twice.
- A 409 duplicate challenge is tied to the entire form signature (machine lines, modes, deductions and NG included).
- Approved duplicates are not offered the edit-existing path.
- Offline and transient-network failures durably queue only the unsent suffix of a multi-machine submission.
- A user cannot discard the unsent suffix after the primary report was already confirmed.
- Draft autosaves are invalidated before clearing submitted/reset reports.
- Form reset retains the authenticated worker's code, name and training percentage.
- GC shared-machine accounting and process-specific input validation remain in existing helpers.

## Verification status

This was a source-level structural refactor only. The branch has not been built, typechecked, unit tested or manually tested in a browser, per the user's earlier instruction to modify code before testing. A static review confirmed that the submission, duplicate-confirmation, cancellation and reset callbacks remain connected to their UI components, and the seven new hooks are wired into `ProcessPage.tsx`.

Do not merge or deploy the branch until TypeScript/build and real worker-report submission checks have passed.
