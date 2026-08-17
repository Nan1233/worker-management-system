'use strict';

const db = require('../config/db');
const { verifyDatabaseSchema, toSafeSchemaDiagnostics } = require('../services/databaseSchemaService');

async function main() {
  const result = await verifyDatabaseSchema();
  const diagnostics = toSafeSchemaDiagnostics(result);

  if (result.ready) {
    console.log('DATABASE CONTRACT READY');
    console.log(`Source: ${diagnostics.databaseSource}`);
    return;
  }

  console.error('DATABASE_CONTRACT_INVALID');
  console.error(`Status: ${diagnostics.status}`);
  console.error(`Source: ${diagnostics.databaseSource}`);

  if (diagnostics.missingTables?.length) {
    console.error(`Missing tables: ${diagnostics.missingTables.join(', ')}`);
  }

  if (diagnostics.missingColumns?.length) {
    console.error(
      `Missing columns: ${diagnostics.missingColumns.map(
        ({ table, column }) => `${table}.${column}`
      ).join(', ')}`
    );
  }

  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('DATABASE_CONTRACT_INVALID');
    console.error(`Status: ${error?.code || 'DATABASE_UNAVAILABLE'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
