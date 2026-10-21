const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEncodedGcMachineProduct } = require('../utils/productMachineEligibility');

test('GC manual rejects machine-specific suffixes', () => {
  assert.ok(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770-1', operationMode:'MANUAL'}));
  assert.equal(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770', operationMode:'MANUAL'}), null);
});

test('GC numbered products only match the selected numbered machine', () => {
  assert.equal(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770-9', machineCode:'9', isAutomatic:0, operationMode:'MACHINE'}), null);
  assert.ok(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770-9', machineCode:'1', isAutomatic:0, operationMode:'MACHINE'}));
});

test('GC auto products only match automatic machines', () => {
  assert.equal(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770-auto', machineCode:'5', isAutomatic:1, operationMode:'MACHINE'}), null);
  assert.ok(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770-auto', machineCode:'9', isAutomatic:0, operationMode:'MACHINE'}));
});

test('dashed numbers on non-legacy product codes are product names, not machine ids', () => {
  for (const code of ['T-6495', 'T-6491', '9140-3', '16M-1', '8W6-1', 'GFM-3']) {
    assert.equal(validateEncodedGcMachineProduct({processCode:'GC', productCode:code, operationMode:'MANUAL'}), null, code);
    assert.equal(validateEncodedGcMachineProduct({processCode:'GC', productCode:code, machineCode:'ML4', isAutomatic:0, operationMode:'MACHINE'}), null, code);
  }
  // The legacy Cắt alias form and -AUTO keep their machine restriction.
  assert.ok(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770-1', operationMode:'MANUAL'}));
  assert.ok(validateEncodedGcMachineProduct({processCode:'GC', productCode:'C5770-9', machineCode:'1', isAutomatic:0, operationMode:'MACHINE'}));
  assert.ok(validateEncodedGcMachineProduct({processCode:'GC', productCode:'T-6495-AUTO', machineCode:'9', isAutomatic:0, operationMode:'MACHINE'}));
});
