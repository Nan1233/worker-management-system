'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pkg = require('../package.json');
const build = pkg.build || {};
const resources = build.extraResources || [];
const templates = resources.find((r) => r.from === '../backend/templates' && r.to === 'templates');
const shared = resources.find((r) => r.from === '../shared' && r.to === 'shared');
const requiredTemplates = [
  'bao-cao-cat-long-export.xlsx', 'TT_MAI_TEMPLATE.xlsx', 'TT_DO_TEMPLATE.xlsx',
  '03_MAU_KIEM_1.xlsx', '04_MAU_KIEM_2.xlsx', '05_MAU_CAN.xlsx',
  '06_MAU_EP.xlsx', '07_MAU_XLBV.xlsx', 'Workbook1.xlsx'
];
const requiredShared = ['excelSyncContract.cjs', 'productionOutput.cjs', 'productionMetricPrimitives.cjs'];

assert.equal(pkg.main, 'electron/launcher.cjs');
assert.ok((build.files || []).includes('electron/**/*'), 'Electron source not included');
assert.equal(build.portable?.artifactName, 'KTC-Production-Control.exe');
assert.ok(build.win?.target?.some((x) => x.target === 'portable' && x.arch?.includes('x64')), 'Missing x64 portable target');
assert.ok(templates, 'Template resources missing');
assert.ok(shared, 'Shared resources missing');
for (const name of requiredTemplates) {
  assert.ok(templates.filter?.includes(name), 'Template omitted from package: ' + name);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../../backend/templates', name)), 'Template source missing: ' + name);
}
for (const name of requiredShared) {
  assert.ok(shared.filter?.includes(name), 'Shared contract omitted: ' + name);
  assert.ok(fs.existsSync(path.resolve(__dirname, '../../shared', name)), 'Shared source missing: ' + name);
}
const launcher = fs.readFileSync(path.resolve(__dirname, '../electron/launcher.cjs'), 'utf8');
assert.match(launcher, /mkdirSync\(persistentUserData,\s*\{\s*recursive:\s*true\s*\}\)/);
assert.match(launcher, /app\.setPath\('userData', persistentUserData\)/);
console.log('[PASS] Portable EXE configuration, template and shared resource preflight');
