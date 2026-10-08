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

test('SOURCE_CONTRACT: rangeFor("month") produces first and last day of the month', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'manager', 'ApprovedReports.tsx'),
    'utf8',
  );

  assert.match(
    source,
    /rangeFor\s*=\s*\(.*\)\s*=>\s*\{/,
    'rangeFor must be defined as a function',
  );

  assert.match(
    source,
    /["']month["'].*setDate\(1\)/s,
    'rangeFor month case must set start date to 1st',
  );
});
