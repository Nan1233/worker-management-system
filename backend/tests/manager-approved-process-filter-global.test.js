'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controller = fs.readFileSync(path.join(__dirname, '../controllers/managerApprovedReportsController.js'), 'utf8');
const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/manager/ApprovedReports.tsx'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/productionService.ts'), 'utf8');

test('approved process dropdown is built from all accessible approved reports, not paged data', () => {
  const metadataStart = controller.indexOf('let processes;');
  const metadataEnd = controller.indexOf('const total =', metadataStart);
  assert.ok(metadataStart > 0 && metadataEnd > metadataStart);
  const metadata = controller.slice(metadataStart, metadataEnd);
  assert.match(metadata, /SELECT DISTINCT p\.id, p\.process_code, p\.process_name/);
  assert.match(metadata, /FROM production_reports pr/);
  assert.match(metadata, /scoped\.clause/);
  assert.match(metadata, /scoped\.params/);
  assert.doesNotMatch(metadata, /LIMIT|OFFSET|whereSql|dateFrom|dateTo|processName|shift/);
  assert.match(controller, /processes !== undefined \? \{ processes \} : \{\}/);
  assert.match(frontend, /setProcessOptions\(result\.processes\.map/);
  assert.doesNotMatch(frontend, /\.\.\.reports\.map\(r => String\(r\.process_name/);
});

test('the filters are applied on the server before pagination', () => {
  assert.match(controller, /where\.push\('p\.process_name=\?'\)/);
  assert.match(controller, /where\.push\('pr\.shift=\?'\)/);
  assert.match(controller, /appendTokenizedSearch\(where, params, search/);
  assert.match(controller, /WHERE \$\{whereSql\}[\s\S]*?LIMIT \$\{pageSize\} OFFSET \$\{offset\}/);
  assert.match(frontend, /getApprovedReports\(\{ \.\.\.filters, page, pageSize: 20 \}\)/);
  assert.match(service, /process_name: filters\.processName\|\|undefined|process_name: filters\.processName\s*\|\|\s*undefined/);
});

test('additional count queries do not repeatedly load global process metadata', () => {
  assert.match(frontend, /pageSize: 1, includeMeta: false/);
  assert.match(service, /include_meta:filters\.includeMeta===false\?0:1/);
});
