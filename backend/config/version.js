const pkg = require('../package.json');

module.exports = Object.freeze({
  backendVersion: process.env.BACKEND_VERSION || pkg.version || '1.5.0',
  commitSha: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local',
  apiVersion: process.env.API_VERSION || '1',
  schemaVersion: Number(process.env.KTC_DB_CONTRACT_VERSION || 1),
  expectedSchemaVersion: Number(process.env.KTC_DB_CONTRACT_VERSION || 1),
  expectedMigration: null,
  expectedMigrationChecksum: null,
  databaseSource: 'FULL_DATABASE_SNAPSHOT'
});
