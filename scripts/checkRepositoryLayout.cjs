#!/usr/bin/env node
'use strict';

// Read-only repository/template integrity gate. Does not require ExcelJS or network.
// Run from repository root: node scripts/checkRepositoryLayout.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const at = (...parts) => path.join(root, ...parts);
const exists = (...parts) => fs.existsSync(at(...parts));
const listXlsx = (...parts) => fs.readdirSync(at(...parts)).filter(name => name.toLowerCase().endsWith('.xlsx'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const canonicalBackend = 'KTC-Bao-cao-9-cong-doan.xlsx';
const canonicalDesktop = 'file-mau.xlsx';
assert.ok(exists('backend', 'templates', canonicalBackend), 'Canonical backend workbook is missing');
assert.ok(exists('desktop', 'assets', 'templates', canonicalDesktop), 'Canonical desktop workbook is missing');

// Exactly one copy per identical content in one template directory.
// Identical artifacts across separately packaged desktop/backend folders remain intentional.
for (const parts of [['backend', 'templates'], ['desktop', 'assets', 'templates']]) {
  const seen = new Map();
  for (const name of listXlsx(...parts)) {
    const digest = hash(at(...parts, name));
    assert.ok(!seen.has(digest), `Identical template copies under ${parts.join('/')}: ${seen.get(digest)} and ${name}`);
    seen.set(digest, name);
  }
}

// Electron resources are explicitly shipped from the backend's canonical template folder.
const desktopPackage = JSON.parse(fs.readFileSync(at('desktop', 'package.json'), 'utf8'));
const resources = desktopPackage.build?.extraResources || [];
const templateResource = resources.find(item => item.from === '../backend/templates' && item.to === 'templates');
assert.ok(templateResource, 'Missing Electron backend template resource mapping');
for (const name of templateResource.filter || []) {
  if (name.startsWith('!') || name.includes('*') || name.includes('?')) continue;
  assert.ok(exists('backend', 'templates', name), `Packaged Excel template missing: ${name}`);
}

// The company-original templates and Workbook1 modes have hard-coded names.
// Do not delete or rename these until the code contracts and package resources are migrated.
const originalProcess = fs.readFileSync(at('desktop', 'electron', 'originalProcessExcelTemplate.cjs'), 'utf8');
const sourceNames = [...originalProcess.matchAll(/\bfile:\s*["']([^"']+\.xlsx)["']/g)].map(match => match[1]);
for (const name of new Set(sourceNames)) {
  assert.ok(exists('backend', 'templates', name), `Process-specific template missing: ${name}`);
}

// Retain the exported workflow facade so existing backend routes resolve.
const approvalFacade = fs.readFileSync(at('backend', 'models', 'productionTempApprovalModel.js'), 'utf8');
for (const moduleName of ['productionApprovalWorkflow', 'productionRejectionWorkflow']) {
  assert.ok(approvalFacade.includes(`./${moduleName}`), `Approval workflow is missing: ${moduleName}`);
}
for (const deleted of [
  ['backend', 'templates', 'template_legacy_001.xlsx'],
  ['backend', 'templates', 'template_legacy_002.xlsx'],
  ['desktop', 'assets', 'templates', 'process-report-template.xlsx'],
  ['desktop', 'electron', 'excelExportContractPatch.v5.cjs'],
]) {
  assert.ok(!exists(...deleted), `Removed legacy duplicate was reintroduced: ${deleted.join('/')}`);
}
console.log('[KTC] Repository/template layout PASS (static contracts; no runtime/build verification)');
