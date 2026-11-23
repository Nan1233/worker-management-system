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
const originalProcess = fs.readFileSync(at('desktop', 'electron', 'originalProcessTemplateRegistry.cjs'), 'utf8');
const sourceNames = [...originalProcess.matchAll(/\bfile:\s*["']([^"']+\.xlsx)["']/g)].map(match => match[1]);
for (const name of new Set(sourceNames)) {
  assert.ok(exists('backend', 'templates', name), `Process-specific template missing: ${name}`);
}

// Registry consolidation and stable export compatibility must remain intact.
const naming = fs.readFileSync(at('desktop', 'electron', 'monthlyWorkbookNaming.cjs'), 'utf8');
const workerRegistry = fs.readFileSync(at('desktop', 'electron', 'workerReportTemplateRegistry.cjs'), 'utf8');
assert.ok(naming.includes('PROCESS_FILE_PREFIXES'), 'Canonical process naming registry missing');
assert.ok(workerRegistry.includes("require('./monthlyWorkbookSchemas.cjs')"),
  'Worker process codes must derive from canonical process schemas');
assert.ok(workerRegistry.includes("require('./monthlyWorkbookNaming.cjs')"),
  'Worker template registry must reuse canonical file prefixes');
for (const file of ['workerReportWorkbook.cjs', 'productionExcelExport.cjs', 'deferredDesktopServices.cjs']) {
  assert.ok(exists('desktop', 'electron', file), `Stable desktop entry missing: ${file}`);
}
// No automatic Excel -> DB watcher: all imports must be manager-confirmed.
const mainSource = fs.readFileSync(at('desktop', 'electron', 'main.cjs'), 'utf8');
const rendererSource = fs.readFileSync(at('desktop', 'electron', 'desktopRendererMonitoring.cjs'), 'utf8');
for (const [name, source] of [['main', mainSource], ['renderer monitor', rendererSource]]) {
  assert.ok(!source.includes('startExcelDbSyncWatcher'),
    `Obsolete automatic Excel DB watcher reference in ${name}`);
  assert.ok(!source.includes('stopExcelDbSyncWatcher'),
    `Obsolete automatic Excel DB watcher reference in ${name}`);
}
for (const [file, dependency] of [
  ['main.cjs', "require('./productionExcelExport.cjs')"],
  ['productionExcelExport.cjs', "require('./excelExportContractPatch.v6.cjs')"],
  ['excelExportContractPatch.v6.cjs', "require('./workerReportWorkbook.cjs')"],
  ['workerReportWorkbook.cjs', "require('./workerReportTemplateLocal.v2.cjs')"],
]) {
  assert.ok(fs.readFileSync(at('desktop', 'electron', file), 'utf8').includes(dependency),
    `Stable Excel export chain is broken: ${file}`);
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
// Guard the production Excel safety boundaries introduced during phase 4.
// These are static source invariants, not a substitute for runtime verification.
const atomicWriter = fs.readFileSync(at('desktop', 'electron', 'excelAtomicFileWriter.cjs'), 'utf8');
const dbSync = fs.readFileSync(at('desktop', 'electron', 'excelDbSyncController.cjs'), 'utf8');
const templateExport = fs.readFileSync(at('backend', 'services', 'templateDrivenProcessExcelExportService.js'), 'utf8');
const templateContract = fs.readFileSync(at('backend', 'services', 'excelTemplateContractService.js'), 'utf8');
for (const [name, source, tokens] of [
  ['atomic Excel writer', atomicWriter, ['backupExistingExcel', 'performAtomicOverwrite', 'fileQueues', 'KTC_EXCEL_CONCURRENT_MODIFICATION', 'pendingPath']],
  ['Excel DB reconciliation', dbSync, ['expected_updated_at', 'acknowledgedIds', 'blockedMonths', 'unreadableWorkbook', 'changedDuringSync']],
  ['template-driven Excel export', templateExport, ['buildSixProcessWorkbook', 'KTC_EXCEL_TEMPLATE_COLUMN_COLLISION', 'KTC_EXCEL_TEMPLATE_RANGE_INVALID', 'KTC_EXCEL_TEMPLATE_CAPACITY_EXCEEDED']],
  ['historical template contracts', templateContract, ['PROCESS_TEMPLATE_CONTRACTS', 'K1:', 'K2:', 'SX3:']],
]) {
  for (const token of tokens) {
    assert.ok(source.includes(token), `Missing ${name} safety contract: ${token}`);
  }
}
for (const code of ['GC', 'MAI', 'DO', 'K1', 'K2', 'CAN', 'EP', 'XLBV', 'SX3']) {
  assert.ok(templateContract.includes(code + ':'),
    `Nine-process template contract missing ${code}`);
}

// Verify local CommonJS dependency paths structurally, not merely by searching
// for safety-related tokens. Only relative require() calls are in scope here.
const localModules = [
  'desktop/electron/excelAtomicFileWriter.cjs',
  'desktop/electron/excelDbSyncController.cjs',
  'backend/services/templateDrivenProcessExcelExportService.js',
  'backend/services/sixProcessWorkbookExportService.js',
];
for (const relativeFile of localModules) {
  const absoluteFile = at(...relativeFile.split('/'));
  const source = fs.readFileSync(absoluteFile, 'utf8');
  const requires = [...source.matchAll(/\brequire\(\s*['"]([.][.\/][^'"]+)['"]\s*\)/g)];
  for (const [, specifier] of requires) {
    const target = path.resolve(path.dirname(absoluteFile), specifier);
    assert.ok([target, target + '.js', target + '.cjs', target + '.json', path.join(target, 'index.js')]
      .some(candidate => fs.existsSync(candidate)),
    `Unresolved local dependency in ${relativeFile}: ${specifier}`);
  }
}

console.log('[KTC] Repository/template layout PASS (static contracts; no runtime/build verification)');
