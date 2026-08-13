const test = require('node:test');
const assert = require('node:assert/strict');
const { getProcessMachinePolicy } = require('../services/processMachinePolicy');
const { getGcMachineRule } = require('../services/factoryMachineRuleService');

test('machine policies match real KTC factory rules 2026-08-10', () => {
  assert.deepEqual(getProcessMachinePolicy(2), { code: 'MAI', mode: 'MULTI_MACHINE_REQUIRED', minMachines: 1, maxMachines: 4 });
  assert.equal(getProcessMachinePolicy(60001).mode, 'SINGLE_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(60003).mode, 'SINGLE_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(1).mode, 'MANUAL_OR_SMART_MACHINE');
  assert.equal(getProcessMachinePolicy(3).mode, 'MANUAL_OR_SINGLE_MACHINE');
  assert.equal(getProcessMachinePolicy(4).maxMachines, 1);
  assert.equal(getProcessMachinePolicy(60002).mode, 'SINGLE_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(60004).mode, 'MANUAL_ONLY');
  assert.equal(getProcessMachinePolicy(60005).mode, 'MANUAL_ONLY');
});

test('GC automatic/shared machine rules match factory declaration', () => {
  for (const n of [1,2,10,11,4,3,9,8,25,26,14,17,23,24,16]) {
    assert.equal(getGcMachineRule(String(n)).automatic, true, `machine ${n}`);
  }
  for (const n of [5,6,7,11]) {
    const rule = getGcMachineRule(String(n));
    assert.equal(rule.maxWorkers, 4, `machine ${n}`);
    assert.equal(rule.outputBasis, 'MACHINE', `machine ${n}`);
  }
  assert.equal(getGcMachineRule('12').maxWorkers, 1);
  assert.equal(getGcMachineRule('12').outputBasis, 'PRODUCT');
});
