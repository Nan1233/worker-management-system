'use strict';

/**
 * Read-only audit of approved machine reports and machine lines for a date range.
 * Does not update or delete data. Reports TT>0 with missing machine hours/KH,
 * inconsistent line/report totals, and machine reports with no lines.
 *
 * Run from backend:
 *   AUDIT_FROM=2026-10-01 AUDIT_TO=2026-10-27 node scripts/auditMachineLinesRange.cjs
 */
require('dotenv').config();
let dbModule = null;
const getDb = () => (dbModule ||= require('../config/db'));

const FROM = process.env.AUDIT_FROM || '2026-10-01';
const TO = process.env.AUDIT_TO || '2026-10-27';
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const round = (v) => Math.round((v + Number.EPSILON) * 10000) / 10000;

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO) || FROM > TO) {
    throw new Error('AUDIT_FROM/AUDIT_TO must be valid YYYY-MM-DD dates and FROM <= TO');
  }
  const db = getDb();
  const [reports] = await db.promise().query(
    `SELECT pr.id, pr.worker_id, pr.process_id, p.process_code, p.process_name,
            pr.work_date, pr.shift, pr.status, pr.operation_mode, pr.machine_no,
            pr.actual_time, pr.total_time, pr.standard_output, pr.actual_output,
            pr.tt_ok, pr.tt_ng
       FROM production_reports pr
       LEFT JOIN processes p ON p.id=pr.process_id
      WHERE LOWER(TRIM(COALESCE(pr.status,'')))='approved'
        AND pr.work_date >= ? AND pr.work_date < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY pr.work_date, pr.id`,
    [FROM, TO]
  );
  const ids = reports.map(r => Number(r.id));
  let lines = [];
  if (ids.length) {
    const [rows] = await db.promise().query(
      `SELECT id, report_id, machine_event_id, machine_id, machine_code, product_code,
              machine_time_hours, standard_output, maximum_output, counted_output,
              ok_quantity, ng_quantity, earned_standard_hours, standard_source
         FROM production_report_machine_lines
        WHERE report_id IN (${ids.map(() => '?').join(',')})
        ORDER BY report_id, sort_order, id`,
      ids
    );
    lines = rows;
  }
  const byReport = new Map();
  for (const line of lines) {
    const key = Number(line.report_id);
    if (!byReport.has(key)) byReport.set(key, []);
    byReport.get(key).push(line);
  }

  const findings = [];
  for (const report of reports) {
    const reportLines = byReport.get(Number(report.id)) || [];
    const isMachine = String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE'
      || Boolean(String(report.machine_no || '').trim());
    const issues = [];
    if (isMachine && !reportLines.length) issues.push('MACHINE_REPORT_WITHOUT_LINES');
    for (const line of reportLines) {
      const output = n(line.counted_output) || (n(line.ok_quantity) + n(line.ng_quantity));
      if (output > 0 && n(line.machine_time_hours) <= 0) issues.push('OUTPUT_WITHOUT_MACHINE_HOURS');
      if (output > 0 && n(line.maximum_output) <= 0) issues.push('OUTPUT_WITHOUT_MAXIMUM_OUTPUT');
      if (n(line.machine_time_hours) > 12) issues.push('MACHINE_HOURS_OVER_12');
      if (n(line.ok_quantity) + n(line.ng_quantity) > 0 &&
          n(line.counted_output) > n(line.ok_quantity) + n(line.ng_quantity)) {
        issues.push('COUNTED_OUTPUT_EXCEEDS_OK_PLUS_NG');
      }
    }
    const lineOk = reportLines.reduce((s, l) => s + n(l.ok_quantity), 0);
    const lineNg = reportLines.reduce((s, l) => s + n(l.ng_quantity), 0);
    const lineCounted = reportLines.reduce((s, l) => s + n(l.counted_output), 0);
    const lineHours = reportLines.reduce((s, l) => s + n(l.machine_time_hours), 0);
    if (reportLines.length && n(report.tt_ok) + n(report.tt_ng) > 0 &&
        (Math.abs(lineOk - n(report.tt_ok)) > 0.01 || Math.abs(lineNg - n(report.tt_ng)) > 0.01)) {
      issues.push('REPORT_TOTALS_DIFFER_FROM_MACHINE_LINES');
    }
    if (reportLines.length && n(report.actual_time) > 0 && lineHours > 0 &&
        Math.abs(lineHours - n(report.actual_time)) > 0.01) {
      issues.push('REPORT_TIME_DIFFERS_FROM_MACHINE_HOURS');
    }
    if (issues.length) {
      findings.push({
        report_id: Number(report.id),
        work_date: String(report.work_date || '').slice(0, 10),
        worker_id: Number(report.worker_id),
        process_code: report.process_code || null,
        process_name: report.process_name || null,
        shift: report.shift || null,
        operation_mode: report.operation_mode || null,
        machine_no: report.machine_no || null,
        report_actual_time: round(n(report.actual_time)),
        report_total_time: round(n(report.total_time)),
        report_tt_ok: round(n(report.tt_ok)),
        report_tt_ng: round(n(report.tt_ng)),
        report_actual_output: round(n(report.actual_output)),
        machine_line_count: reportLines.length,
        line_hours: round(lineHours),
        line_ok: round(lineOk),
        line_ng: round(lineNg),
        line_counted_output: round(lineCounted),
        issues: [...new Set(issues)],
        machine_lines: reportLines.map(l => ({
          id: Number(l.id),
          machine_code: l.machine_code || null,
          product_code: l.product_code || null,
          machine_event_id: l.machine_event_id || null,
          machine_time_hours: round(n(l.machine_time_hours)),
          standard_output: round(n(l.standard_output)),
          maximum_output: round(n(l.maximum_output)),
          counted_output: round(n(l.counted_output)),
          ok_quantity: round(n(l.ok_quantity)),
          ng_quantity: round(n(l.ng_quantity)),
          standard_source: l.standard_source || null
        }))
      });
    }
  }
  const issueCounts = {};
  for (const row of findings) for (const issue of row.issues) issueCounts[issue] = (issueCounts[issue] || 0) + 1;
  process.stdout.write(JSON.stringify({
    success: true, read_only: true, from: FROM, to: TO,
    approved_report_count: reports.length,
    reports_with_issues: findings.length,
    issue_counts: issueCounts,
    findings
  }, null, 2) + '\n');
}
if (require.main === module) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({success:false,read_only:true,message:error.message},null,2)+'\n');
    process.exitCode = 1;
  }).finally(async () => {
    try { if (dbModule) await dbModule.end(); } catch {}
  });
}
module.exports = { main };
