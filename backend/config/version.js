const pkg = require('../package.json');
const {
  getCanonicalMigrationManifest,
  getExpectedSchemaMetadata,
} = require('../services/migrationManifestService');

const expectedSchema = getExpectedSchemaMetadata(getCanonicalMigrationManifest());

module.exports = Object.freeze({
  backendVersion: process.env.BACKEND_VERSION || pkg.version || '1.5.0',
  commitSha: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local',
  apiVersion: process.env.API_VERSION || '1',
  schemaVersion: expectedSchema.expectedSchemaVersion,
  expectedSchemaVersion: expectedSchema.expectedSchemaVersion,
  expectedMigration: expectedSchema.expectedMigration,
  expectedMigrationChecksum: expectedSchema.expectedChecksum,
});
