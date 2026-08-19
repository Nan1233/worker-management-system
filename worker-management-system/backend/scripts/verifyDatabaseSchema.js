'use strict';

const db = require('../config/db');
const {
  verifyDatabaseSchema,
  toSafeSchemaDiagnostics,
} = require('../services/databaseSchemaService');

async function main() {
  const result = await verifyDatabaseSchema();
  const diagnostics = toSafeSchemaDiagnostics(result);

  if (result.ready) {
    console.log(`Database runtime contract READY (v${diagnostics.contractVersion}; ${diagnostics.runtimeContract || 'MINIMUM_STRUCTURAL_V1'})`);
    return;
  }

  console.error('DATABASE_CONTRACT_INVALID');
  console.error(`Status: ${diagnostics.status}`);
  if (diagnostics.reason) console.error(`Reason: ${diagnostics.reason}`);
  if (diagnostics.missingTables.length) console.error(`Missing tables: ${diagnostics.missingTables.join(', ')}`);
  if (diagnostics.extraTables.length) console.error(`Extra tables: ${diagnostics.extraTables.join(', ')}`);
  if (diagnostics.missingColumns.length) console.error(`Missing columns: ${diagnostics.missingColumns.join(', ')}`);
  if (diagnostics.invalidColumns.length) console.error(`Invalid columns: ${diagnostics.invalidColumns.join(' | ')}`);
  if (diagnostics.extraColumns.length) console.error(`Extra columns: ${diagnostics.extraColumns.join(', ')}`);
  if (diagnostics.missingIndexes.length) console.error(`Missing indexes: ${diagnostics.missingIndexes.join(', ')}`);
  if (diagnostics.invalidIndexes.length) console.error(`Invalid indexes: ${diagnostics.invalidIndexes.join(' | ')}`);
  if (diagnostics.extraIndexes.length) console.error(`Extra indexes: ${diagnostics.extraIndexes.join(', ')}`);

  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('DATABASE_CONTRACT_INVALID');
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
