const pkg = require('../package.json');
module.exports = Object.freeze({
  backendVersion: process.env.BACKEND_VERSION || pkg.version || '1.5.0',
  commitSha: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local',
  apiVersion: process.env.API_VERSION || '1',
  schemaVersion: process.env.SCHEMA_VERSION || '20260728'
});
