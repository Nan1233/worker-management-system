'use strict';

const db = require('../config/db');
const { createStandardResolver } = require('../services/standardResolutionService');
const { calculateProductionOutput, isKqdDefect } = require('../../shared/kqdPolicy.cjs');

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function classificationFor(error) {
  if (error?.code === 'HISTORICAL_STANDARD_NOT_FOUND' || error?.code === 'HISTORICAL_MACHINE_STANDARD_NOT_FOUND') return 'UNRESOLVED';
  if (error?.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT') return 'REVIEW_REQUIRED';
  return 'REVIEW_REQUIRED';
}

async function loadDefects(table, foreignKey, reportId) {
  const [rows] = await db.promise().query(
    `SELECT d.defect_type_id, dt.defect_code, dt.defect_name, d.quantity
     FROM ${table} d
     LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
     WHERE d.${foreignKey}=? ORDER BY d.id`,
    [reportId]
  );
  return rows;
}

async function auditTable({ table, defectsTable, defectForeignKey, reportType }) {
  const [reports] = await db.promise().query(
    `SELECT id, process_id, work_date, product_name, operation_mode, machine_no,
            standard_output, standard_version_id, machine_standard_id,
            exclude_kqd_from_tt_snapshot, actual_output, tt_ok, tt_ng
     FROM ${table}
     ORDER BY id`
  );
  const resolver = createStandardResolver();
  const findings = [];
  for (const report of reports) {
    const defects = await loadDefects(defectsTable, defectForeignKey, report.id);
    const unknownLikeCodes = defects
      .map((item) => String(item.defect_code || '').trim().toUpperCase())
      .filter((code) => code.startsWith('KQD') && !isKqdDefect(code));
    if (unknownLikeCodes.length) {
      findings.push({ report_type: reportType, report_id: report.id, reason: 'KQD_FAMILY_CODE_AMBIGUOUS', classification: 'REVIEW_REQUIRED', defect_codes: [...new Set(unknownLikeCodes)] });
    }
    if (report.exclude_kqd_from_tt_snapshot === null || report.exclude_kqd_from_tt_snapshot === undefined) {
      findings.push({ report_type: reportType, report_id: report.id, reason: 'KQD_POLICY_UNKNOWN', classification: 'REVIEW_REQUIRED' });
      continue;
    }
    try {
      const resolved = await resolver.resolveStandard({
        processId: report.process_id,
        productCode: report.product_name,
        workDate: report.work_date
      });
      const expectedPolicy = Number(resolved.excludeKqdFromTt || 0) === 1 ? 1 : 0;
      const storedPolicy = Number(report.exclude_kqd_from_tt_snapshot) === 1 ? 1 : 0;
      if (expectedPolicy !== storedPolicy) {
        findings.push({ report_type: reportType, report_id: report.id, reason: 'KQD_HISTORICAL_POLICY_DRIFT', classification: 'AUTO_REPAIR_SAFE', stored_policy: storedPolicy, expected_policy: expectedPolicy });
      }
      const output = calculateProductionOutput({ ok: report.tt_ok, defects, excludeKqdFromTt: storedPolicy === 1 });
      const parentMismatch = Math.abs(num(report.actual_output) - output.actualOutput) > 0.000001 || num(report.tt_ng) !== output.totalNg;
      if (parentMismatch) {
        findings.push({
          report_type: reportType,
          report_id: report.id,
          reason: 'KQD_PARENT_DETAIL_MISMATCH',
          classification: 'AUTO_REPAIR_SAFE',
          stored_actual_output: num(report.actual_output),
          expected_actual_output: output.actualOutput,
          stored_tt_ok: num(report.tt_ok),
          expected_tt_ok: output.ttOk,
          stored_tt_ng: num(report.tt_ng),
          expected_tt_ng: output.totalNg
        });
        if (storedPolicy === 1 && num(report.actual_output) - num(report.tt_ng) !== output.ttOk) {
          findings.push({ report_type: reportType, report_id: report.id, reason: 'KQD_EDIT_CORRUPTION_CANDIDATE', classification: 'AUTO_REPAIR_SAFE' });
        }
      }
    } catch (error) {
      findings.push({ report_type: reportType, report_id: report.id, reason: error.code || 'KQD_POLICY_RESOLUTION_FAILED', classification: classificationFor(error) });
    }
  }
  return findings;
}


async function auditMachineLines({ lineTable, defectTable, reportTable, reportForeignKey, reportType }) {
  const [lines] = await db.promise().query(
    `SELECT ml.id, ml.${reportForeignKey} AS report_id, ml.machine_id, ml.machine_code, ml.product_code,
            ml.exclude_kqd_from_tt, ml.counted_output, ml.ok_quantity, ml.ng_quantity, r.process_id, r.work_date
     FROM ${lineTable} ml
     JOIN ${reportTable} r ON r.id=ml.${reportForeignKey}
     ORDER BY ml.id`
  );
  const resolver = createStandardResolver();
  const findings = [];
  for (const line of lines) {
    const [defects] = await db.promise().query(
      `SELECT defect_type_id, defect_code, defect_name, quantity FROM ${defectTable} WHERE machine_line_id=? ORDER BY id`,
      [line.id]
    );
    try {
      const resolved = await resolver.resolveStandard({
        processId: line.process_id,
        productCode: line.product_code,
        machineId: line.machine_id,
        machineCode: line.machine_code,
        workDate: line.work_date
      });
      const expectedPolicy = Number(resolved.excludeKqdFromTt || 0) === 1 ? 1 : 0;
      const storedPolicy = Number(line.exclude_kqd_from_tt || 0) === 1 ? 1 : 0;
      if (storedPolicy !== expectedPolicy) {
        findings.push({ report_type: reportType, report_id: line.report_id, machine_line_id: line.id, reason: 'KQD_HISTORICAL_POLICY_DRIFT', classification: 'AUTO_REPAIR_SAFE', stored_policy: storedPolicy, expected_policy: expectedPolicy });
      }
      const output = calculateProductionOutput({ ok: line.ok_quantity, defects, excludeKqdFromTt: storedPolicy === 1 });
      if (Math.abs(num(line.counted_output) - output.actualOutput) > 0.000001 || num(line.ng_quantity) !== output.totalNg) {
        findings.push({ report_type: reportType, report_id: line.report_id, machine_line_id: line.id, reason: 'KQD_PARENT_DETAIL_MISMATCH', classification: 'AUTO_REPAIR_SAFE', stored_actual_output: num(line.counted_output), expected_actual_output: output.actualOutput, stored_tt_ng: num(line.ng_quantity), expected_tt_ng: output.totalNg });
      }
      const ambiguous = defects.map((item) => String(item.defect_code || '').trim().toUpperCase()).filter((code) => code.startsWith('KQD') && !isKqdDefect(code));
      if (ambiguous.length) findings.push({ report_type: reportType, report_id: line.report_id, machine_line_id: line.id, reason: 'KQD_FAMILY_CODE_AMBIGUOUS', classification: 'REVIEW_REQUIRED', defect_codes: [...new Set(ambiguous)] });
    } catch (error) {
      findings.push({ report_type: reportType, report_id: line.report_id, machine_line_id: line.id, reason: error.code || 'KQD_POLICY_RESOLUTION_FAILED', classification: classificationFor(error) });
    }
  }
  return findings;
}

async function main() {
  const findings = [
    ...await auditTable({ table: 'production_reports_temp', defectsTable: 'production_temp_defects', defectForeignKey: 'temp_report_id', reportType: 'temp' }),
    ...await auditTable({ table: 'production_reports', defectsTable: 'production_report_defects', defectForeignKey: 'report_id', reportType: 'approved' }),
    ...await auditMachineLines({ lineTable: 'production_temp_machine_lines', defectTable: 'production_temp_machine_defects', reportTable: 'production_reports_temp', reportForeignKey: 'temp_report_id', reportType: 'temp_machine' }),
    ...await auditMachineLines({ lineTable: 'production_report_machine_lines', defectTable: 'production_report_machine_defects', reportTable: 'production_reports', reportForeignKey: 'report_id', reportType: 'approved_machine' })
  ];
  console.log(JSON.stringify({ read_only: true, finding_count: findings.length, findings }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ read_only: true, error: error.code || error.message }));
    process.exitCode = 1;
  }).finally(async () => {
    try { await db.promise().end(); } catch (_error) {}
  });
}

module.exports = { auditTable, auditMachineLines };
