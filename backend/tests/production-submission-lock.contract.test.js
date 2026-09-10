const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const lockPath = path.join(__dirname, '..', 'services', 'productionSubmissionLockService.js');
const modelPath = path.join(__dirname, '..', 'models', 'productionTempModel.js');
const sharedPath = path.join(__dirname, '..', 'models', 'productionTempModelShared.js');
const createPath = path.join(__dirname, '..', 'models', 'productionTempCreateModel.js');
const lockSource = fs.readFileSync(lockPath, 'utf8');
const modelSource = fs.readFileSync(modelPath, 'utf8');
const sharedSource = fs.readFileSync(sharedPath, 'utf8');
const createSource = fs.readFileSync(createPath, 'utf8');

// Advisory GET_LOCK remains covered as an isolated service contract, but it
// must not be part of the Cloudflare /api/production-temp request path.
assert.match(lockSource, /GET_LOCK\(\?, \?\)/);
assert.match(lockSource, /RELEASE_LOCK\(\?\)/);
assert.match(lockSource, /LOCK_TIMEOUT_SECONDS = 30|LOCK_TIMEOUT_SECONDS = 8/);
assert.match(lockSource, /buildLogicalDuplicateKey/);
assert.match(lockSource, /logical:\$\{logicalKey\}/);
assert.match(lockSource, /capacity:\$\{processId\}:\$\{workDate\}:\$\{shift\}/);
assert.doesNotMatch(modelSource, /withDistributedSubmissionLock\(data, machineLines/);
assert.doesNotMatch(modelSource, /GET_LOCK\(/);
assert.doesNotMatch(modelSource, /LOCK_RETRY_ATTEMPTS/);
assert.doesNotMatch(modelSource, /for \(let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS/);
assert.match(createSource, /lockLogicalDuplicateKey\(/);
assert.match(sharedSource, /tidb_foreign_key_check_in_shared_lock = ON/);

console.log('production submission lock contract: PASS');
