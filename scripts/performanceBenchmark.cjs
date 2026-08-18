#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { recordHttp, snapshot } = require('../backend/services/runtimeMetrics');

const REQUESTS = Number(process.env.KTC_PERF_BENCH_REQUESTS || 10000);
assert.ok(Number.isInteger(REQUESTS) && REQUESTS >= 1000 && REQUESTS <= 100000, 'KTC_PERF_BENCH_REQUESTS must be 1000..100000');

const started = performance.now();
for (let i = 0; i < REQUESTS; i += 1) {
  recordHttp({
    requestId: `bench-${i}`,
    method: i % 3 === 0 ? 'GET' : 'POST',
    path: i % 2 === 0 ? '/api/production-temp/my' : '/api/manager/reports',
    status: i % 97 === 0 ? 500 : (i % 43 === 0 ? 400 : 200),
    durationMs: 5 + (i % 120)
  });
}
const snapshotStarted = performance.now();
const result = snapshot();
const elapsedMs = performance.now() - started;
const snapshotMs = performance.now() - snapshotStarted;

assert.equal(result.http.requests, REQUESTS, 'metrics request count mismatch');
assert.ok(Number.isFinite(result.http.p50DurationMs), 'P50 must be numeric');
assert.ok(Number.isFinite(result.http.p95DurationMs), 'P95 must be numeric');
assert.ok(result.http.byRoute['GET /api/production-temp/my'], 'expected route bucket missing');
assert.ok(result.http.byRoute['POST /api/manager/reports'], 'expected route bucket missing');
assert.ok(result.http.byRoute['GET /api/production-temp/my'].p95Ms <= 1500, 'synthetic P95 exceeds budget');
assert.ok(elapsedMs < 2000, `metrics benchmark too slow: ${Math.round(elapsedMs)}ms`);
assert.ok(snapshotMs < 500, `metrics snapshot too slow: ${Math.round(snapshotMs)}ms`);

console.log(JSON.stringify({
  requests: REQUESTS,
  elapsedMs: Math.round(elapsedMs * 100) / 100,
  snapshotMs: Math.round(snapshotMs * 100) / 100,
  p50Ms: result.http.p50DurationMs,
  p95Ms: result.http.p95DurationMs,
  maxMs: result.http.maxDurationMs,
  routes: Object.keys(result.http.byRoute).length
}, null, 2));
console.log('[KTC] Performance benchmark PASS');
