# TiDB read-path audit — baseline and safe rollout

## Current source findings
- `controllers/managerApprovedReportsController.js`: paginates (default 20, max 100), but uses a correlated `NOT EXISTS` with `JSON_EXTRACT(split_child.extra_data, '$.split_from_report_id')`; the plan and row estimates need checking. Search predicates use `CAST(... AS CHAR) LIKE '%term%'` and are not normally B-tree sargable.
- `controllers/productionController.js`: `getAllReports` and `getReportsByDate` return unbounded approved rows; `getReportDates` uses DISTINCT date with a split-child exclusion. Changing these endpoints requires a backward-compatibility review before pagination.
- `services/bulkCompanyExcelDataService.js`: loads monthly parent rows and batches child details by report IDs (default 1000); it is not a simple per-row N+1 implementation. Measure the count/latency of the batched queries and verify index coverage.
- `controllers/managerApprovedReportsController.js` executes separate count and page queries. Benchmark both; count may dominate for broad filters.

## Reproducible baseline (read-only)
Use a test DB clone with representative production-sized data. Never put credentials in committed files.

```sh
cd backend
KTC_PERF_DATE=2026-10-30 KTC_PERF_PROCESS_ID=1 KTC_PERF_WORKER_ID=1 \
KTC_PERF_ITERATIONS=10 KTC_PERF_EXPLAIN_ANALYZE=1 \
node scripts/auditTidbReadPerformance.cjs > perf-before.json
```

The script performs only `SELECT`, `EXPLAIN`, `EXPLAIN ANALYZE SELECT`, and reads `information_schema.statistics`. EXPLAIN ANALYZE **executes** each SELECT and can consume substantial resources; start on a clone. The worker ID/date/process must exist in the chosen dataset for representative results. The benchmark returns index definitions, plan, actual plan, p50 and p95. Use exactly the same DB snapshot, parameters, iteration count and comparable warm-up conditions for `perf-after.json`.

## Index candidates — do NOT apply without EXPLAIN + duplicate-prefix review
- `production_reports(work_date, process_id, status, created_at)` for date/process lists; compare alternative column orders against selectivity and sort.
- `production_reports(worker_id, work_date, status)` for worker history.
- `production_reports_temp(work_date, process_id, id)` for pending lists.
- `production_report_machine_lines(report_id, sort_order, id)` for Excel detail batch.
- `production_report_deductions(report_id)` and `production_report_defects(report_id)` for Excel detail batch.

Check `information_schema.statistics` before any ADD INDEX. Existing indexes with matching left prefixes may already cover the use case. JSON split-child exclusion likely needs a separate schema/design discussion; do not silently rewrite semantics.

## Acceptance
1. Capture baseline and post-change `EXPLAIN ANALYZE` with same data and SQL parameters.
2. Compare p50/p95, rows scanned, memory, and plan operators.
3. Confirm identical ordered report IDs and Excel output metrics before/after.
4. Check manager/lead process scope and worker ownership with HTTP tests.
5. Roll out any index only after review of TiDB write overhead and duplicate index prefixes.

**Current status:** source review and instrumentation completed; no live TiDB measurement, DDL, index deletion, or production change has been performed.
