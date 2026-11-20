'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const dir = path.resolve(__dirname, '../src/pages/worker');

function getHelpers(name) {
  const source = fs.readFileSync(path.join(dir, name), 'utf8');
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, () => { throw Error('Unexpected runtime import'); });
  return mod.exports;
}
const { toggleSelectedDeductionKeys, transitionSelectedDeduction } = getHelpers('processDeductionLogic.ts');
const { hasProcessReportInput } = getHelpers('processFormResetGuard.ts');

test('selection toggles are pure, stable and idempotent', () => {
  const keys = ['giaoCa'];
  assert.strictEqual(toggleSelectedDeductionKeys(keys, 'giaoCa', true), keys);
  assert.deepEqual(toggleSelectedDeductionKeys(keys, 'fiveS', true), ['giaoCa', 'fiveS']);
  assert.deepEqual(toggleSelectedDeductionKeys(keys, 'giaoCa', false), []);
  assert.deepEqual(keys, ['giaoCa']);
});
test('deduction checkbox retains saved time when checked and clears when unchecked', () => {
  const prev = { giaoCa: '70', fiveS: '', nghiGiaiLao: '0' };
  assert.equal(transitionSelectedDeduction(prev, 'giaoCa', true).giaoCa, '70');
  assert.equal(transitionSelectedDeduction(prev, 'fiveS', true).fiveS, '');
  assert.equal(transitionSelectedDeduction(prev, 'nghiGiaiLao', true).nghiGiaiLao, '0');
  assert.equal(transitionSelectedDeduction(prev, 'giaoCa', false).giaoCa, '');
  assert.deepEqual(prev, { giaoCa: '70', fiveS: '', nghiGiaiLao: '0' });
});
test('reset prompts exactly when production inputs are present', () => {
  const empty = { productName: '', machineNo: '', actualTime: '', ttOk: '', ttNg: '' };
  const lines = [{ machineCode: '', productCode: '', okQuantity: '', ngQuantity: '', hours: '', minutes: '' }];
  assert.equal(hasProcessReportInput(empty, [], [], lines), false);
  for (const [key, value] of Object.entries({ productName: 'P1', machineNo: 'M1', actualTime: '0.5', ttOk: '12', ttNg: '1' })) {
    assert.equal(hasProcessReportInput({ ...empty, [key]: value }, [], [], lines), true, key);
  }
  assert.equal(hasProcessReportInput(empty, ['cat01'], [], lines), true);
  assert.equal(hasProcessReportInput(empty, [], ['giaoCa'], lines), true);
  for (const [key, value] of Object.entries({ machineCode: 'M2', productCode: 'P2', okQuantity: '25', ngQuantity: '1', hours: '2', minutes: '15' })) {
    assert.equal(hasProcessReportInput(empty, [], [], [{ ...lines[0], [key]: value }]), true, key);
  }
  assert.equal(hasProcessReportInput({ ...empty, ttOk: '0', ttNg: '0', actualTime: '0' }, [], [], lines), false);
});
test('worker form still calls submission builder after extracting reset and checkbox logic', () => {
  const source = fs.readFileSync(path.join(dir, 'ProcessPage.tsx'), 'utf8');
  assert.match(source, /toggleSelectedDeductionKeys\(previous, key, checked\)/);
  assert.match(source, /transitionSelectedDeduction\(previous, key, checked\)/);
  assert.match(source, /updateTotalDeduction\(next\)/);
  assert.match(source, /hasProcessReportInput\(form, selectedNg, selectedDeduction, machineLines\)/);
  assert.match(source, /buildProductionReportPayloads\(\{/);
});
