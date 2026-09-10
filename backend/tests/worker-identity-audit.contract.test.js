'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const auditPath = path.join(__dirname, '../scripts/auditWorkerIdentity.js');
const readModelPath = path.join(__dirname, '../models/productionTempReadModel.js');

const auditSource = fs.readFileSync(auditPath, 'utf8');
const readModelSource = fs.readFileSync(readModelPath, 'utf8');

test('worker identity audit is read-only and covers the canonical identity chain', () => {
  assert.match(auditSource, /users\s+u[\s\S]+workers\s+w/i);
  assert.match(auditSource, /DUPLICATE_WORKER_CODE/);
  assert.match(auditSource, /USER_WITH_MULTIPLE_WORKERS/);
  assert.match(auditSource, /DUPLICATE_NORMALIZED_NUMERIC_WORKER_CODE/);
  assert.match(auditSource, /TEMP_REPORT_IDENTITY_COLLISION/);
  assert.match(auditSource, /APPROVED_REPORT_IDENTITY_COLLISION/);
  assert.match(auditSource, /NEVER changes production data|NEVER changes/i);
  assert.doesNotMatch(auditSource, /\b(INSERT|UPDATE|DELETE|ALTER|DROP)\s+/i);
});

test('pending report read path joins user through workers.user_id', () => {
  assert.match(readModelSource, /JOIN workers w ON pr\.worker_id = w\.id/);
  assert.match(readModelSource, /JOIN users u ON w\.user_id = u\.id/);
  assert.doesNotMatch(readModelSource, /JOIN users u ON pr\.worker_id = w\.id/);
});
