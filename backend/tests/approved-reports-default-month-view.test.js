'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('SOURCE_CONTRACT: ApprovedReports defaults to current month, not a single day', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'manager', 'ApprovedReports.tsx'),
    'utf8',
  );

  assert.match(
    source,
    /useState.*rangeFor\(getToday\(\),\s*["']month["']\)/,
    'Initial range state must default to the current month via rangeFor(getToday(), "month")',
  );

  assert.doesNotMatch(
    source,
    /useState<\{[^}]*\}[^>]*>\(null\)/,
    'Initial range state must NOT be null (that shows only today)',
  );
});

test('SOURCE_CONTRACT: approved listing uses LEFT JOINs to prevent silent data loss', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'managerApprovedReportsController.js'),
    'utf8',
  );

  assert.match(controller, /LEFT JOIN workers/, 'Must use LEFT JOIN for workers');
  assert.match(controller, /LEFT JOIN users/, 'Must use LEFT JOIN for users');
  assert.match(controller, /LEFT JOIN processes/, 'Must use LEFT JOIN for processes');

  assert.doesNotMatch(
    controller,
    /(?<!LEFT\s)JOIN workers/i,
    'Must NOT use INNER JOIN for workers (drops reports with missing worker FK)',
  );
  assert.doesNotMatch(
    controller,
    /(?<!LEFT\s)JOIN users/i,
    'Must NOT use INNER JOIN for users (drops reports with missing user FK)',
  );
});

test('SOURCE_CONTRACT: bulk Excel data service uses LEFT JOINs', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'bulkCompanyExcelDataService.js'),
    'utf8',
  );

  assert.match(service, /LEFT JOIN workers/, 'Must use LEFT JOIN for workers');
  assert.match(service, /LEFT JOIN users/, 'Must use LEFT JOIN for users');
  assert.match(service, /LEFT JOIN processes/, 'Must use LEFT JOIN for processes');
});

test('SOURCE_CONTRACT: report detail uses LEFT JOINs', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'productionController.js'),
    'utf8',
  );

  const detailQuery = controller.slice(
    controller.indexOf('getReportById'),
    controller.indexOf('getReportById') + 2000,
  );

  assert.match(detailQuery, /LEFT JOIN workers/, 'Detail query must use LEFT JOIN for workers');
  assert.match(detailQuery, /LEFT JOIN users/, 'Detail query must use LEFT JOIN for users');
});

test('SOURCE_CONTRACT: backend approved listing accepts full month date range', () => {
  const controller = fs.readFileSync(
    path.join(__dirname, '..', 'controllers', 'managerApprovedReportsController.js'),
    'utf8',
  );

  assert.match(controller, /date_from/, 'Controller must accept date_from parameter');
  assert.match(controller, /date_to/, 'Controller must accept date_to parameter');
  assert.match(controller, /work_date\s*>=\s*\?/, 'Query must filter by work_date >= date_from');
  assert.match(controller, /work_date\s*<=\s*\?/, 'Query must filter by work_date <= date_to');
  assert.match(controller, /COUNT\(\*\)\s+AS\s+total/, 'Query must count total results for pagination');
  assert.match(controller, /LIMIT/, 'Query must support LIMIT for pagination');
  assert.match(controller, /OFFSET/, 'Query must support OFFSET for pagination');
});
