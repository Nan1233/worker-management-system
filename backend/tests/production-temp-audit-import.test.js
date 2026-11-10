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
  // Creation writes immutable snapshots via the batched audit transaction.
  assert.match(service, /const createAuditAfterChildrenBatch = async/);
  assert.match(service, /INSERT INTO report_versions \(report_type,report_id,version_no,snapshot_json,change_reason,created_by\)/);
  assert.match(service, /await createAuditAfterChildrenBatch\(/);

  const createModel = read('models/productionTempCreateModel.js');
  if (/AuditService\./.test(createModel)) {
    assert.match(createModel, /const\s+AuditService\s*=\s*require\(["']\.\.\/services\/auditService["']\)/);
  }
});
