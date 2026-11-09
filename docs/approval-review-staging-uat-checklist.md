# KTC approval/rejection integration UAT checklist (staging only)

This is a **manual execution plan**, not evidence that live TiDB/Cloudflare checks have passed. Use dedicated test accounts and disposable staging records. Never run against production or overwrite approved historical data.

## Preconditions
- Record frontend/backend commit SHAs, backend schema version, test environment URL, and execution timestamp.
- Confirm a staging TiDB database, backup/restore plan, isolated test workers, and reviewer accounts for admin, manager with process scope, manager without process scope, lead, and worker.
- Use two independent browser sessions to reproduce concurrency. Capture redacted request IDs and response status codes; never include tokens or personal data in evidence.

## Cases
| ID | Scenario | Expected result | Evidence |
| --- | --- | --- | --- |
| A01 | Manager approves one pending report within assigned process | One approved parent, source status approved, matching machine lines/defects/deductions and version snapshots | Parent/source IDs, detail counts, sanitized API response |
| A02 | Manager attempts another process | Denied, no source or approved rows changed | HTTP status and before/after counts |
| A03 | Admin approves pending report | Allowed regardless of manager_processes membership | Source/approved IDs |
| A04 | Worker attempts approval/rejection | Denied, no mutation | HTTP status |
| A05 | Two reviewers approve same source concurrently | At most one succeeds; other gets conflict; exactly one approved parent | Two HTTP responses, source_temp_id uniqueness query |
| A06 | Reviewer submits stale updated_at | 409 conflict, no partial approved report | HTTP status, before/after counts |
| A07 | Batch includes unauthorized or already processed ID | Entire transaction fails closed; no partial approvals | HTTP status, source/approved counts |
| A08 | Approved multi-machine report with defects | Each defect references the correct approved machine_line_id; output not double counted | Per-machine lineage and totals |
| A09 | Reject pending report | Source status and audit updated; no approved parent | Source row and audit |
| A10 | Reject stale or concurrently changed report | Conflict; no partial status changes | HTTP status and source row |
| A11 | Inject transactional write/read failure in disposable staging | Rollback leaves no approved parent/detail or status transition | Transaction logs and counts |
| A12 | Simulate notification provider failure after successful commit | Approval remains committed; failure logged for retry/operations | Sanitized logs and status |
| A13 | Verify historical standard/training snapshots | Approved snapshot matches work-date standard; no retrospective mutation | Snapshot fields and standard version |
| A14 | Export approved report to monthly Excel | Correct process sheet, machine details, NG/deduction totals, no duplicate output | Redacted workbook sample |

## Exit criteria
- All applicable cases executed with recorded pass/fail, environment SHA and timestamp.
- Zero unresolved critical data integrity, authorization, or concurrency failures.
- Both required GitHub CI workflows green on the exact release candidate SHA.
- Separate explicit approval before production deployment or live database changes.

## Execution log template
| Case | Status (Not run/Pass/Fail/Blocked) | Date | Tester | Evidence link | Defect ID |
| --- | --- | --- | --- | --- | --- |
| A01–A14 | Not run | | | | |

Do not mark any case Pass without executing it in the stated environment.
