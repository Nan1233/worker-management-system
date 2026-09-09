'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('SOURCE_CONTRACT: approved manager reports are filtered and paginated on the server', () => {
  const controller = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'managerApprovedReportsController.js'), 'utf8');
  assert.match(controller, /page_size/);
  assert.match(controller, /LIMIT \? OFFSET \?/);
  assert.match(controller, /COUNT\(\*\) AS total/);
  assert.match(controller, /date_from/);
  assert.match(controller, /process_id/);
  assert.match(controller, /process_name/);
  assert.match(controller, /LIKE \?/);
  assert.match(controller, /getActorProcessScope/);
});

test('SOURCE_CONTRACT: legacy full-table production route is no longer used for manager listing', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'routes', 'productionRoutes.js'), 'utf8');
  assert.match(routes, /managerApprovedReportsController\.getApprovedReports/);
  assert.doesNotMatch(routes, /router\.get\("\/"[^\n]*getAllReports/);
});
