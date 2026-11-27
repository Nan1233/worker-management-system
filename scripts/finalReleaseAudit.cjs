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

// Independent component versions are intentional; record them, never force equality.
const desktopPackage = JSON.parse(read('desktop/package.json'));
for (const [name,pkg] of Object.entries({root:packageJson,frontend:frontendPackage,backend:backendPackage,desktop:desktopPackage})) {
  assert.match(String(pkg.version||''), /^\d+\.\d+\.\d+(?:[-+].+)?$/, name+' version invalid');
}
assert.ok(backendPackage.version, 'Backend version missing');
assert.ok(fs.existsSync(path.join(root, 'backend', 'templates', 'KTC-Bao-cao-9-cong-doan.xlsx')), 'Canonical Excel template missing');
// Existing workflows are checked by CI policy separately; they are not an error by existence.
const contract = read('backend/models/productionTempApprovalModel.js');
for (const marker of ["require('./productionApprovalWorkflow')", "require('./productionRejectionWorkflow')"]) {
  assert.ok(contract.includes(marker), `Approval compatibility export missing: ${marker}`);
}
const approvalWorkflow = read('backend/services/productionApprovalWorkflowService.js');
const rejectionWorkflow = read('backend/services/productionRejectionWorkflowService.js');
const approvalMachineCopy = read('backend/repositories/productionApprovalMachineRepository.js');
const approvalPersistence = read('backend/repositories/productionApprovalWriteRepository.js');
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

// Audit only tracked files; never traverse local DB backups or secrets.
const { inspectTrackedPaths } = require('./lib/releaseTrackedPaths.cjs');
const tracked = execFileSync('git', ['ls-files','-z'], { cwd: root, encoding: 'utf8', maxBuffer: 32*1024*1024 }).split('\0').filter(Boolean);
const issues = inspectTrackedPaths(tracked);
assert.deepEqual(issues, [], 'Forbidden tracked paths: '+issues.join(', '));
console.log('[KTC] Component versions:', JSON.stringify({root:packageJson.version,frontend:frontendPackage.version,backend:backendPackage.version,desktop:desktopPackage.version}));
console.log('[KTC] Final release/security audit PASS');
