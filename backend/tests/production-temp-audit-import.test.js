const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// Original intent: the create path must never reference AuditService without importing it
// (a ReferenceError there breaks report creation). The create-version audit now lives in
// services/productionTempSubmissionService.js; productionTempCreateModel no longer audits.
test('create path declares AuditService before using it', () => {
  const service = read('services/productionTempSubmissionService.js');
  assert.match(service, /const\s+AuditService\s*=\s*require\(["']\.\/auditService["']\)/);
  assert.match(service, /AuditService\.loadTempReportSnapshot\(/);
  assert.match(service, /AuditService\.createReportVersion\(/);

  const createModel = read('models/productionTempCreateModel.js');
  if (/AuditService\./.test(createModel)) {
    assert.match(createModel, /const\s+AuditService\s*=\s*require\(["']\.\.\/services\/auditService["']\)/);
  }
});
