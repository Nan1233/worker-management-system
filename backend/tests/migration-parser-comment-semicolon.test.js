'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadSplitStatementsWithoutProjectDeps() {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === '../config/db') return {};
    if (request === '../services/migrationManifestService') return { getCanonicalMigrationManifest() {} };
    if (request === '../services/databaseSchemaService') return { analyzeMigrationState() {}, SCHEMA_STATUS: {} };
    if (request === '../services/migrationPreflightService') {
      return { FORMULA_EFFECTIVE_RANGE_MIGRATION: '025_formula_settings_effective_range_20260813.sql', preflightFormulaEffectiveRangeMigration() {} };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return require('../scripts/runMigrations').splitStatements;
  } finally {
    Module._load = originalLoad;
  }
}

test('semicolon inside full-line SQL comment is removed before statement splitting', () => {
  const splitStatements = loadSplitStatementsWithoutProjectDeps();
  const sql = `
-- This migration changes only the integration job runtime contract; it does not
ALTER TABLE integration_sync_jobs ADD COLUMN job_key VARCHAR(191) NULL;
UPDATE integration_sync_jobs SET status = 'pending' WHERE status = 'queued';
`;

  assert.deepEqual(splitStatements(sql), [
    'ALTER TABLE integration_sync_jobs ADD COLUMN job_key VARCHAR(191) NULL',
    "UPDATE integration_sync_jobs SET status = 'pending' WHERE status = 'queued'",
  ]);
});
