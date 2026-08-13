'use strict';

const { runDatabaseRelease } = require('../services/databaseReleaseService');

try {
  const result = runDatabaseRelease();
  console.log(`[KTC][DB RELEASE] READY (${result.completed.join(' -> ')})`);
} catch (error) {
  console.error(`[KTC][DB RELEASE] FAILED ${error.code || 'DATABASE_RELEASE_FAILED'} at ${error.step || 'unknown'}`);
  process.exitCode = Number(error.exitCode || 1);
}
