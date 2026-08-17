const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('productionTempCreateModel declares AuditService before using it', () => {
  const file = path.join(__dirname, '..', 'models', 'productionTempCreateModel.js');
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /const\s+AuditService\s*=\s*require\(["']\.\.\/services\/auditService["']\)/);
  assert.match(source, /AuditService\.loadTempReportSnapshot\(/);
  assert.match(source, /AuditService\.createReportVersion\(/);
});
