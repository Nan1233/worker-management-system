'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../controllers/dashboardController.js'),
  'utf8'
);

test('dashboard aggregates machine lines per report before joining reports', () => {
  assert.ok(source.includes('FROM production_report_machine_lines GROUP BY report_id) ml ON ml.report_id=r.id'));
});

test('dashboard machine plan clamps stored maximum and standard rate at zero before fallback', () => {
  assert.ok(source.includes('GREATEST(0,COALESCE(maximum_output,0))'));
  assert.ok(source.includes('GREATEST(0,COALESCE(standard_output,0))'));
  assert.ok(source.includes('machine_time_hours,0)'));
});

test('manual planned quantity applies saved training percentage snapshot', () => {
  assert.ok(source.includes('r.standard_output*r.actual_time*LEAST(100,GREATEST(0,COALESCE(r.training_percent_snapshot,100)))/100'));
});

test('machine-mode or zero-worker-time reports with valid machine lines use machine plan', () => {
  assert.ok(source.includes("UPPER(COALESCE(r.operation_mode,''))='MACHINE' OR (COALESCE(r.actual_time,0)<=0 AND COALESCE(ml.plan_line_count,0)>0)"));
});
