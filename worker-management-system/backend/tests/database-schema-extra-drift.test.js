'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCanonicalSchema,
} = require('../services/canonicalSchemaContractService');
const {
  verifyDatabaseSchema,
} = require('../services/databaseSchemaService');

function mockExecutor() {
  const canonical = getCanonicalSchema();
  const tableRows = [
    ...Object.keys(canonical.tables).map((TABLE_NAME) => ({ TABLE_NAME })),
    { TABLE_NAME: 'legacy_migrations' },
  ];

  return {
    async query(sql, params = []) {
      const normalized = String(sql).toLowerCase();

      if (normalized.includes('select database()')) {
        return [[{ db_name: 'worker_management' }]];
      }

      if (normalized.includes('from information_schema.tables')) {
        return [tableRows];
      }

      if (normalized.includes('from information_schema.columns')) {
        const table = String(params[1] || '').toLowerCase();
        const contract = canonical.tables[table];
        assert.ok(contract, `Unexpected table lookup: ${table}`);

        const rows = Object.values(contract.columns).map((column) => ({
          COLUMN_NAME: column.name,
          COLUMN_TYPE: column.type,
          IS_NULLABLE: column.nullable ? 'YES' : 'NO',
          COLUMN_DEFAULT: column.default,
          EXTRA: column.extra.replace('on_update_current_timestamp', 'on update CURRENT_TIMESTAMP'),
        }));

        if (table === 'users') {
          rows.push({
            COLUMN_NAME: 'legacy_migration_marker',
            COLUMN_TYPE: 'varchar(64)',
            IS_NULLABLE: 'YES',
            COLUMN_DEFAULT: null,
            EXTRA: '',
          });
        }

        return [rows];
      }

      if (normalized.includes('from information_schema.statistics')) {
        const table = String(params[1] || '').toLowerCase();
        const contract = canonical.tables[table];
        assert.ok(contract, `Unexpected index lookup: ${table}`);

        const rows = [];
        for (const index of Object.values(contract.indexes)) {
          index.columns.forEach((COLUMN_NAME, indexPosition) => {
            rows.push({
              INDEX_NAME: index.name,
              NON_UNIQUE: index.unique ? 0 : 1,
              SEQ_IN_INDEX: indexPosition + 1,
              COLUMN_NAME,
            });
          });
        }

        if (table === 'users') {
          rows.push({
            INDEX_NAME: 'idx_legacy_migration_marker',
            NON_UNIQUE: 1,
            SEQ_IN_INDEX: 1,
            COLUMN_NAME: 'legacy_migration_marker',
          });
        }

        return [rows];
      }

      throw new Error(`Unexpected schema query: ${sql}`);
    },
  };
}

test('legacy migration-era extras do not block canonical runtime readiness', async () => {
  const result = await verifyDatabaseSchema({ executor: mockExecutor() });

  assert.equal(result.ready, true);
  assert.equal(result.status, 'READY');
  assert.ok(result.extraTables.includes('legacy_migrations'));
  assert.ok(result.extraColumns.includes('users.legacy_migration_marker'));
  assert.ok(result.extraIndexes.includes('users.idx_legacy_migration_marker'));
  assert.equal(result.missingTables.length, 0);
  assert.equal(result.missingColumns.length, 0);
  assert.equal(result.invalidColumns.length, 0);
  assert.equal(result.missingIndexes.length, 0);
  assert.equal(result.invalidIndexes.length, 0);
});
