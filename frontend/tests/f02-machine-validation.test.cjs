'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/pages/worker/processPageValidation.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = { exports: {} };
vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Number, Object, Math, String }, {
  filename: 'processPageValidation.js'
});
const { validateMachineLines } = mod.exports;
const line = (changes = {}) => ({
  machineCode: 'C01', productCode: 'P01', hours: '8', minutes: '0',
  okQuantity: '100', ngQuantity: '2', defects: { crack: '2' },
  deductions: {}, selectedDefects: [], selectedDeductions: [], ...changes
});
const validate = (changes, processCode = 'GC') => validateMachineLines({
  processCode,
  machineLines: [line(changes)],
  isMachineValid: (code) => code === 'C01',
  isProductValid: (_machine, product) => product === 'P01'
});

test('FE accepts a valid machine line with matching NG and total time', () => {
  assert.equal(validate({}), null);
});

test('FE rejects fractional and negative quantities as backend does', () => {
  assert.match(validate({ okQuantity: '1.5' }), /số nguyên không âm/);
  assert.match(validate({ ngQuantity: '-1' }), /số nguyên không âm/);
});

test('FE rejects missing and excessive actual machine runtime', () => {
  assert.match(validate({ hours: '0', minutes: '0' }), /thời gian thực tế/);
  assert.match(validate({ hours: '13' }), /không quá 12 giờ/);
});

test('FE rejects gross machine hours above 12 including deductions', () => {
  assert.match(validate({ hours: '11', deductions: { change: '120' } }), /thời gian thực tế cộng trừ giờ/);
});

test('FE refuses mismatched GC machine NG breakdown as backend does', () => {
  assert.match(validate({ ngQuantity: '3', defects: { crack: '2' } }), /tổng chi tiết lỗi/);
});

test('FE refuses unknown machines and products', () => {
  assert.match(validate({ machineCode: 'INVALID' }), /Máy INVALID không hợp lệ/);
  assert.match(validate({ productCode: 'INVALID' }), /Sản phẩm INVALID không hợp lệ/);
});

test('FE enforces maximum machine lines', () => {
  assert.match(validateMachineLines({ processCode: 'GC', machineLines: Array(5).fill(null).map(() => line({})), maxMachines: 4 }), /Tối đa 4 máy/);
});

test('backend validator independently enforces the same numeric invariants', () => {
  const backend = fs.readFileSync(path.join(__dirname, '../../backend/services/machineLineValidationService.js'), 'utf8');
  assert.match(backend, /!Number\.isInteger\(okQuantity\) \|\| okQuantity < 0/);
  assert.match(backend, /!Number\.isFinite\(machineTimeHours\) \|\| machineTimeHours > 12/);
  assert.match(backend, /ngQuantity !== calculatedNgQuantity/);
  assert.match(backend, /machineLines\.length > maxMachines/);
});
