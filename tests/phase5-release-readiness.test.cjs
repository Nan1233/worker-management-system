'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts/phase5ReleaseReadiness.cjs');

test('Phase 5 gate recognizes isolated Cloudflare TEST and production source profiles', () => {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.mode, 'source-only; no database/network/deploy/build/publish');
  assert.equal(report.branchStatus, 'TEST_BRANCH_SOURCE_CHECKS');
  assert.equal(report.targetArchitecture, 'Cloudflare Workers + Cloudflare Workers Static Assets + TiDB Cloud');
  assert.equal(report.testProfileStatus, 'EXPLICIT_TEST_ENDPOINTS');
  assert.equal(report.productionProfileStatus, 'EXPLICIT_CLOUDFLARE_PROFILES');
  assert.ok(report.checks.some((item) => item.id === 'CLOUDFLARE_PROFILE_CONFIGURATION'));
  assert.equal(report.blockers.some((item) => item.id === 'PRODUCTION_ENVIRONMENT_PROFILE'), false);
  assert.equal(report.blockers.some((item) => item.id === 'CLOUDFLARE_PROFILE_CONFIGURATION'), false);
  assert.ok(report.checks.some((item) => item.id === 'CLOUDFLARE_RUNTIME_GUARDS'));
  assert.ok(report.checks.some((item) => item.id === 'CLOUDFLARE_REQUIRED_SECRETS_DECLARED'));
  assert.ok(report.checks.some((item) => item.id === 'CROSS_ENVIRONMENT_ENDPOINT_GUARD'));
  assert.ok(report.warnings.some((item) => item.id === 'DESKTOP_DEFAULT_TEST_PROFILE'));
  assert.ok(report.blockers.some((item) => item.id === 'CLOUDFLARE_RUNTIME_SECRETS_UNVERIFIED'));
  assert.ok(report.warnings.some((item) => item.id === 'LEGACY_RENDER_BLUEPRINTS'));
});

test('root package exposes both readiness commands for maintainers', () => {
  const packageJson = require(path.join(root, 'package.json'));
  assert.equal(packageJson.scripts['release:readiness'], 'node scripts/phase5ReleaseReadiness.cjs');
  assert.equal(packageJson.scripts['release:readiness:strict'], 'node scripts/phase5ReleaseReadiness.cjs --strict');
});

test('strict release mode fails closed while Cloudflare runtime secrets are unverified', () => {
  const result = spawnSync(process.execPath, [script, '--strict'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.releaseStatus, 'BLOCKED');
  assert.ok(report.blockers.every((item) => item.id === 'CLOUDFLARE_RUNTIME_SECRETS_UNVERIFIED'));
});
