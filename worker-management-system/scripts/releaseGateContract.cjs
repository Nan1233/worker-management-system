const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const backendRender = read('backend/render.yaml');
const frontendRender = read('frontend/render.yaml');
const requirementLock = read('docs/KTC_REQUIREMENT_LOCK_WAVE0_20260812.md');
const approvalModel = read('backend/models/productionTempApprovalModel.js');
const workerController = read('backend/controllers/productionTempWorkerController.js');
const criticalE2e = read('scripts/zero-cost/critical-e2e.cjs');
const p0Contract = read('backend/tests/p0-release-hardening.contract.test.js');

for (const script of [
  'verify:release-contract',
  'verify:release-consistency',
  'verify:excel-contract',
]) {
  assert.equal(typeof packageJson.scripts?.[script], 'string', `Root package phải có script ${script}`);
}

for (const script of [
  'validate:zero-cost',
  'validate:zero-cost:seed',
  'validate:zero-cost:security',
  'validate:zero-cost:e2e',
  'validate:zero-cost:perf',
  'validate:zero-cost:excel',
]) {
  assert.equal(typeof packageJson.scripts?.[script], 'string', `Root package phải có script ${script}`);
}

// KTC intentionally has GitHub Actions disabled. Local release contracts are the source of truth.
assert.ok(!fs.existsSync(path.join(root, '.github', 'workflows')), 'GitHub Actions must remain disabled');
for (const script of ['quality:all', 'audit:final', 'audit:performance', 'audit:excel:roundtrip']) {
  assert.equal(typeof packageJson.scripts?.[script], 'string', `Root package phải có script ${script}`);
}

assert.match(backendRender, /buildCommand: npm install && npm run verify && npm prune --omit=dev/g);
assert.match(backendRender, /preDeployCommand: npm run db:schema:verify/);
assert.match(backendRender, /healthCheckPath: \/api\/health\/ready/);
assert.match(frontendRender, /buildCommand: npm ci && npm run check/);

// P0 business-safety contracts: keep these executable assertions close to the release gate.
assert.match(approvalModel, /await beginTransaction\(connection\)/);
assert.match(approvalModel, /FOR UPDATE/);
assert.match(approvalModel, /TEMP_REPORT_VERSION_CONFLICT/);
assert.match(approvalModel, /await commit\(connection\)/);
assert.match(approvalModel, /await rollback\(connection\)/);
assert.match(approvalModel, /JOIN manager_processes mp ON mp\.process_id = temp\.process_id/);
assert.match(approvalModel, /mp\.manager_id = \?/);
assert.match(workerController, /CLIENT_REQUEST_ID_REQUIRED/);
assert.match(workerController, /DUPLICATE_CONFIRMATION_REQUIRED/);
assert.match(workerController, /duplicate_confirmation_token/);
assert.match(workerController, /client_request_id/);

for (const marker of [
  'Worker login',
  'Duplicate detection',
  'Backdate -14',
  'Backdate -15',
  'MAI multi-machine',
  'GC 5/6/7/11 max4',
  'Shared-machine accounting',
  'manager_processes authorization',
  'Approve/reject',
  'Approved edit conflict',
  'Excel export data',
  'Excel import real-diff',
]) {
  assert.ok(criticalE2e.includes(marker), `Critical E2E thiếu case: ${marker}`);
}
assert.match(p0Contract, /P0 approval path keeps transaction/);
assert.match(p0Contract, /P0 worker submission keeps idempotency/);

assert.match(requirementLock, /does \*\*not\*\* require KTC Wi-Fi/i);
assert.match(requirementLock, /today-14/i);
assert.match(requirementLock, /maxWorkers = 4/);
assert.match(requirementLock, /No canonical need_fix workflow/i);
assert.match(requirementLock, /10 files\/month/i);
assert.match(requirementLock, /xSplit=4/i);

console.log('[KTC] Wave 0 / P0 release-hardening gate contract OK');
