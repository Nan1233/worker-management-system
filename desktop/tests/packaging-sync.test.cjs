'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = (relative) => fs.readFileSync(path.resolve(root, relative), 'utf8');

test('approved reports page size is 20 in frontend bundled into EXE', () => {
  const approved = source('../frontend/src/pages/manager/ApprovedReports.tsx');
  assert.match(approved, /getApprovedReports\(\{\s*\.\.\.filters,\s*page,\s*pageSize:\s*20\s*\}\)/);
  const build = source('scripts/buildBundledFrontend.cjs');
  assert.match(build, /build:cloudflare:test/);
  assert.match(build, /fs\.cpSync\(source, output/);
  const pkg = JSON.parse(source('package.json'));
  assert.ok(pkg.build.files.includes('frontend/dist/**/*'));
  assert.match(pkg.scripts['dist:portable:bundled-fe'], /ktcBundledFrontend=true/);
  assert.match(pkg.scripts['dist:setup:bundled-fe'], /ktcBundledFrontend=true/);
});

test('Excel v6 patches main.cjs at load time and must precede its import', () => {
  const launcher = source('electron/launcher.cjs');
  const v6 = source('electron/excelExportContractPatch.v6.cjs');
  assert.match(v6, /patchMainSource\(source\)/);
  const order = [
    "require('./excelExportContractPatch.v5.cjs')",
    "require('./compactGcExcelPatch.cjs')",
    "require('./excelReportDateSubmissionPatch.cjs')",
    "require('./excelExportContractPatch.v6.cjs')",
    "require('./main.cjs')"
  ];
  for (let i = 0; i < order.length - 1; i++) {
    assert.ok(launcher.indexOf(order[i]) >= 0, 'Missing patch: ' + order[i]);
    assert.ok(launcher.indexOf(order[i]) < launcher.indexOf(order[i + 1]), 'Patch order changed: ' + order[i]);
  }
});

test('unpacked FE build bypasses repeated portable extraction', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.match(pkg.scripts['dist:folder:bundled-fe'], /--win dir/);
  assert.match(pkg.scripts['dist:folder:bundled-fe'], /ktcBundledFrontend=true/);
});
