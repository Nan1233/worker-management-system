'use strict';

const db = require('../config/db');
const { verifyDatabaseSchema, toSafeSchemaDiagnostics } = require('../services/databaseSchemaService');

async function main() {
  const result = await verifyDatabaseSchema();
  const diagnostics = toSafeSchemaDiagnostics(result);
  if (result.ready) {
    console.log('Database schema READY');
    console.log(`Expected: ${diagnostics.expectedMigration || 'none'}`);
    console.log(`Actual:   ${diagnostics.actualMigration || 'none'}`);
    return;
  }

  console.error('DATABASE_SCHEMA_NOT_READY');
  console.error(`Status:          ${diagnostics.status}`);
  console.error(`Expected latest: ${diagnostics.expectedMigration || 'none'}`);
  console.error(`Actual latest:   ${diagnostics.actualMigration || 'none'}`);
  if (diagnostics.missingMigrations.length) {
    console.error(`Missing:         ${diagnostics.missingMigrations.join(', ')}`);
  }
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('DATABASE_SCHEMA_NOT_READY');
    console.error(`Status: ${error?.code || 'DATABASE_UNAVAILABLE'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
