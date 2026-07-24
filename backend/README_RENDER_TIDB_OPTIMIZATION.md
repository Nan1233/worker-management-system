# KTC Backend – Render & TiDB optimization

## Changes included

- TiDB pool no longer connects while modules are imported. Startup explicitly verifies the database.
- Render web pool defaults to 6 connections; worker defaults to 3.
- Dashboard aggregate queries run concurrently and cache each user/date range for 30 seconds.
- Conditions such as `DATE(work_date) = ?` were replaced by `work_date = ?` because `work_date` is a DATE column; indexes can now be used directly.
- CORS origins are configurable through `CORS_ORIGINS`.
- Added request IDs, slow/error request logging, health check and graceful shutdown.
- Production installs omit dev dependencies.
- Added safe scripts that check `information_schema` before creating indexes.
- Removed committed `node_modules` and runtime-only unused `@types/express`.

## Local verification

```cmd
npm ci
npm run check
```

## Deploy Render

Set all secrets in Render Environment. Do not commit `.env`.

Required:

```env
DB_HOST=...
DB_PORT=4000
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_SSL=true
JWT_SECRET=...
JWT_REFRESH_SECRET=...
CORS_ORIGINS=http://localhost:5173,https://worker-management-system-3-dzox.onrender.com
```

Recommended:

```env
DB_CONNECTION_LIMIT=6
DB_MAX_IDLE=3
DB_IDLE_TIMEOUT=60000
DB_QUEUE_LIMIT=100
DASHBOARD_CACHE_TTL_MS=30000
INLINE_SYNC_TRIGGER=false
```

The separate Render background worker processes Google Sheet synchronization. Keeping `INLINE_SYNC_TRIGGER=false` prevents the web service and worker from doing the same heavy job simultaneously.

## Optimize TiDB indexes

Back up the database first, then run once from a trusted machine using the production environment variables:

```cmd
npm run db:indexes
npm run db:analyze
```

The index script is idempotent: it checks table and index existence before creating anything.

## Verify query usage

Use TiDB SQL console for important queries:

```sql
EXPLAIN ANALYZE
SELECT COUNT(*)
FROM production_reports
WHERE status = 'approved'
  AND work_date BETWEEN '2026-07-01' AND '2026-07-31'
  AND process_id = 1;
```

Look for an index range scan using one of the new composite indexes instead of a full table scan.

## Health check

```text
GET /api/health
```

Expected:

```json
{"success":true,"service":"ktc-api","database":"ok"}
```

## Quy tắc công thức KQĐ

`exclude_kqd_from_tt` nằm tại `product_standards` và được xác định bằng `process_id + product_code`.
Không dùng `machine_code` để quyết định công thức TT. Chạy migration:

```bash
mysql < migrations/20260724_move_kqd_rule_to_product.sql
```
