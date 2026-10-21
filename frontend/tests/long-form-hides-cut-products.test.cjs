const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

function loadDomain() {
  const dir = path.join(__dirname, '../src/pages/worker');
  const compile = (name) => ts.transpileModule(fs.readFileSync(path.join(dir, name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const rules = { exports: {} };
  new Function('exports', 'require', 'module', compile('productSuggestionRules.ts'))(rules.exports, (id) => id.includes('gcMachineWorkType') ? { gcWorkTypeOfMachine: () => null } : {}, rules);
  const domain = { exports: {} };
  new Function('exports', 'require', 'module', compile('processPageDomain.ts'))(domain.exports, (id) => id === './productSuggestionRules' ? rules.exports : {}, domain);
  return domain.exports;
}

const rows = [
  { process_code: 'GC', work_type: 'Cắt', product_code: 'CD027U8' },
  { process_code: 'GC', work_type: 'Lồng', product_code: 'D027U8' },
  { process_code: 'GC', work_type: 'Cắt', product_code: '123' },
  { process_code: 'GC', work_type: 'Lồng', product_code: '123' },
  { process_code: 'GC', work_type: 'GC', product_code: 'LEGACY' },
];

test('Lồng form never lists rows stored as Cắt but keeps the Lồng row of shared codes', () => {
  const { filterProductsForProcessScope } = loadDomain();
  const codes = filterProductsForProcessScope({ products: rows, processCode: 'GC', processId: 1, operationType: 'LONG' }).map((p) => `${p.work_type}:${p.product_code}`);
  assert.deepEqual(codes, ['Lồng:D027U8', 'Lồng:123', 'GC:LEGACY']);
});

test('Cắt form still lists only Cắt rows', () => {
  const { filterProductsForProcessScope } = loadDomain();
  const codes = filterProductsForProcessScope({ products: rows, processCode: 'GC', processId: 1, operationType: 'CUT' }).map((p) => p.product_code);
  assert.deepEqual(codes, ['CD027U8', '123']);
});
