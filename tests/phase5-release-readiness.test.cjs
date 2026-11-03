'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/phase5ReleaseReadiness.cjs');

test('Phase 5 readiness report is source-only and identifies TEST endpoints as release blockers', () => {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'source-only; no database/network/deploy/build/publish');
  assert.equal(report.releaseStatus, 'BLOCKED');
  assert.equal(report.branchStatus, 'TEST_BRANCH_SOURCE_CHECKS');
  assert.equal(report.testProfileStatus, 'EXPLICIT_TEST_ENDPOINTS');
  assert.ok(report.warnings.some((item) => item.id === 'DESKTOP_TEST_ENDPOINTS'));
  assert.ok(report.warnings.some((item) => item.id === 'FRONTEND_RENDER_TEST_API'));
  assert.ok(report.blockers.some((item) => item.id === 'DEPLOYMENT_MANIFEST_DRIFT'));
  assert.ok(report.blockers.some((item) => item.id === 'CORS_PRODUCTION_ORIGIN_UNVERIFIED'));
});

test('root package exposes both readiness commands for maintainers', () => {
  const packageJson = require(path.join(root, 'package.json'));
  assert.equal(packageJson.scripts['release:readiness'], 'node scripts/phase5ReleaseReadiness.cjs');
  assert.equal(packageJson.scripts['release:readiness:strict'], 'node scripts/phase5ReleaseReadiness.cjs --strict');
});

test('strict release mode fails closed while TEST/production topology is unresolved', () => {
  const result = spawnSync(process.execPath, [script, '--strict'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.releaseStatus, 'BLOCKED');
});
