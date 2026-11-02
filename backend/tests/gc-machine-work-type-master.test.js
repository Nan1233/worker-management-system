const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { normalizeMachineGcWorkType, gcWorkTypeLabel, isMissingColumnError, queryWithOptionalGcWorkType } = require('../utils/gcMachineWorkType');
const { validateEncodedGcMachineProduct } = require('../utils/productMachineEligibility');

test('normalizeMachineGcWorkType accepts only CUT/LONG spellings and never guesses', () => {
  for (const value of ['CUT', 'cut', 'Cắt', 'CẮT', 'cat']) assert.equal(normalizeMachineGcWorkType(value), 'CUT', value);
  for (const value of ['LONG', 'long', 'Lồng', 'LỒNG']) assert.equal(normalizeMachineGcWorkType(value), 'LONG', value);
  for (const value of [null, undefined, '', 'GC', 'C13', 'ML1', 'other', 0]) assert.equal(normalizeMachineGcWorkType(value), null, String(value));
  assert.equal(gcWorkTypeLabel('CUT'), 'Cắt');
  assert.equal(gcWorkTypeLabel('LONG'), 'Lồng');
  assert.equal(gcWorkTypeLabel(null), null);
});

test('queryWithOptionalGcWorkType retries without the column only for a missing-column error', async () => {
  const seen = [];
  const rows = await queryWithOptionalGcWorkType(
    async (sql) => {
      seen.push(sql);
      if (sql.includes('gc_work_type')) { const e = new Error('Unknown column'); e.errno = 1054; throw e; }
      return [{ id: 1 }];
    },
    (withType) => `SELECT id${withType ? ', gc_work_type' : ''} FROM machines`
  );
  assert.deepEqual(rows, [{ id: 1 }]);
  assert.equal(seen.length, 2);
  assert.ok(isMissingColumnError({ code: 'ER_BAD_FIELD_ERROR' }));
  await assert.rejects(
    queryWithOptionalGcWorkType(async () => { throw Object.assign(new Error('boom'), { errno: 1213 }); }, () => 'SELECT 1'),
    /boom/,
    'other database errors must not be swallowed'
  );
});

test('2801-LT is restricted to Lồng machines using the machine master type, with the prefix only as a restrictive fallback', () => {
  const base = { processCode: 'GC', productCode: '2801-LT', operationMode: 'MACHINE' };
  // master says LONG -> allowed even for a code that does not look like ML1..ML20
  assert.equal(validateEncodedGcMachineProduct({ ...base, machineCode: 'ML21', machineGcWorkType: 'LONG' }), null);
  // master says CUT (e.g. C13) -> rejected
  assert.ok(validateEncodedGcMachineProduct({ ...base, machineCode: 'C13', machineGcWorkType: 'CUT' }));
  // no master type supplied -> legacy ML prefix keeps the restriction
  assert.equal(validateEncodedGcMachineProduct({ ...base, machineCode: 'ML4' }), null);
  assert.ok(validateEncodedGcMachineProduct({ ...base, machineCode: 'C5' }));
});

test('machineModel.findByProcess returns gc_work_type and falls back when migration 059 is missing', async () => {
  const dbPath = require.resolve('../config/db');
  const modelPath = require.resolve('../models/machineModel');
  const original = require.cache[dbPath];
  const calls = [];
  try {
    for (const missing of [false, true]) {
      calls.length = 0;
      require.cache[dbPath] = {
        id: dbPath, filename: dbPath, loaded: true,
        exports: {
          query(sql, params, cb) {
            calls.push(sql);
            if (missing && sql.includes('gc_work_type')) { const e = new Error('Unknown column'); e.errno = 1054; return cb(e); }
            return cb(null, [{ id: 1, machine_code: 'C13', gc_work_type: missing ? undefined : 'CUT' }]);
          }
        }
      };
      delete require.cache[modelPath];
      const model = require('../models/machineModel');
      const rows = await model.findByProcess(1);
      assert.equal(rows.length, 1);
      assert.equal(calls[0].includes('gc_work_type'), true);
      assert.equal(calls.length, missing ? 2 : 1);
      assert.equal(rows[0].gc_work_type, missing ? undefined : 'CUT');
    }
  } finally {
    delete require.cache[modelPath];
    if (original) require.cache[dbPath] = original; else delete require.cache[dbPath];
  }
});

test('no backend service infers Cắt/Lồng from a machine-code prefix range any more', () => {
  const files = ['services/standardResolutionService.js', 'services/reportBusinessValidationService.js', 'services/machineLineValidationService.js'];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /\^ML\(\?:\[1-9\]\|1\\d\|20\)/, `${file} still hardcodes ML1-ML20`);
    assert.doesNotMatch(source, /\^C\(\?:\[1-9\]\|1\[0-2\]\)/, `${file} still hardcodes C1-C12`);
    assert.doesNotMatch(source, /inferGcWorkType/, `${file} still defines the prefix inference`);
  }
  assert.match(read('services/standardResolutionService.js'), /gcWorkTypeLabel\(machine\?\.gc_work_type\)/);
  assert.match(read('services/reportBusinessValidationService.js'), /gcWorkTypeLabel\(machines\[0\]\?\.gc_work_type\)/);
});
