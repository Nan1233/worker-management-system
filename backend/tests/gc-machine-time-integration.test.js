'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const hasDbEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].every(
  (name) => String(process.env[name] || '').trim()
);

const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

test('GC real-data integration: physical machine time and deductions match TiDB rows', {
  skip: !hasDbEnv ? 'DB_HOST/DB_USER/DB_PASSWORD/DB_NAME are not configured' : false
}, async () => {
  const db = require('../config/db');
  const month = /^\d{4}-\d{2}$/.test(String(process.env.KTC_GC_TEST_MONTH || ''))
    ? String(process.env.KTC_GC_TEST_MONTH)
    : '2026-09';

  const start = month + '-01';
  const [year, mon] = month.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, mon, 1));
  const next = nextDate.toISOString().slice(0, 10);

  try {
    const [reports] = await db.promise().query(
      `SELECT pr.id, pr.work_date, pr.shift, pr.worker_id, pr.operation_mode,
              pr.machine_no, pr.total_time, pr.actual_time, pr.deduction_time,
              w.worker_code, p.process_code
         FROM production_reports pr
         JOIN workers w ON w.id = pr.worker_id
         JOIN processes p ON p.id = pr.process_id
        WHERE UPPER(TRIM(p.process_code)) = 'GC'
          AND UPPER(TRIM(COALESCE(pr.operation_mode, ''))) = 'MACHINE'
          AND LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved'
          AND pr.work_date >= ? AND pr.work_date < ?
        ORDER BY pr.work_date DESC, pr.id DESC
        LIMIT 500`,
      [start, next]
    );

    assert.ok(reports.length > 0, `No approved GC MACHINE reports found for ${month}`);

    const reportIds = reports.map((row) => Number(row.id));
    const placeholders = reportIds.map(() => '?').join(',');

    const [lines] = await db.promise().query(
      `SELECT id, report_id, machine_event_id, machine_code,
              machine_time_hours, deduction_time_hours, deductions_json
         FROM production_report_machine_lines
        WHERE report_id IN (${placeholders})
        ORDER BY report_id, sort_order, id`,
      reportIds
    );

    const eventIds = [...new Set(
      lines.map((row) => Number(row.machine_event_id)).filter((id) => Number.isInteger(id) && id > 0)
    )];

    let events = [];
    if (eventIds.length) {
      const eventPlaceholders = eventIds.map(() => '?').join(',');
      [events] = await db.promise().query(
        `SELECT id, machine_code, work_date, shift, status, machine_time_hours
           FROM machine_production_events
          WHERE id IN (${eventPlaceholders})`,
        eventIds
      );
    }

    const linesByReport = new Map();
    for (const line of lines) {
      const id = Number(line.report_id);
      if (!linesByReport.has(id)) linesByReport.set(id, []);
      linesByReport.get(id).push(line);
    }

    const eventsById = new Map(events.map((row) => [Number(row.id), row]));

    let checked = 0;
    let physicalEventCases = 0;
    let fallbackCases = 0;
    let duplicateLinksChecked = 0;

    for (const report of reports) {
      const reportLines = linesByReport.get(Number(report.id)) || [];

      const physicalEventIds = reportLines
        .map((line) => Number(line.machine_event_id))
        .filter((id) => Number.isInteger(id) && id > 0);

      const uniquePhysicalEventIds = [...new Set(physicalEventIds)];
      duplicateLinksChecked += physicalEventIds.length - uniquePhysicalEventIds.length;

      let expectedGross = 0;
      let hasPhysicalEvent = false;
      const consumedEvents = new Set();

      for (const line of reportLines) {
        const eventId = Number(line.machine_event_id) || 0;
        const event = eventId ? eventsById.get(eventId) : null;
        if (event) {
          hasPhysicalEvent = true;
          if (!consumedEvents.has(eventId)) {
            consumedEvents.add(eventId);
            expectedGross += Math.max(0, Number(event.machine_time_hours) || 0);
          }
        } else {
          expectedGross += Math.max(0, Number(line.machine_time_hours) || 0);
        }
      }

      let expectedDeduction = 0;
      const seenDeductionKeys = new Set();
      for (const [index, line] of reportLines.entries()) {
        const eventId = Number(line.machine_event_id) || 0;
        const key = eventId ? `EVENT:${eventId}` : `LINE:${Number(line.id) || index}`;
        if (seenDeductionKeys.has(key)) continue;
        seenDeductionKeys.add(key);
        expectedDeduction += Math.max(0, Number(line.deduction_time_hours) || 0);
      }

      let legacyDeductions = [];
      if (expectedDeduction <= 0) {
        const [legacy] = await db.promise().query(
          `SELECT deduction_type_id, hours
             FROM production_report_deductions
            WHERE report_id = ?`,
          [Number(report.id)]
        );
        legacyDeductions = legacy.map((row) => ({
          deduction_type_id: Number(row.deduction_type_id) || undefined,
          hours: Math.max(0, Number(row.hours) || 0)
        }));
        expectedDeduction = legacyDeductions.reduce((sum, row) => sum + row.hours, 0);
      }

      if (expectedDeduction <= 0 && Number(report.deduction_time) > 0) {
        expectedDeduction = Math.max(0, Number(report.deduction_time) || 0);
      }

      if (!reportLines.length) {
        expectedGross = Math.max(0, Number(report.total_time) || 0);
      }

      const result = buildGiaCongMachineAccounting(
        {
          machineLines: reportLines,
          deductions: legacyDeductions,
          total_time: report.total_time,
          actual_time: report.actual_time,
          deduction_time: report.deduction_time
        },
        eventsById
      );

      assert.equal(result.grossHours, Number(expectedGross.toFixed(6)),
        `GC report ${report.id}: grossHours mismatch`);
      assert.equal(result.deductionHours, Number(expectedDeduction.toFixed(6)),
        `GC report ${report.id}: deductionHours mismatch`);
      assert.equal(result.netHours, Number(Math.max(0, expectedGross - expectedDeduction).toFixed(6)),
        `GC report ${report.id}: netHours mismatch`);

      if (hasPhysicalEvent) physicalEventCases += 1;
      else fallbackCases += 1;
      checked += 1;
    }

    assert.ok(checked > 0, `No approved GC MACHINE reports were checked for ${month}`);

    console.table([{
      month,
      approvedGcMachineReports: reports.length,
      reportsChecked: checked,
      physicalEventReports: physicalEventCases,
      machineLineFallbackReports: fallbackCases,
      duplicateEventLinksWithinReport: duplicateLinksChecked
    }]);
  } finally {
    await db.closePool().catch(() => {});
  }
});
