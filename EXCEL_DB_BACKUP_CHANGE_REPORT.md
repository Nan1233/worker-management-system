# KTC Upgrade – Excel DB Sync + Backup/Recovery

## Excel → DB
- New endpoint: `POST /api/production/excel-sync` (Admin/Manager only).
- Shared approved report edit service used by Web and Excel sync.
- Optimistic concurrency via `expected_updated_at`.
- Period-lock and master-data validation preserved.
- Audit action: `REPORT_UPDATED_FROM_EXCEL`.
- Workbook `_KTC_SYNC` metadata is `veryHidden`.
- Desktop scans saved workbooks every 20 seconds.
- Yellow cells are the cells intended for Excel editing.
- Formula/summary cells never become DB input.
- Machine-mode Excel updates are restricted to training percent and note.
- Successful Excel updates trigger workbook rebuild from DB.

## Backup/Recovery
- Application-level full logical DB backup in consistent transaction snapshot.
- Chunked reads to bound RAM.
- Gzip compression.
- Optional AES-256-GCM encryption with scrypt-derived key.
- SHA-256 sidecar + manifest.
- Automated GFS-style retention: 14 daily / 8 weekly / 12 monthly.
- Verify command before restore.
- Restore requires explicit `--confirm KTC_RESTORE`; non-empty DB is rejected unless `--replace` is passed.
- Desktop Excel backups use matching 14/8/12 retention instead of compacting every completed month to only one file.

## Verification completed in artifact environment
- Backend verify/tests: 78/78 PASS.
- Frontend source tests: 8/8 PASS.
- Desktop source check + Excel↔DB contract: PASS.
- JavaScript/CJS syntax scan: 169 files, 0 errors.
- Dependency-backed frontend typecheck/build and ExcelJS workbook smoke still need `npm run install:all && npm run verify` on the target Windows machine because this artifact environment cannot fetch all registry packages.
