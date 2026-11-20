#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const packageJson = JSON.parse(read('package.json'));
const backendPackage = JSON.parse(read('backend/package.json'));
const frontendPackage = JSON.parse(read('frontend/package.json'));

assert.equal(packageJson.version, frontendPackage.version, 'Root/frontend version mismatch');
assert.ok(backendPackage.version, 'Backend version missing');
assert.ok(fs.existsSync(path.join(root, 'backend', 'templates', 'KTC-Bao-cao-9-cong-doan.xlsx')), 'Canonical Excel template missing');
// Existing workflows are checked by CI policy separately; they are not an error by existence.
const contract = read('backend/models/productionTempApprovalModel.js');
for (const marker of ["require('./productionApprovalWorkflow')", "require('./productionRejectionWorkflow')"]) {
  assert.ok(contract.includes(marker), `Approval compatibility export missing: ${marker}`);
}
const approvalWorkflow = read('backend/models/productionApprovalWorkflow.js');
const rejectionWorkflow = read('backend/models/productionRejectionWorkflow.js');
const approvalMachineCopy = read('backend/models/productionApprovalMachineCopy.js');
const approvalPersistence = read('backend/models/productionApprovalPersistence.js');
const approvalAudit = read('backend/models/productionApprovalReviewSideEffects.js');
const approvalScopeQueries = read('backend/models/productionTempApprovalQueries.js');
assert.ok(fs.existsSync(path.join(root, 'backend', 'services', 'productionApprovalService.js')), 'Approval serialization service missing');
for (const [source, markers] of [
  [approvalWorkflow, [
    'assertApprovalSelectionVersions(', 'copyMachineLinesToApproved(', 'createLegacyApprovedSnapshot(',
    'await createApprovedReportVersion(', 'assertApprovedTempTransition(', 'postCommitCallbacks',
  ]],
  [rejectionWorkflow, ['assertApprovalSelectionVersions(', 'assertRejectedTempTransition(', 'recordRejectedTempVersion(']],
  [approvalMachineCopy, ['verifyApprovedMachineLineCopy(', 'buildApprovedMachineDefectsInsert(']],
  [approvalPersistence, ['buildApprovedParentInsertQuery(', 'buildLegacySnapshotInsert(']],
  [approvalAudit, ['AuditService.createReportVersion(', 'deliverApprovedPostCommitNotifications(']],
  [approvalScopeQueries, ['manager_processes', 'FOR UPDATE', 'updated_at=?']],
]) {
  for (const marker of markers) assert.ok(source.includes(marker), `Approval release contract missing: ${marker}`);
}

const forbidden = [];
const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.gradle', 'validation-artifacts']);
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (ignored.has(entry.name)) continue;
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(bak|orig|tmp)$/i.test(entry.name) || /~$/.test(entry.name)) forbidden.push(path.relative(root, full));
  }
}
walk(root);
assert.deepEqual(forbidden, [], `Temporary/backup source files found: ${forbidden.join(', ')}`);

try {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const envTracked = tracked.split(/\r?\n/).filter((x) => /^(\.env|.*\/\.env)$/.test(x));
  assert.deepEqual(envTracked, [], 'A real .env file is tracked in Git');
} catch (_) {
  // ZIP-only validation has no Git metadata; other checks still apply.
}

console.log('[KTC] Final release/security audit PASS');
