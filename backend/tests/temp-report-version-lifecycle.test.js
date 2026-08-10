const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('temp report lifecycle creates immutable versions at create/update/reject/approve', () => {
  const create = read('models/productionTempCreateModel.js');
  const update = read('models/productionTempUpdateModel.js');
  const approval = read('models/productionTempApprovalModel.js');

  assert.match(create, /loadTempReportSnapshot\(tempId, connection\)/);
  assert.match(create, /reportType:\s*["']temp["']/);
  assert.match(create, /Tạo báo cáo chờ duyệt/);

  assert.match(update, /oldSnapshot\s*=\s*await AuditService\.loadTempReportSnapshot/);
  assert.match(update, /newSnapshot\s*=\s*await AuditService\.loadTempReportSnapshot/);
  assert.match(update, /createReportVersion\(\{/);
  assert.match(update, /RESUBMIT/);
  assert.match(update, /TEMP_REPORT_RESUBMITTED/);

  assert.match(approval, /rejectedSnapshot\s*=\s*await AuditService\.loadTempReportSnapshot/);
  assert.match(approval, /Bị từ chối:/);
  assert.match(approval, /approvedTempSnapshot\s*=\s*await AuditService\.loadTempReportSnapshot/);
  assert.match(approval, /Được duyệt thành báo cáo chính thức/);
});

test('temp edit audit uses current report_edit_logs JSON schema, not removed legacy columns', () => {
  const update = read('models/productionTempUpdateModel.js');
  const schema = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');

  assert.match(schema, /report_edit_logs[\s\S]*user_id[\s\S]*old_data[\s\S]*new_data[\s\S]*changed_fields[\s\S]*note/);
  assert.match(update, /\(report_type, report_id, user_id, old_data, new_data, changed_fields, note\)/);
  assert.doesNotMatch(update, /changed_by/);
  assert.doesNotMatch(update, /field_name/);
  assert.doesNotMatch(update, /old_value/);
  assert.doesNotMatch(update, /new_value/);
});

test('temp snapshot includes child detail and machine detail for forensic comparison', () => {
  const audit = read('services/auditService.js');
  assert.match(audit, /async function loadTempReportSnapshot/);
  assert.match(audit, /production_temp_defects/);
  assert.match(audit, /production_temp_deductions/);
  assert.match(audit, /production_temp_machine_lines/);
  assert.match(audit, /production_temp_machine_defects/);
  assert.match(audit, /machine_lines:/);
  assert.match(audit, /loadTempReportSnapshot,/);
});
