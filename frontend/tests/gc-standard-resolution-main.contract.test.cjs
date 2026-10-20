'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const resolver = fs.readFileSync(path.join(root, 'backend/services/standardResolutionService.js'), 'utf8');
const model = fs.readFileSync(path.join(root, 'backend/models/productStandardModel.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'backend/controllers/productStandardController.js'), 'utf8');
const validation = fs.readFileSync(path.join(root, 'backend/services/reportBusinessValidationService.js'), 'utf8');

test('GC machine inference is limited to C1-C12 and ML1-ML20', () => {
  assert.match(resolver, /\^ML\(\?:\[1-9\]\|1\\d\|20\)\$/);
  assert.match(resolver, /\^C\(\?:\[1-9\]\|1\[0-2\]\)\$/);
  assert.doesNotMatch(resolver, /\^ML\\d\+\$/);
  assert.doesNotMatch(resolver, /\^\\d\+\$/);
});

test('GC resolver fails closed on conflicting standards and aliases', () => {
  assert.doesNotMatch(resolver, /pickHighestDuplicateProductRow/);
  assert.match(resolver, /normalizedWorkType && pid!==1/);
  assert.match(resolver, /STANDARD_EFFECTIVE_RANGE_CONFLICT/);
  assert.match(resolver, /PRODUCT_ALIAS_CONFLICT/);
  assert.match(model, /PRODUCT_ALIAS_CONFLICT/);
});

test('standard-resolution API uses the shared resolver and no parallel machine-standard SQL path', () => {
  const route = controller.slice(controller.indexOf('exports.resolveProductStandard = async'));
  assert.match(route, /productStandardModel\.resolveByMachineAndProduct/);
  assert.doesNotMatch(route, /FROM product_machine_standards pms/i);
  assert.match(route, /INVALID_STANDARD_VALUE/);
});

test('report validation does not infer Lồng when machine data is missing', () => {
  assert.match(validation, /\^ML\(\?:\[1-9\]\|1\\d\|20\)\$/);
  assert.match(validation, /\^C\(\?:\[1-9\]\|1\[0-2\]\)\$/);
  assert.doesNotMatch(validation, /normalizedMachineNo\s*\?[^;]*:\s*"Lồng"/);
});
