const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const readBackend = (relative) => fs.readFileSync(path.join(backendRoot, relative), 'utf8');
const readProject = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

test('approve/reject lock rows, reject stale snapshots and keep legacy need_fix read compatibility', () => {
  const source = readBackend('models/productionTempApprovalModel.js');
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /expectedById/);
  assert.match(source, /TEMP_REPORT_VERSION_CONFLICT/);
  assert.match(source, /new Date\(expected\)\.getTime\(\) !== new Date\(row\.updated_at\)\.getTime\(\)/);
  assert.match(source, /status IN \('pending', 'need_fix'\)/);
});

test('temp edits use the same stale-write protection before mutation', () => {
  const source = readBackend('models/productionTempUpdateModel.js');
  const lock = source.indexOf('FOR UPDATE');
  const conflict = source.indexOf('TEMP_REPORT_VERSION_CONFLICT', lock);
  const update = source.indexOf('UPDATE production_reports_temp', conflict);
  assert.ok(lock >= 0, 'temp row must be locked before edit');
  assert.ok(conflict > lock, 'expected_updated_at must be checked after row lock');
  assert.ok(update > conflict, 'no temp mutation may happen before stale-version check');
});

test('manager UI sends updated_at token for bulk, review and detail actions', () => {
  const service = readProject('frontend/src/services/productionService.ts');
  const list = readProject('frontend/src/pages/manager/Reports.tsx');
  const review = readProject('frontend/src/pages/manager/SelectedReportsReview.tsx');
  const detail = readProject('frontend/src/pages/manager/ReportDetail.tsx');

  assert.match(service, /expected_updated_at/);
  assert.match(service, /targets/);
  assert.match(list, /selectedReviewTargets/);
  assert.match(list, /expected_updated_at:\s*report\.updated_at/);
  assert.match(review, /reviewTargets/);
  assert.match(review, /expected_updated_at:\s*report\.updated_at/);
  assert.match(detail, /expected_updated_at:\s*report\.updated_at/);
});

test('approved report creation remains idempotent by source temp id', () => {
  const schema = readBackend('migrations/002_production_schema.sql');
  const approval = readBackend('models/productionTempApprovalModel.js');
  assert.match(schema, /UNIQUE KEY uq_production_source_temp \(source_temp_id\)/);
  assert.match(approval, /source_temp_id/);
  assert.match(approval, /SET status = 'approved'/);
});
