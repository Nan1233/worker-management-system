const test = require('node:test');
const assert = require('node:assert/strict');
const { getProcessMachinePolicy } = require('../services/processMachinePolicy');

test('machine policies match production rules', () => {
  assert.deepEqual(getProcessMachinePolicy(2), { code: 'MAI', mode: 'MULTI_MACHINE_REQUIRED', minMachines: 1, maxMachines: 4 });
  assert.equal(getProcessMachinePolicy(60001).mode, 'MULTI_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(60003).mode, 'MULTI_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(3).mode, 'MANUAL_OR_SINGLE_MACHINE');
  assert.equal(getProcessMachinePolicy(4).maxMachines, 1);
  assert.equal(getProcessMachinePolicy(60002).mode, 'SINGLE_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(60004).mode, 'MANUAL_ONLY');
  assert.equal(getProcessMachinePolicy(60005).mode, 'MANUAL_ONLY');
});
