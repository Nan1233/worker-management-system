'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('migration 020 adds one canonical immutable training snapshot field to temp and approved parents', () => {
  const sql = read('migrations/020_training_percent_snapshot_20260812.sql');
  assert.match(sql, /production_reports_temp[\s\S]*training_percent_snapshot\s+DECIMAL\(7,2\)/i);
  assert.match(sql, /production_reports[\s\S]*training_percent_snapshot\s+DECIMAL\(7,2\)/i);
  assert.doesNotMatch(sql, /\bUPDATE\b/i);
});

test('reset schema matches migration and no competing training_percent report column is declared', () => {
  const sql = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  const temp = sql.match(/CREATE TABLE IF NOT EXISTS production_reports_temp \([\s\S]*?\n\);/i)?.[0] || '';
  const approved = sql.match(/CREATE TABLE IF NOT EXISTS production_reports \([\s\S]*?\n\);/i)?.[0] || '';
  for (const block of [temp, approved]) {
    assert.match(block, /training_percent_snapshot\s+DECIMAL\(7,2\)/i);
    assert.doesNotMatch(block, /\n\s*training_percent\s+/i);
  }
});

test('initial create resolves worker training inside transaction and persists snapshot; resubmit edit fields cannot alter it', () => {
  const create = read('models/productionTempCreateModel.js');
  const shared = read('models/productionTempModelShared.js');
  assert.match(create, /resolveInitialTrainingSnapshot/);
  assert.match(create, /training_percent_snapshot/);
  assert.doesNotMatch(shared.match(/const editableFields = \[[\s\S]*?\];/)?.[0] || '', /training_percent_snapshot/);
});

test('approval copies the exact snapshot and approved edit no longer treats training as client-editable authority', () => {
  const approval = read('models/productionTempApprovalModel.js');
  const edit = read('services/approvedReportEditService.js');
  assert.match(approval, /training_percent_snapshot/);
  const allowed = edit.match(/const allowed = \[[\s\S]*?\];/)?.[0] || '';
  assert.doesNotMatch(allowed, /training_percent/);
});

test('primary process Excel uses report snapshot and fails closed for legacy missing snapshot', () => {
  const excel = read('services/processExcelExportService.js');
  assert.match(excel, /pr\.training_percent_snapshot AS training_percent/);
  assert.match(excel, /assertTrainingSnapshotAvailable\(report\)/);
  assert.doesNotMatch(excel, /w\.training_percent/);
});

test('training audit scanner is read only', () => {
  const scanner = read('scripts/auditTrainingSnapshots.js');
  assert.doesNotMatch(scanner, /\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
  assert.match(scanner, /MISSING_TRAINING_SNAPSHOT/);
  assert.match(scanner, /CURRENT_MASTER_DRIFT_RISK/);
  assert.match(scanner, /TRAINING_SCHEMA_INCONSISTENCY/);
  assert.doesNotMatch(scanner, /\bALTER\b/i);
  const auditService = read('services/trainingSnapshotAuditService.js');
  assert.match(auditService, /SHOW COLUMNS FROM/);
  assert.match(auditService, /TRAINING_SCHEMA_INCONSISTENCY/);
  assert.doesNotMatch(auditService, /\bUPDATE\b|\bDELETE\b|\bINSERT\b|\bALTER\b/i);
});
