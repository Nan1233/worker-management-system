'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  migrationChecksum,
  getCompatibleMigrationChecksums,
} = require('../services/migrationManifestService');
const {
  analyzeMigrationState,
  SCHEMA_STATUS,
} = require('../services/databaseSchemaService');

const FILENAME = '001_example.sql';
const LF_SQL = '-- comment\nCREATE TABLE example (\n  id BIGINT PRIMARY KEY\n);\n';
const CRLF_SQL = LF_SQL.replace(/\n/g, '\r\n');

function manifestFor(sql) {
  return [{
    version: 1,
    filename: FILENAME,
    checksum: migrationChecksum(sql),
    compatibleChecksums: getCompatibleMigrationChecksums(sql),
  }];
}

test('LF and CRLF equivalents produce the same canonical migration checksum', () => {
  assert.equal(migrationChecksum(LF_SQL), migrationChecksum(CRLF_SQL));
});

test('legacy CRLF ledger checksum is accepted for the same migration content', () => {
  const manifest = manifestFor(LF_SQL);
  const legacyCrlfChecksum = require('node:crypto')
    .createHash('sha256')
    .update(CRLF_SQL)
    .digest('hex');

  const state = analyzeMigrationState(manifest, [{
    migration_id: FILENAME,
    checksum: legacyCrlfChecksum,
  }]);

  assert.equal(state.status, SCHEMA_STATUS.READY);
  assert.equal(state.ready, true);
});

test('genuinely changed SQL still reports CHECKSUM_MISMATCH', () => {
  const manifest = manifestFor(LF_SQL);
  const changedChecksum = migrationChecksum(LF_SQL.replace('BIGINT', 'INT'));

  const state = analyzeMigrationState(manifest, [{
    migration_id: FILENAME,
    checksum: changedChecksum,
  }]);

  assert.equal(state.status, SCHEMA_STATUS.CHECKSUM_MISMATCH);
  assert.equal(state.ready, false);
  assert.equal(state.checksumMismatches.length, 1);
});
