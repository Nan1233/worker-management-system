'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../controllers/dashboardController.js'),
  'utf8'
);

test('dashboard aggregates machine lines per report before joining production reports', () => {
  assert.match(source, /FROM production_report_machine_lines GROUP BY report_id\) ml ON ml\.report_id=r\.id/);
});

test('dashboard machine planned quantity falls back to standard rate times machine hours', () => {
  assert.match(
    source,
    /COALESCE\(NULLIF\(maximum_output,0\),NULLIF\(standard_output,0\)\*machine_time_hours,0\)/
  );
});

test('dashboard only counts positive machine-time rows as machine plan lines', () => {
  assert.match(source, /COALESCE\(machine_time_hours,0\)>0 AND COALESCE\(NULLIF\(maximum_output,0\),NULLIF\(standard_output,0\)\*machine_time_hours,0\)>0/);
});

test('manual planned quantity applies the saved training percentage snapshot', () => {
  assert.match(
    source,
    /r\.standard_output\*r\.actual_time\*LEAST\(100,GREATEST\(0,COALESCE\(r\.training_percent_snapshot,100\)\)\)\/100/
  );
});

test('machine-mode or zero-worker-time reports with valid machine plan lines use machine plan', () => {
  assert.match(source, /UPPER\(COALESCE\(r\.operation_mode,''\)\)='MACHINE' OR \(COALESCE\(r\.actual_time,0\)<=0 AND COALESCE\(ml\.plan_line_count,0\)>0\)/);
});
