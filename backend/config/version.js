const pkg = require('../package.json');

module.exports = Object.freeze({
  // The package version is the source of truth for the deployed build.
  // Do not let a stale Render environment variable hide which source is running.
  backendVersion: pkg.version || process.env.BACKEND_VERSION || '1.5.0',
  commitSha: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local',
  apiVersion: process.env.API_VERSION || '1',
  schemaVersion: Number(process.env.KTC_SCHEMA_VERSION || 26),
  schemaContractVersion: Number(process.env.KTC_SCHEMA_VERSION || 26),
});
