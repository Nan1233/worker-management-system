'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendService = fs.readFileSync(path.join(__dirname, '../src/services/masterDataService.ts'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '../../backend/controllers/productStandardController.js'), 'utf8');
const validation = fs.readFileSync(path.join(__dirname, '../../backend/services/reportBusinessValidationService.js'), 'utf8');

test('frontend never chooses the highest standard to hide a conflict', () => {
  assert.match(frontendService, /has_conflicting_standard/);
  assert.doesNotMatch(frontendService, /Number\(b\.standard_output\)\s*-\s*Number\(a\.standard_output\)/);
  assert.doesNotMatch(frontendService, /if \(localStandard\)/);
});

test('GC reports without a machine fail closed instead of defaulting to Lồng', () => {
  assert.match(frontendService, /GC_WORK_TYPE_UNRESOLVED/);
  assert.doesNotMatch(validation, /normalizedMachineNo\s*\?[^;]*:\s*"Lồng"/);
});

test('standard resolution API uses the shared resolver instead of a second machine-standard query', () => {
  assert.match(controller, /productStandardModel\.resolveByMachineAndProduct/);
  assert.doesNotMatch(controller, /FROM product_machine_standards pms/i);
});

test('report validation classifies only the confirmed machine-code ranges', () => {
  assert.match(validation, /\^ML\(\?:\[1-9\]\|1\\d\|20\)\$/);
  assert.match(validation, /\^C\(\?:\[1-9\]\|1\[0-2\]\)\$/);
});
