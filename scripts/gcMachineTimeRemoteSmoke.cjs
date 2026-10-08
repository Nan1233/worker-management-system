#!/usr/bin/env node
'use strict';

/**
 * Read-only remote GC machine-accounting smoke test.
 *
 * Talks to the TEST Cloudflare Worker, logs in as a manager, downloads the
 * company-data payload, then independently checks the GC MACHINE reports:
 *   - one physical machine event is counted once per report
 *   - machine-line fallback is used when no event is linked
 *   - deduction time is taken from machine lines/events, with legacy fallback
 *   - netHours = max(0, grossHours - deductionHours)
 *
 * Required environment:
 *   KTC_CLOUDFLARE_API_URL
 *   KTC_E2E_MANAGER_USERNAME
 *   KTC_E2E_MANAGER_PASSWORD
 *
 * Optional:
 *   KTC_E2E_DATE=2026-09-01
 */
const { Client } = require('./zero-cost/http.cjs');

const base = String(process.env.KTC_CLOUDFLARE_API_URL || '').replace(/\/$/, '');
const username = String(process.env.KTC_E2E_MANAGER_USERNAME || '').trim();
const password = String(process.env.KTC_E2E_MANAGER_PASSWORD || '');
const date = /^\d{4}-\d{2}-\d{2}$/.test(String(process.env.KTC_E2E_DATE || ''))
  ? String(process.env.KTC_E2E_DATE)
  : '2026-09-01';

function fail(message) {
  throw new Error(message);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function positive(value) {
  return Math.max(0, num(value));
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function expectedAccounting(report) {
  const lines = Array.isArray(report?.machineLines) ? report.machineLines : [];
  const eventLines = Array.isArray(report?.eventLines) ? report.eventLines : [];
  const eventsById = new Map(
    eventLines
      .map((event) => [Number(event?.id), event])
      .filter(([id]) => Number.isInteger(id) && id > 0)
  );

  const seenEvents = new Set();
  const seenDeductionKeys = new Set();
  let grossHours = 0;
  let deductionHours = 0;

  for (const [index, line] of lines.entries()) {
    const eventId = Number(line?.machine_event_id) || 0;
    const event = eventId ? eventsById.get(eventId) : null;

    if (event) {
      if (!seenEvents.has(eventId)) {
        seenEvents.add(eventId);
        grossHours += positive(event.machine_time_hours);
      }
    } else {
      grossHours += positive(line?.machine_time_hours);
    }

    const deductionKey = eventId
      ? `EVENT:${eventId}`
      : `LINE:${Number(line?.id) || index}`;

    if (seenDeductionKeys.has(deductionKey)) continue;
    seenDeductionKeys.add(deductionKey);
    deductionHours += positive(line?.deduction_time_hours);
  }

  // Legacy reports may still carry deduction rows outside machine lines.
  if (deductionHours <= 0) {
    const legacy = Array.isArray(report?.deductions) ? report.deductions : [];
    deductionHours = legacy.reduce((sum, item) => sum + positive(item?.hours), 0);
  }

  return {
    grossHours: Number(grossHours.toFixed(6)),
    deductionHours: Number(deductionHours.toFixed(6)),
    netHours: Number(Math.max(0, grossHours - deductionHours).toFixed(6))
  };
}

async function main() {
  if (!base) fail('KTC_CLOUDFLARE_API_URL is required');
  if (!username || !password) {
    fail('KTC_E2E_MANAGER_USERNAME and KTC_E2E_MANAGER_PASSWORD are required');
  }

  const client = new Client(base);

  let response = await client.req('GET', '/api/health/ready');
  if (response.status !== 200 || response.data?.schemaReady !== true) {
    fail(`TEST Worker is not ready: HTTP ${response.status}`);
  }

  response = await client.req('POST', '/api/auth/login', {
    username,
    password,
    access_type: 'management'
  });
  if (response.status !== 200 || !client.token) {
    fail(`Manager login failed: HTTP ${response.status}`);
  }

  response = await client.req(
    'GET',
    `/api/reports/export-excel/company-data?date=${encodeURIComponent(date)}`
  );

  if (response.status !== 200) {
    fail(`Company data API failed: HTTP ${response.status}`);
  }

  const data = response.data?.data;
  const gc = data?.processes?.GC;
  const reports = Array.isArray(gc?.reports) ? gc.reports : [];

  if (!reports.length) {
    fail(`No GC reports returned for ${date.slice(0, 7)}`);
  }

  const results = [];
  let checked = 0;
  let machineEventReports = 0;
  let machineLineFallbackReports = 0;
  let duplicateEventLinks = 0;

  for (const report of reports) {
    if (String(report?.operation_mode || '').toUpperCase() !== 'MACHINE') continue;

    const actual = report.machineAccounting;
    if (!actual) {
      results.push({
        report_id: report.id,
        result: 'FAIL',
        reason: 'machineAccounting missing'
      });
      continue;
    }

    const expected = expectedAccounting(report);
    const ok =
      Number(actual.grossHours) === expected.grossHours &&
      Number(actual.deductionHours) === expected.deductionHours &&
      Number(actual.netHours) === expected.netHours;

    const eventIds = (Array.isArray(report.machineLines) ? report.machineLines : [])
      .map((line) => Number(line?.machine_event_id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const unique = new Set(eventIds);
    duplicateEventLinks += eventIds.length - unique.size;

    if (actual.source === 'MACHINE_EVENT') machineEventReports += 1;
    if (actual.source === 'MACHINE_LINE') machineLineFallbackReports += 1;

    results.push({
      report_id: report.id,
      date: String(report.work_date || '').slice(0, 10),
      worker: report.worker_code,
      machine: report.machine_no,
      source: actual.source,
      expectedGross: expected.grossHours,
      actualGross: Number(actual.grossHours),
      expectedDeduction: expected.deductionHours,
      actualDeduction: Number(actual.deductionHours),
      expectedNet: expected.netHours,
      actualNet: Number(actual.netHours),
      result: ok ? 'PASS' : 'FAIL'
    });

    if (ok) checked += 1;
  }

  const failures = results.filter((row) => row.result === 'FAIL');

  console.table(results.slice(0, 100));
  console.log(JSON.stringify({
    date,
    gcReportsReturned: reports.length,
    gcMachineReports: results.length,
    checked,
    failures: failures.length,
    machineEventReports,
    machineLineFallbackReports,
    duplicateEventLinks,
    dataSource: data?.dataSource || null
  }, null, 2));

  if (failures.length) {
    console.error('KTC_GC_REMOTE_SMOKE=FAIL');
    process.exitCode = 1;
  } else {
    console.log('KTC_GC_REMOTE_SMOKE=PASS');
  }

  await client.req('POST', '/api/auth/logout', {}).catch(() => undefined);
}

main().catch((error) => {
  console.error('KTC_GC_REMOTE_SMOKE_FATAL', error.stack || error.message);
  process.exitCode = 1;
});
