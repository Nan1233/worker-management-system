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
  const migration = read('backend/migrations/034_map_2801_lt_to_all_gc_long_machines_20260909.sql');

  assert.match(service, /process_code:\s*processCode/);
  assert.match(controller, /findByProcessCode\(processCode\)/);
  assert.match(model, /p\.process_code/);
  assert.match(model, /ps\.work_type/);
  assert.match(domain, /returnedProcessCode === expectedProcessCode/);
  assert.match(domain, /normalizeWorkType\(product\.work_type\) === expectedWorkType/);
  assert.match(basic, /productOptions\.find/);
  assert.doesNotMatch(page, /product_code:\s*productOptions\.find/);

  // GC Cắt may use encoded -AUTO/-<machine> product suffixes, but GC Lồng
  // must use the real machine mapping instead. Applying Cắt suffix rules to
  // Lồng would hide valid products such as 2801-LT.
  assert.match(rules, /const isCutProduct = normalizeWorkType\(product\.work_type\) === "CUT"/);
  assert.match(rules, /if \(useEncodedMachineSuffix && isCutProduct\)/);
  assert.match(rules, /filter\(\(product\) => normalizeWorkType\(product\.work_type\) === "CUT"\)/);

  // Master-data contract: 2801-LT is a GC Lồng product and is available on
  // every active numeric GC machine (the Lồng machine numbering scheme).
  assert.match(migration, /process_id, product_code, machine_id/);
  assert.match(migration, /'2801-LT'/);
  assert.match(migration, /m\.process_id = 1/);
  assert.match(migration, /TRIM\(m\.machine_code\) REGEXP '\^\[0-9\]\+\$'/);
  assert.match(migration, /605/);
});
