const test = require('node:test');
const assert = require('node:assert/strict');
const snapshot = require('../data/mau-goc-ktc.json');
const fs = require('node:fs');
const path = require('node:path');
const migration = fs.readFileSync(path.join(__dirname, '../migrations/026_master_data_excel_reconciliation_20260817.sql'), 'utf8');

test('KTC Excel master snapshot contains complete machine groups', () => {
  const counts = Object.fromEntries(
    ['GC', 'MAI', 'DO', 'CAN', 'EP'].map(code => [
      code,
      snapshot.machines.filter(x => x.process_code === code).length
    ])
  );
  assert.deepEqual(counts, { GC: 33, MAI: 35, DO: 23, CAN: 3, EP: 29 });

  const doCodes = snapshot.machines.filter(x => x.process_code === 'DO').map(x => x.machine_code);
  const epCodes = snapshot.machines.filter(x => x.process_code === 'EP').map(x => x.machine_code);
  assert.ok(doCodes.includes('QC'));
  assert.ok(epCodes.includes('INJ No 1'));
  assert.ok(epCodes.includes('INJ No 7'));
  assert.ok(epCodes.includes('INJ No 8'));
});

test('KTC personnel source is preserved and canonicalized without inventing ambiguous codes', () => {
  assert.equal(snapshot.personnel_source.length, 1448);
  assert.equal(snapshot.workers.length, 648);
  assert.ok(snapshot.worker_code_aliases.some(x => x.alias_code === 'P599' && x.worker_code === '599'));
  assert.equal(snapshot.personnel_unresolved.length, 2);
  assert.deepEqual(
    snapshot.personnel_unresolved.map(x => x.normalized_code).sort(),
    ['DÊ', 'THÁI']
  );
});

test('KTC MSP source mappings are preserved', () => {
  assert.equal(snapshot.product_source.length, 1005);
  assert.ok(snapshot.product_source.some(x => x.process_code === 'MAI'));
  assert.ok(snapshot.product_source.some(x => x.process_code === 'DO'));
  assert.ok(snapshot.product_source.some(x => x.process_code === 'EP'));
  assert.ok(snapshot.product_source.some(x => x.process_code === 'K1'));
});

test('KTC master-data migration creates source/reconciliation tables', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS master_personnel_source/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS worker_code_aliases/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS master_product_source/i);
});
