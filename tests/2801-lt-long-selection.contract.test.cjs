'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'backend/scripts/ensureGcLong2801Lt.js'), 'utf8');
const rules = fs.readFileSync(path.join(root, 'frontend/src/pages/worker/productSuggestionRules.ts'), 'utf8');


test('2801-LT is seeded as LONG at 605/h and mapped to numeric GC machines', () => {
  assert.match(seed, /'LONG', '2801-LT', 605/);
  assert.match(seed, /m\.process_id = 1/);
  assert.match(seed, /TRIM\(m\.machine_code\) REGEXP '\^\[0-9\]\+'/);
  assert.match(seed, /standard_output = 605/);
});

test('Lồng product filtering does not apply Cắt suffix semantics', () => {
  assert.match(rules, /const isCutProduct = normalizeWorkType\(product\.work_type\) === "CUT"/);
  assert.match(rules, /Only GC Cắt uses encoded product suffixes/);
  assert.match(rules, /2801-LT must not be hidden/);
});
