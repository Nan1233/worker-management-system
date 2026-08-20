#!/usr/bin/env node
'use strict';

/**
 * Large-data read-path benchmark.
 * Read-only: never inserts/updates/deletes production data.
 *
 * Env:
 *   KTC_PERF_API_BASE        optional API base URL
 *   KTC_PERF_MIN_REPORTS     minimum report volume expected (default 10000)
 *   KTC_PERF_REQUESTS        API requests (default 200)
 *   KTC_PERF_CONCURRENCY     concurrency (default 20)
 *   KTC_PERF_P95_BUDGET_MS   P95 budget (default 1500)
 */
require('dotenv').config();
const { performance } = require('node:perf_hooks');
const db = require('../config/db');

const API_BASE = String(process.env.KTC_PERF_API_BASE || '').replace(/\/$/, '');
const MIN_REPORTS = Number(process.env.KTC_PERF_MIN_REPORTS || 10000);
const REQUESTS = Math.max(20, Math.min(2000, Number(process.env.KTC_PERF_REQUESTS || 200)));
const CONCURRENCY = Math.max(1, Math.min(100, Number(process.env.KTC_PERF_CONCURRENCY || 20)));
const P95_BUDGET = Number(process.env.KTC_PERF_P95_BUDGET_MS || 1500);

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] || 0;
}

async function sqlBench(pool) {
  const cases = [
    {
      name: 'approved-by-date',
      sql: `SELECT COUNT(*) AS total FROM production_reports WHERE work_date >= CURRENT_DATE - INTERVAL 30 DAY`,
    },
    {
      name: 'temp-by-date',
      sql: `SELECT COUNT(*) AS total FROM production_reports_temp WHERE work_date >= CURRENT_DATE - INTERVAL 14 DAY`,
    },
    {
      name: 'approval-join',
      sql: `SELECT p.id, p.work_date, p.process_id
            FROM production_reports p
            WHERE p.work_date >= CURRENT_DATE - INTERVAL 30 DAY
            ORDER BY p.work_date DESC, p.id DESC
            LIMIT 200`,
    },
  ];

  const results = [];
  for (const item of cases) {
    const samples = [];
    for (let i = 0; i < 10; i += 1) {
      const started = performance.now();
      await pool.promise().query(item.sql);
      samples.push(performance.now() - started);
    }
    results.push({
      name: item.name,
      p50Ms: Number(percentile(samples, 0.50).toFixed(2)),
      p95Ms: Number(percentile(samples, 0.95).toFixed(2)),
      maxMs: Number(Math.max(...samples).toFixed(2)),
    });
  }
  return results;
}

async function apiBench() {
  if (!API_BASE) return null;
  let cursor = 0;
  let failures = 0;
  const durations = [];
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= REQUESTS) return;
      const started = performance.now();
      try {
        const response = await fetch(`${API_BASE}/api/health/ready`, {
          headers: { 'cache-control': 'no-cache' },
          signal: AbortSignal.timeout(7000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch {
        failures += 1;
      } finally {
        durations.push(performance.now() - started);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return {
    requests: REQUESTS,
    concurrency: CONCURRENCY,
    failures,
    p50Ms: Number(percentile(durations, 0.50).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    p99Ms: Number(percentile(durations, 0.99).toFixed(2)),
    maxMs: Number(Math.max(...durations).toFixed(2)),
  };
}

async function main() {
  await db.testConnection();
  const [[counts]] = await db.promise().query(`
    SELECT
      (SELECT COUNT(*) FROM production_reports) AS approved_reports,
      (SELECT COUNT(*) FROM production_reports_temp) AS temp_reports,
      (SELECT COUNT(*) FROM workers) AS workers,
      (SELECT COUNT(*) FROM product_standards) AS product_standards
  `);

  console.log('[KTC] Large-data dataset:', counts);
  if (Number(counts.approved_reports) < MIN_REPORTS) {
    console.warn(`[KTC] WARNING: approved_reports=${counts.approved_reports} < MIN_REPORTS=${MIN_REPORTS}.`);
    console.warn('[KTC] The benchmark still ran, but it is not evidence of production-scale volume.');
  }

  const sql = await sqlBench(db);
  const api = await apiBench();
  const badSql = sql.filter(x => x.p95Ms > P95_BUDGET);
  const badApi = api && (api.failures > 0 || api.p95Ms > P95_BUDGET);

  const result = {
    generatedAt: new Date().toISOString(),
    dataset: counts,
    minReports: MIN_REPORTS,
    p95BudgetMs: P95_BUDGET,
    sql,
    api,
    pass: badSql.length === 0 && !badApi,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
  await db.closePool().catch(() => {});
}

main().catch(async error => {
  console.error('[KTC] Large-data performance FAIL:', error.stack || error.message);
  process.exitCode = 1;
  await db.closePool().catch(() => {});
});
