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

test('Excel startup uses explicit production entry point without runtime patches', () => {
  const launcher = source('electron/launcher.cjs');
  const main = source('electron/main.cjs');
  assert.ok(launcher.includes("require('./main.cjs')"));
  assert.doesNotMatch(launcher, /require\(['"]\.\/(?:excelExportContractPatch|compactGcExcelPatch|excelReportDateSubmissionPatch)/);
  assert.match(main, /require\('\.\/productionExcelExport\.cjs'\)/);
  assert.match(main, /require\('\.\/approvedExcelDataClient\.cjs'\)/);
  assert.equal(require('../electron/excelExportContractPatch.v6.cjs').buildWorkerSplit,
    require('../electron/productionMonthlyWorkbookBuilder.cjs').buildWorkerSplit);
});

test('unpacked FE build bypasses repeated portable extraction', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.match(pkg.scripts['dist:folder:bundled-fe'], /--win dir/);
  assert.match(pkg.scripts['dist:folder:bundled-fe'], /ktcBundledFrontend=true/);
});
