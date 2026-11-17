const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/pages/worker/processReportSubmission.ts'), 'utf8');

test('AUTO product suffix is limited to GC for machine reports', () => {
  const start = source.indexOf('const resolveSubmittedProductCode = (');
  const end = source.indexOf('\nexport function buildProductionReportPayload', start);
  assert.ok(start >= 0 && end > start, 'product submission resolver must exist');
  const resolver = source.slice(start, end);
  assert.match(resolver, /processCode:\s*string/);
  assert.match(resolver, /processCode\s*\|\|\s*""/);
  assert.match(resolver, /!==\s*"GC"/);
  const calls = source.match(/resolveSubmittedProductCode\(/g) || [];
  assert.equal(calls.length, 3, 'all three report serialization paths must use scoped resolver');
  const scopedCalls = source.match(/args\.operationType, args\.productOptions, args\.processCode \|\| ""\)/g) || [];
  assert.equal(scopedCalls.length, 3, 'each report product code must carry process code to the resolver');
});
