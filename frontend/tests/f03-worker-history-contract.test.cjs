'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../src/pages/worker');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('merged pending/approved history has source-qualified React keys and detail URLs', () => {
  const history = read('ProductionHistory.tsx');
  assert.match(history, /key=\{\x60\$\{item\.source/);
  assert.match(history, /history\/\$\{item\.id\}\?source=\$\{source\}/);
});

test('detail and edit wrapper use the same worker edit permission policy', () => {
  const detail = read('ProductionReadonlyDetail.tsx');
  const wrapper = read('WorkerReportEdit.tsx');
  assert.match(detail, /getWorkerEditWindow\(report/);
  assert.match(detail, /editWindow\.editable/);
  assert.match(detail, /source !== "approved"/);
  assert.match(wrapper, /getWorkerEditWindow\(report\)/);
});

test('unlimited edit mode does not disable save button after 10 minutes', () => {
  const edit = read('WorkerReportEditV2.tsx');
  assert.match(edit, /WORKER_EDIT_TIME_LIMIT_ENABLED && remaining <= 0/);
  assert.match(edit, /!getWorkerEditWindow\(report\)\.editable/);
  assert.match(edit, /TEMP_REPORT_VERSION_CONFLICT/);
  assert.match(edit, /validateMachineLines\(/);
});
