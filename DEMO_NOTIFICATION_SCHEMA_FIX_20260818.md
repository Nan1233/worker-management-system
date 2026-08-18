# KTC Notification Schema Fix — 2026-08-18

## Problem
Production report creation returned 201, but the background notification task failed because the existing TiDB `notifications` table did not contain `link_url`, `entity_type`, and `entity_id`.

## Fix
- `auditService.ensureSchema()` now idempotently adds missing notification columns and the entity index.
- Notification writes call the schema guard before INSERT.
- Notification history/backfill routes call the same guard before SELECT/INSERT.
- Added migration `backend/database/migrations/027_notifications_runtime_columns.sql` for explicit database rollout/recovery.

## Expected result
Existing production databases self-repair the additive notification schema on the next backend request without changing existing report data.
