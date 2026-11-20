'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const text = fs.readFileSync(path.join(__dirname, '../src/pages/admin/masterDataConfig.ts'), 'utf8');
const code = ts.transpileModule(text, { compilerOptions: {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2020,
} }).outputText;
const moduleObj = { exports: {} };
new Function('module', 'exports', code)(moduleObj, moduleObj.exports);
const catalog = moduleObj.exports;

test('master-data role tab matrix does not expose restricted catalogs to leads', () => {
  const allTabs = catalog.allTabs;
  assert.deepEqual(allTabs.filter(x => x.roles.includes('lead')).map(x => x.key),
    ['users', 'machines', 'standards', 'deductions']);
  assert.deepEqual(allTabs.filter(x => x.roles.includes('manager')).map(x => x.key),
    ['users', 'processes', 'machines', 'standards', 'defects', 'deductions']);
  assert.ok(allTabs.find(x => x.key === 'processes').roles.includes('admin'));
});

test('process, machine, standard and defect field contracts are preserved', () => {
  assert.deepEqual(catalog.baseFields.processes.map(f => f.key), ['process_code','process_name','description']);
  assert.deepEqual(catalog.baseFields.machines.map(f => f.key), ['process_id','machine_code','machine_name']);
  assert.deepEqual(catalog.baseFields.standards.map(f => f.key), ['process_id','product_code','standard_output']);
  assert.equal(catalog.baseFields.standards.find(f => f.key === 'standard_output').step, 0.000001);
  assert.equal(catalog.codes.defects, 'defect_code');
  assert.equal(catalog.roleLabels.lead, 'Tổ trưởng');
});

test('code normalization and assigned process parsing are unchanged', () => {
  assert.equal(catalog.normalizedCode('  abc-01 '), 'ABC-01');
  assert.deepEqual(catalog.parseProcessIds('1, 2, 3'), ['1', '2', '3']);
  assert.deepEqual(catalog.parseProcessIds([2,6]), ['2','6']);
  assert.deepEqual(catalog.parseProcessIds(null), []);
});
