# KTC Pilot Hardening — 2026-08-10

## Changes
- Offline queue never silently deletes reports after 24h or truncates overflow. Stale reports become blocked/manual-review; capacity is rejected explicitly.
- Real-data validation now reconstructs machine-line defects/performance and reports coverage of critical real-world cases.
- Excel folder validation checks _KTC_SYNC metadata, report IDs and data/sync row consistency.
- Pilot readiness can check external live/ready endpoints and optionally run a staging restore rehearsal.

## Recommended pilot gate
Set KTC_PILOT_API_BASE, KTC_PILOT_EXCEL_DIR, KTC_PILOT_MONTH, KTC_PILOT_BACKUP_FILE. Set KTC_PILOT_RUN_RESTORE=1 only with staging restore environment configured. Then run `npm run pilot:readiness`.
