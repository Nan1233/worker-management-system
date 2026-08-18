const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const ci = read('.github/workflows/ci.yml');
const audit = read('.github/workflows/security-audit.yml');
const backendRender = read('backend/render.yaml');
const frontendRender = read('frontend/render.yaml');
const requirementLock = read('docs/KTC_REQUIREMENT_LOCK_WAVE0_20260812.md');

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

assert.match(ci, /npm ci --prefix backend/);
assert.match(ci, /npm --prefix backend test/);
assert.match(ci, /npm ci --prefix frontend/);
assert.match(ci, /npm --prefix frontend run typecheck/);
assert.match(ci, /npm --prefix frontend test/);
assert.match(ci, /npm --prefix frontend run build/);
assert.match(ci, /npm ci --prefix desktop/);
assert.match(ci, /npm --prefix desktop run smoke:excel/);
assert.doesNotMatch(ci, /npm install(?:\s|$)/);

for (const pkg of ['backend', 'frontend', 'desktop']) {
  assert.match(audit, new RegExp(pkg));
}
assert.match(audit, /audit:prod/);

assert.match(backendRender, /buildCommand: npm ci && npm run verify && npm prune --omit=dev/g);
assert.match(backendRender, /preDeployCommand: npm run db:schema:verify/);
assert.match(backendRender, /healthCheckPath: \/api\/health\/ready/);
assert.match(frontendRender, /buildCommand: npm ci && npm run check/);

assert.match(requirementLock, /does \*\*not\*\* require KTC Wi-Fi/i);
assert.match(requirementLock, /today-14/i);
assert.match(requirementLock, /maxWorkers = 4/);
assert.match(requirementLock, /No canonical need_fix workflow/i);
assert.match(requirementLock, /10 files\/month/i);
assert.match(requirementLock, /xSplit=4/i);

console.log('[KTC] Wave 0 release gate contract OK');
