const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('product suggestions are scoped by process_code and GC work_type', () => {
  const page = read('frontend/src/pages/worker/ProcessPage.tsx');
  const domain = read('frontend/src/pages/worker/processPageDomain.ts');
  const basic = read('frontend/src/pages/worker/components/ProcessBasicInfoSection.tsx');
  const service = read('frontend/src/services/masterDataService.ts');
  const controller = read('backend/controllers/productStandardController.js');
  const model = read('backend/models/productStandardModel.js');
  const rules = read('frontend/src/pages/worker/productSuggestionRules.ts');

  assert.match(service, /process_code:\s*processCode/);
  assert.match(controller, /findByProcessCode\(processCode\)/);
  assert.match(model, /p\.process_code/);
  assert.match(model, /ps\.work_type/);
  assert.match(domain, /returnedProcessCode === expectedProcessCode/);
  assert.match(domain, /normalizeWorkType\(product\.work_type\) === expectedWorkType/);
  assert.match(basic, /productOptions\.find/);
  assert.doesNotMatch(page, /product_code:\s*productOptions\.find/);

  // Cắt may uses encoded aliases/machine suffixes; Lồng must not inherit
  // those suffix rules and instead stays eligible through the real machine mapping.
  assert.match(rules, /const isGcAutomaticMachine =/);
  assert.match(rules, /const isGcLongMachine =/);
  assert.match(rules, /productWorkTypes\.has\("CUT"\)/);
  assert.match(rules, /productWorkTypes\.has\("LONG"\)/);
  assert.match(rules, /if \(useEncodedMachineSuffix\)/);
  assert.match(rules, /GC_AUTOMATIC_ALIAS_CODES\.has\(alias\)/);

  // The current master-data contract no longer depends on the obsolete
  // 2801-LT migration fixture. Lồng selection must remain source-driven.
  assert.doesNotMatch(rules, /2801-LT/);
});
