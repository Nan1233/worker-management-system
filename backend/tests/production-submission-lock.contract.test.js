const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lockPath = path.join(__dirname, '..', 'services', 'productionSubmissionLockService.js');
const modelPath = path.join(__dirname, '..', 'models', 'productionTempModel.js');
const lockSource = fs.readFileSync(lockPath, 'utf8');
const modelSource = fs.readFileSync(modelPath, 'utf8');

assert.match(lockSource, /GET_LOCK\(\?, \?\)/);
assert.match(lockSource, /RELEASE_LOCK\(\?\)/);
assert.match(lockSource, /LOCK_TIMEOUT_SECONDS = 2/);
assert.match(lockSource, /capacity:\$\{processId\}:\$\{workDate\}:\$\{shift\}/);
assert.match(modelSource, /withDistributedSubmissionLock\(data, machineLines/);
assert.doesNotMatch(modelSource, /LOCK_RETRY_ATTEMPTS/);
assert.doesNotMatch(modelSource, /for \(let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS/);

console.log('production submission lock contract: PASS');
