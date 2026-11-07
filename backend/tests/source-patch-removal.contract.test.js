'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');
const read = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('frontend build and test scripts do not rewrite source', () => {
  const scripts = JSON.parse(read('frontend/package.json')).scripts;
  assert.equal(scripts['prepare:source'], undefined);
  for (const [name, command] of Object.entries(scripts)) {
    if (/^(prebuild|pretest|pretypecheck|build|build:cloudflare|build:cloudflare:test|build:cloudflare:production)$/.test(name)) {
      assert.doesNotMatch(command, /patch(?:ManagerReportSave|WorkerReportEdit|CvkWorkerEntryV3|CvkClickFix|CvkFinalCleanup)\.cjs|prepare:source/);
    }
  }
});

test('backend install and startup do not run legacy source patch scripts', () => {
  const scripts = JSON.parse(read('backend/package.json')).scripts;
  assert.doesNotMatch(scripts.postinstall || '', /fixCloudflareWorkerSyntax|patchCvkProcessId/);
  assert.doesNotMatch(scripts.start || '', /ensureGcLong2801Lt/);
});

test('approved-report concurrency is implemented in the service, not a startup preload', () => {
  const service = read('backend/services/approvedReportEditService.js');
  const scripts = JSON.parse(read('backend/package.json')).scripts;
  assert.doesNotMatch(scripts.start || '', /--require|approvedReportConcurrencyPatch/);
  assert.match(service, /const updateApprovedReportSafe = withApprovedEditConcurrency\(updateApprovedReport,/);
  assert.match(service, /const restoreApprovedReportVersionSafe = withApprovedEditConcurrency\(restoreApprovedReportVersion,/);
  assert.match(service, /createApprovedEditGuard/);
  const guard = read('backend/services/approvedEditConcurrency.js');
  assert.match(guard, /const enqueue = async/);
  assert.match(guard, /isRetryableLockError/);
  assert.match(service, /SELECT \* FROM production_reports WHERE id=\? FOR UPDATE/);
  assert.match(service, /connection\.rollback\(\)/);
});

test('runtime does not carry a source-rewriting approved-report preload', () => {
  assert.equal(fs.existsSync(path.join(backendRoot, 'scripts/approvedReportConcurrencyPatch.cjs')), false);
});
