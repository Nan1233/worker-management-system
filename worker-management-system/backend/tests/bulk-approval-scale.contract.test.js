const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'models', 'productionTempApprovalModel.js'), 'utf8');

test('SOURCE_CONTRACT: accepted bulk approval remains one transaction with rollback on failure', () => {
  assert.match(source, /await beginTransaction\(connection\)/);
  assert.match(source, /await commit\(connection\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*await rollback\(connection\)/);
});

test('SOURCE_CONTRACT: reporting-period lock lookup is batched once before report loop', () => {
  assert.match(source, /const lockedReportingPeriods = await loadLockedReportingPeriods\(connection, rows\)/);
  const loopIndex = source.indexOf('for (const item of rows)');
  const batchIndex = source.indexOf('loadLockedReportingPeriods(connection, rows)');
  assert.ok(batchIndex >= 0 && batchIndex < loopIndex);
  const loopBody = source.slice(loopIndex);
  assert.doesNotMatch(loopBody, /SELECT id FROM reporting_period_locks/);
});
