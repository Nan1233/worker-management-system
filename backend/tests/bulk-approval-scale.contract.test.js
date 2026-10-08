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


