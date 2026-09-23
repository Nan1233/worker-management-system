'use strict';

// Workers Builds inject WORKERS_CI and WORKERS_CI_BRANCH into the build
// environment. Only the test branch is allowed to mutate the test TiDB DB.
if (String(process.env.WORKERS_CI || '') !== '1' || String(process.env.WORKERS_CI_BRANCH || '') !== 'test') {
  console.log('[KTC][MIGRATION] postinstall skip: not a Cloudflare Workers test build');
  process.exit(0);
}

const runPendingMigrations = require('./runPendingMigrations');

runPendingMigrations()
  .then(() => {
    console.log('[KTC][MIGRATION] test build migration gate passed');
  })
  .catch((error) => {
    console.error('[KTC][MIGRATION] test build migration gate failed:', error?.message || error);
    process.exit(1);
  });
