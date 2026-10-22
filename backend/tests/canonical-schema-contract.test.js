'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getCanonicalSchema, CONTRACT_VERSION } = require('../services/canonicalSchemaContractService');

test('canonical schema contract parses the full production source', () => {
  const schema = getCanonicalSchema();

  assert.equal(schema.version, 26);
  assert.equal(CONTRACT_VERSION, 26);
  assert.equal(Object.keys(schema.tables).length, 50);

  for (const table of [
    'users',
    'workers',
    'machines',
    'product_standards',
    'production_reports_temp',
    'production_reports',
    'master_personnel_source',
    'worker_code_aliases',
    'master_product_source',
  ]) {
    assert.ok(schema.tables[table], `missing canonical table ${table}`);
  }
});

test('canonical contract includes precision, nullability and critical indexes', () => {
  const schema = getCanonicalSchema();

  assert.equal(
    schema.tables.product_standards.columns.standard_output.type,
    'decimal(18,6)',
  );
  assert.equal(
    schema.tables.production_reports_temp.columns.extra_data.type,
    'json',
  );
  assert.equal(
    schema.tables.production_reports_temp.columns.client_request_id.type,
    'varchar(120)',
  );
  assert.equal(
    schema.tables.production_reports.indexes.uq_production_source_temp.unique,
    true,
  );
  assert.deepEqual(
    schema.tables.worker_processes.indexes.primary.columns,
    ['worker_id', 'process_id'],
  );
});

test('canonical contract is bidirectional: every DB table/column/index must belong to the source contract', () => {
  const schema = getCanonicalSchema();

  for (const [table, contract] of Object.entries(schema.tables)) {
    assert.ok(Object.keys(contract.columns).length > 0, `table ${table} has no parsed columns`);
    assert.ok(contract.indexes.primary, `table ${table} has no parsed primary key`);
  }
});

// Regression: `INDEX idx (col)` (canonical SQL line "INDEX idx_user_permission_user (user_id)") was parsed as a
// column named "index", so /api/health/ready answered 503 DATABASE_CONTRACT_INVALID on every database built from
// the repository SQL.
test('table-level INDEX / KEY / UNIQUE / FOREIGN clauses are never parsed as columns', () => {
  const { parseColumnDefinition, parseIndexDefinition } = require('../services/canonicalSchemaContractService');
  for (const clause of [
    'INDEX idx_user_permission_user (user_id)',
    'index `idx_a` (`a`, `b`)',
    'KEY idx_b (b)',
    'UNIQUE KEY uq_c (c)',
    'UNIQUE INDEX uq_d (d, e)',
    'FULLTEXT INDEX ft_f (f)',
    'FOREIGN KEY (user_id) REFERENCES users(id)',
    'CONSTRAINT fk_x FOREIGN KEY (x) REFERENCES t(id)',
    'PRIMARY KEY (id)',
  ]) assert.equal(parseColumnDefinition(clause), null, clause);
  assert.deepEqual(parseIndexDefinition('INDEX idx_user_permission_user (user_id)'), { name: 'idx_user_permission_user', unique: false, columns: ['user_id'] });
  assert.deepEqual(parseIndexDefinition('UNIQUE INDEX uq_d (d, e)'), { name: 'uq_d', unique: true, columns: ['d', 'e'] });
  assert.deepEqual(parseIndexDefinition('KEY idx_b (b)'), { name: 'idx_b', unique: false, columns: ['b'] });
  // columns whose names merely START with a keyword stay columns
  assert.equal(parseColumnDefinition('index_no INT NULL').name, 'index_no');
  assert.equal(parseColumnDefinition('key_code VARCHAR(10) NOT NULL').name, 'key_code');
});

test('the canonical SQL has no column called "index" or "foreign"', () => {
  const { getCanonicalSchema } = require('../services/canonicalSchemaContractService');
  for (const [table, def] of Object.entries(getCanonicalSchema().tables)) {
    for (const bogus of ['index', 'foreign', 'check', 'key']) assert.equal(Boolean(def.columns[bogus]), false, `${table}.${bogus}`);
  }
});
