#!/usr/bin/env node
const db = require('../config/db');
const { resolveStandard } = require('../services/standardResolutionService');

const same = (a,b) => Math.abs(Number(a)-Number(b)) <= 0.000001;

function classifyError(error) {
  if (error?.code === 'STANDARD_EFFECTIVE_RANGE_CONFLICT') return 'REVIEW_REQUIRED';
  if (error?.code === 'HISTORICAL_STANDARD_NOT_FOUND' || error?.code === 'HISTORICAL_MACHINE_STANDARD_NOT_FOUND') return 'UNRESOLVED';
  return 'REVIEW_REQUIRED';
}

async function auditTable(table, lineTable, reportKey) {
  const [reports] = await db.promise().query(
    `SELECT id, process_id, work_date, operation_mode, machine_no, product_name,
            standard_output, standard_version_id, machine_standard_id
     FROM ${table}
     WHERE product_name IS NOT NULL AND TRIM(product_name)<>''
     ORDER BY id`
  );
  const findings = [];
  for (const report of reports) {
    const isMachine = String(report.operation_mode || '').toUpperCase() === 'MACHINE';
    if (!isMachine) {
      try {
        const expected = await resolveStandard({ processId: report.process_id, productCode: report.product_name, workDate: report.work_date });
        if (!same(report.standard_output, expected.standardOutput) || Number(report.standard_version_id || 0) !== Number(expected.standardVersionId || 0) || Number(report.machine_standard_id || 0) !== Number(expected.machineStandardId || 0)) {
          findings.push({ report_type: table === 'production_reports' ? 'approved' : 'temp', report_id: Number(report.id), work_date: String(report.work_date).slice(0,10), process_id: Number(report.process_id), product_code: report.product_name, machine_code: null, stored_standard: Number(report.standard_output), expected_standard: expected.standardOutput, stored_version_id: report.standard_version_id || null, expected_version_id: expected.standardVersionId || null, stored_machine_standard_id: report.machine_standard_id || null, expected_machine_standard_id: expected.machineStandardId || null, classification: 'AUTO_REPAIR_SAFE', reason: (!same(report.standard_output, expected.standardOutput) && Number(report.standard_output) === Math.round(Number(expected.standardOutput)) && !Number.isInteger(Number(expected.standardOutput))) ? 'DECIMAL_ROUNDING_CANDIDATE' : 'EXACT_HISTORICAL_STANDARD_MISMATCH' });
        }
      } catch (error) {
        findings.push({ report_type: table === 'production_reports' ? 'approved' : 'temp', report_id: Number(report.id), work_date: String(report.work_date).slice(0,10), process_id: Number(report.process_id), product_code: report.product_name, machine_code: null, stored_standard: Number(report.standard_output), expected_standard: null, stored_version_id: report.standard_version_id || null, expected_version_id: null, stored_machine_standard_id: report.machine_standard_id || null, expected_machine_standard_id: null, classification: classifyError(error), reason: error.code || 'STANDARD_AUDIT_ERROR' });
      }
      continue;
    }

    const [lines] = await db.promise().query(
      `SELECT id, machine_id, machine_code, product_code, standard_output, standard_version_id, machine_standard_id
       FROM ${lineTable} WHERE ${reportKey}=? ORDER BY sort_order,id`, [report.id]
    );
    if (!lines.length) {
      findings.push({ report_type: table === 'production_reports' ? 'approved' : 'temp', report_id: Number(report.id), work_date: String(report.work_date).slice(0,10), process_id: Number(report.process_id), product_code: report.product_name, machine_code: report.machine_no, classification: 'REVIEW_REQUIRED', reason: 'MACHINE_REPORT_WITHOUT_LINES' });
      continue;
    }
    for (const line of lines) {
      try {
        const expected = await resolveStandard({ processId: report.process_id, productCode: line.product_code, machineId: line.machine_id, machineCode: line.machine_code, workDate: report.work_date });
        if (!same(line.standard_output, expected.standardOutput) || Number(line.standard_version_id || 0) !== Number(expected.standardVersionId || 0) || Number(line.machine_standard_id || 0) !== Number(expected.machineStandardId || 0)) {
          findings.push({ report_type: table === 'production_reports' ? 'approved' : 'temp', report_id: Number(report.id), machine_line_id: Number(line.id), work_date: String(report.work_date).slice(0,10), process_id: Number(report.process_id), product_code: line.product_code, machine_code: line.machine_code, stored_standard: Number(line.standard_output), expected_standard: expected.standardOutput, stored_version_id: line.standard_version_id || null, expected_version_id: expected.standardVersionId || null, stored_machine_standard_id: line.machine_standard_id || null, expected_machine_standard_id: expected.machineStandardId || null, classification: 'AUTO_REPAIR_SAFE', reason: (!same(line.standard_output, expected.standardOutput) && Number(line.standard_output) === Math.round(Number(expected.standardOutput)) && !Number.isInteger(Number(expected.standardOutput))) ? 'DECIMAL_ROUNDING_CANDIDATE' : 'EXACT_HISTORICAL_MACHINE_STANDARD_MISMATCH' });
        }
      } catch (error) {
        findings.push({ report_type: table === 'production_reports' ? 'approved' : 'temp', report_id: Number(report.id), machine_line_id: Number(line.id), work_date: String(report.work_date).slice(0,10), process_id: Number(report.process_id), product_code: line.product_code, machine_code: line.machine_code, stored_standard: Number(line.standard_output), expected_standard: null, stored_version_id: line.standard_version_id || null, expected_version_id: null, stored_machine_standard_id: line.machine_standard_id || null, expected_machine_standard_id: null, classification: classifyError(error), reason: error.code || 'STANDARD_AUDIT_ERROR' });
      }
    }
  }
  return findings;
}

(async () => {
  try {
    const findings = [
      ...(await auditTable('production_reports_temp','production_temp_machine_lines','temp_report_id')),
      ...(await auditTable('production_reports','production_report_machine_lines','report_id'))
    ];
    const summary = findings.reduce((acc,item) => { acc[item.classification]=(acc[item.classification]||0)+1; return acc; }, {});
    console.log(JSON.stringify({ read_only: true, generated_at: new Date().toISOString(), summary, findings }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ success:false, code:error.code||'HISTORICAL_STANDARD_AUDIT_FAILED', message:error.isPublic?error.message:'Không thể audit định mức lịch sử' }));
    process.exitCode=1;
  } finally {
    await db.promise().end().catch(()=>{});
  }
})();
