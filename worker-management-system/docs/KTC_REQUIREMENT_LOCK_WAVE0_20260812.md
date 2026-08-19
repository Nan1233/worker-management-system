# KTC Requirement Lock — Wave 0

Canonical business rules for release-gate validation.

## R2 — Backdate and network

- Worker reports may be submitted on any Internet path; the worker does **not** require KTC Wi-Fi.
- The canonical work-date window is today through today-14 inclusive (`today-14`).
- Future work dates and dates older than today-14 are rejected by the server.

## R3 — Process and machine policy

- MAI (Mài) may use multiple machines in one worker report.
- DO (Đo) and EP (Ép) are exactly one worker / one machine for the report-level machine policy.
- GC machines 5, 6, 7 and 11 follow the normal automatic-machine behavior.
- Shared-machine physical truth and worker credited output are separate accounting domains.
- Shared-machine capacity uses `maxWorkers = 4` where the process policy allows shared operation.

## R5 — Temporary report lifecycle

- Canonical lifecycle is pending -> rejected -> edit -> pending, with approval as the terminal transition to approved.
- There is No canonical need_fix workflow. Legacy `need_fix` values are read compatibility only.

## R6 — Excel contract

- The current monthly Excel contract produces 10 files/month.
- The current workbook layout uses `xSplit=4` and `ySplit=5` with `topLeftCell=E6`.
- Date separator rows are part of the canonical workbook layout.

## Release rule

Any change to the locked rules above must update this document and the corresponding backend/frontend/Excel contract tests in the same change set.
