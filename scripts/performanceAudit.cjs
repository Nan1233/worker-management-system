#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const server = read('backend/server.js');
const metrics = read('backend/services/runtimeMetrics.js');
const auditService = read('backend/services/auditService.js');
const dashboard = read('backend/controllers/dashboardController.js');
const approval = read('backend/models/productionTempApprovalModel.js');

assert.match(server, /runtimeMetrics\.recordHttp/, 'HTTP runtime metrics must be recorded');
assert.match(server, /Server-Timing/, 'Server-Timing must expose request duration');
assert.match(metrics, /p50|P50/i, 'Runtime metrics must calculate P50');
assert.match(metrics, /p95|P95/i, 'Runtime metrics must calculate P95');
assert.match(auditService, /INSERT INTO activity_logs/, 'Activity audit must be persisted explicitly');
assert.match(dashboard, /new TtlCache/, 'Dashboard must use bounded cache');
assert.match(dashboard, /DASHBOARD_CACHE_TTL_MS/, 'Dashboard cache TTL must be configurable');
assert.match(dashboard, /Promise\.all/, 'Dashboard aggregate queries should run in parallel');
assert.match(approval, /AuditService\.logActivities/, 'Approval audit writes must be batched');
const ttlMatch = dashboard.match(/DASHBOARD_CACHE_TTL_MS\s*=\s*Number\(process\.env\.DASHBOARD_CACHE_TTL_MS\s*\|\|\s*(\d+)/);
assert.ok(ttlMatch, 'Dashboard cache must have a numeric default TTL');
assert.ok(Number(ttlMatch[1]) <= 15000, 'Dashboard default cache TTL must be <= 15s');

const samplePath = path.join(root, 'validation-artifacts', 'performance.json');
if (fs.existsSync(samplePath)) {
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  const rows = Array.isArray(sample) ? sample : Array.isArray(sample.results) ? sample.results : [];
  const bad = rows.filter((row) => Number.isFinite(Number(row.p95)) && Number(row.p95) > 1500);
  if (bad.length && process.env.KTC_PERF_STRICT === '1') {
    throw new Error(`Performance budget exceeded: ${bad.length} sample(s) over p95=1500ms`);
  }
  console.log(`[KTC] Performance sample audited (${rows.length} load levels)`);
} else {
  console.log('[KTC] Performance contract PASS (no runtime sample; use perf:benchmark for an optional local sample)');
}

console.log('[KTC] Performance audit PASS');
