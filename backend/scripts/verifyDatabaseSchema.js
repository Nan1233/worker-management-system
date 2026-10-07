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
  // Report every diff list defensively: a diagnostics field that the serializer
  // does not emit must not abort the report before the remaining lines print.
  const reportList = (label, values, separator = ', ') => {
    const list = Array.isArray(values) ? values : [];
    if (list.length) console.error(`${label}: ${list.join(separator)}`);
  };

  reportList('Missing tables', diagnostics.missingTables);
  reportList('Extra tables', diagnostics.extraTables);
  reportList('Missing columns', diagnostics.missingColumns);
  reportList('Invalid columns', diagnostics.invalidColumns, ' | ');
  reportList('Extra columns', diagnostics.extraColumns);
  reportList('Missing indexes', diagnostics.missingIndexes);
  reportList('Invalid indexes', diagnostics.invalidIndexes, ' | ');
  reportList('Extra indexes', diagnostics.extraIndexes);

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
