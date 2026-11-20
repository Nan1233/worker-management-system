'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('production domain modules remain independent of database, HTTP and UI adapters', () => {
  const modules = [
    'modules/production/domain/machineDefectLineage.js',
    'modules/production/domain/nonProductSnapshot.js',
    'modules/production/domain/submissionIdempotency.js',
  ];
  for (const filename of modules) {
    const source = read(filename);
    assert.doesNotMatch(source, /\brequire\s*\(/, filename);
    assert.doesNotMatch(source, /\b(?:fetch|process\.env|window|document|ipcMain)\b/, filename);
    assert.match(source, /module\.exports\s*=/, filename);
  }
});

test('approval model calls production domain and repository boundaries', () => {
  const source = read('models/productionTempApprovalModel.js');
  assert.match(source, /require\("\.\.\/modules\/production\/domain\/machineDefectLineage"\)/);
  assert.match(source, /require\("\.\.\/modules\/production\/domain\/nonProductSnapshot"\)/);
  assert.match(source, /require\("\.\.\/repositories\/productionApprovalReadRepository"\)/);
  assert.match(source, /await beginTransaction\(connection\)/);
});

test('submission keeps transaction scope while using shared retry and process repositories', () => {
  const source = read('services/productionTempSubmissionService.js');
  assert.match(source, /require\("\.\.\/modules\/production\/domain\/submissionIdempotency"\)/);
  assert.match(source, /require\("\.\.\/repositories\/productionSubmissionProcessRepository"\)/);
  assert.match(source, /require\("\.\/productionSubmissionRollback"\)/);
  assert.match(source, /await beginReadCommittedTransaction\(parentConnection\)/);
  assert.match(source, /await createModel\.lockClientRequestId\(/);
  assert.match(source, /await findExistingClientRequest\(data, parentConnection\)/);
});
