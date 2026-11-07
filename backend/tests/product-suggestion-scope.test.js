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

  assert.match(service, /params: \{ process_id: processId \}/);
  assert.match(controller, /findByProcess\(processId\)/);
  assert.match(model, /p\.process_code/);
  assert.match(model, /ps\.work_type/);
  assert.match(domain, /returnedProcessCode === expectedProcessCode/);
  assert.match(domain, /normalizeWorkType\(product\.work_type\) === expectedWorkType/);
  assert.match(basic, /productOptions\.find/);
  assert.doesNotMatch(page, /product_code:\s*productOptions\.find/);

  // Product selection uses exact product_code values; machine suffixes remain
  // valid only when they are part of an actual product_code in the master.
  assert.match(rules, /const isGcAutomaticMachine =/);
  assert.match(rules, /const selectedMachineWorkType = selectedRawMachine/);
  assert.match(rules, /selectedMachineWorkType !== "LONG"/);
  assert.doesNotMatch(rules, /isGcLongMachine/);
  assert.match(rules, /productWorkTypes\.has\("CUT"\)/);
  assert.match(rules, /productWorkTypes\.has\("LONG"\)/);
  assert.match(rules, /if \(useEncodedMachineSuffix\)/);
  assert.match(rules, /getProductMachineHint\(product\.product_code\)/);
  assert.doesNotMatch(rules, /alias_code|encoding_code|GC_AUTOMATIC_ALIAS_CODES/);

  // The current master-data contract no longer depends on the obsolete
  // 2801-LT migration fixture. Lồng selection must remain source-driven.
  assert.doesNotMatch(rules, /2801-LT/);
  // Product code prefixes are not authoritative for Cắt/Lồng. Trust the
  // configured work_type, including master rows whose product code starts C.
  assert.doesNotMatch(rules, /code\.startsWith\("C"\)/);
  assert.doesNotMatch(controller, /LIKE 'C%'/);
  assert.match(controller, /ps\.work_type/);
  assert.match(rules, /normalizeWorkType\(product\.work_type\) === selectedMachineWorkType/);
});
