# KTC Worker Management System - Fix Report (2026-08-09)

## Fixed
- Standardized `training_percent` as 0..100 percent: missing/blank/invalid defaults to 100; zero remains zero.
- Updated Desktop monthly Excel tests for `buildSplitMonthlyWorkbooksLocal` and current summary/reconciliation smoke coverage.
- Added Render worker npm script (`node worker.js`) to match `render.yaml`.
- Initialized persistent Excel export job recovery after a successful database startup check.
- Aligned legacy Excel sort order to report date -> approval/entry time -> worker -> machine -> id.
- Added backend regression tests for training percent and Render/queue startup contracts.
- Added root monorepo scripts: `install:all`, `verify`, `build:exe`.

## Validation performed in the sandbox
- Backend tests: 68/68 PASS.
- Backend source check: PASS (108 JavaScript files in the pre-final run; additional test file is source-only).
- Frontend source tests: 5/5 PASS.
- Desktop syntax check: PASS.
- Repository-wide JS/CJS syntax check: PASS.

## Environment limitation
`npm ci` could not complete in the sandbox because the internal package registry returned HTTP 404 for `zip-stream@4.1.1`. Therefore dependency-backed frontend lint/typecheck/build and the ExcelJS smoke/build EXE must be run on the target machine after `npm run install:all`.
