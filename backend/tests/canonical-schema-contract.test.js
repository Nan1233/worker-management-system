'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getCanonicalSchema, CONTRACT_VERSION } = require('../services/canonicalSchemaContractService');

test('canonical schema contract parses the production source', () => {
  const schema = getCanonicalSchema();
  assert.equal(schema.version, 26);
  assert.equal(CONTRACT_VERSION, 26);
  for (const table of ['users', 'workers', 'machines', 'product_standards', 'production_reports_temp', 'production_reports', 'reporting_period_locks']) {
    assert.ok(schema.tables[table], `missing canonical table ${table}`);
  }
});

test('canonical contract includes precision, nullability and critical indexes', () => {
  const schema = getCanonicalSchema();
  assert.equal(schema.tables.product_standards.columns.standard_output.type, 'decimal(18,6)');
  assert.equal(schema.tables.production_reports_temp.columns.extra_data.type, 'json');
  assert.equal(schema.tables.production_reports_temp.columns.client_request_id.type, 'varchar(120)');
  assert.equal(schema.tables.production_reports.indexes.uq_production_source_temp.unique, true);
  assert.deepEqual(schema.tables.worker_processes.indexes.PRIMARY.columns, ['worker_id', 'process_id']);
});
