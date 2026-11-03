'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TEST_FRONTEND_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
  resolveCloudflareDeploymentProfile,
  validateCloudflareRuntimeSecrets,
} = require('../config/cloudflareDeploymentProfile.cjs');

const backendRoot = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(backendRoot, file), 'utf8');
const parseJsonc = (file) => JSON.parse(read(file));

test('Cloudflare TEST profile is explicitly isolated to TEST frontend origin', () => {
  const config = parseJsonc('wrangler.jsonc');
  assert.equal(config.name, 'ktc-be-test');
  assert.equal(config.vars.KTC_ENVIRONMENT, 'test');
  assert.equal(config.vars.NODE_ENV, 'test');
  assert.equal(config.vars.KTC_FRONTEND_ORIGIN, TEST_FRONTEND_ORIGIN);
  const profile = resolveCloudflareDeploymentProfile(config.vars);
  assert.equal(profile.environment, 'test');
  assert.deepEqual(profile.allowedOrigins, [TEST_FRONTEND_ORIGIN]);
  assert.equal(profile.masterDataBootstrapEnabled, false);
});

test('Cloudflare production profile is explicit and does not contain secrets', () => {
  const config = parseJsonc('wrangler.production.jsonc');
  assert.equal(config.name, 'ktc-be');
  assert.equal(config.vars.KTC_ENVIRONMENT, 'production');
  assert.equal(config.vars.NODE_ENV, 'production');
  assert.equal(config.vars.KTC_FRONTEND_ORIGIN, PRODUCTION_FRONTEND_ORIGIN);
  assert.equal(config.vars.KTC_RUN_MASTER_DATA_BOOTSTRAP, 'false');
  assert.equal(Object.keys(config.vars).some((key) => /password|secret|database_url|tidb_url/i.test(key)), false);
  const profile = resolveCloudflareDeploymentProfile(config.vars);
  assert.equal(profile.environment, 'production');
  assert.deepEqual(profile.allowedOrigins, [PRODUCTION_FRONTEND_ORIGIN]);
  assert.equal(profile.masterDataBootstrapEnabled, false);
});

test('Cloudflare profile rejects missing environment and cross-environment origins', () => {
  assert.throws(
    () => resolveCloudflareDeploymentProfile({ KTC_FRONTEND_ORIGIN: TEST_FRONTEND_ORIGIN }),
    { code: 'CLOUDFLARE_PROFILE_INVALID' }
  );
  assert.throws(
    () => resolveCloudflareDeploymentProfile({
      KTC_ENVIRONMENT: 'production',
      KTC_FRONTEND_ORIGIN: PRODUCTION_FRONTEND_ORIGIN,
      CORS_ORIGINS: TEST_FRONTEND_ORIGIN,
    }),
    { code: 'CLOUDFLARE_PROFILE_CROSS_ENV_ORIGIN' }
  );
  assert.throws(
    () => resolveCloudflareDeploymentProfile({
      KTC_ENVIRONMENT: 'test',
      KTC_FRONTEND_ORIGIN: PRODUCTION_FRONTEND_ORIGIN,
    }),
    { code: 'CLOUDFLARE_PROFILE_ORIGIN_MISMATCH' }
  );
});

test('Cloudflare Worker uses profile-driven CORS and keeps master-data bootstrap disabled by default', () => {
  const worker = read('cloudflare-worker.js');
  assert.match(worker, /resolveCloudflareDeploymentProfile/);
  assert.doesNotMatch(worker, /const cloudflareFrontendOrigin\s*=|const cloudflareTestFrontendOrigin\s*=/);
  assert.match(worker, /masterDataBootstrapEnabled/);
  assert.match(worker, /if\s*\(!deploymentProfile\.masterDataBootstrapEnabled\)\s*return true/);
});

test('Cloudflare runtime requires TiDB connection material and a strong JWT secret', () => {
  assert.throws(() => validateCloudflareRuntimeSecrets({}), {
    code: 'CLOUDFLARE_RUNTIME_SECRET_MISSING',
  });
  assert.throws(() => validateCloudflareRuntimeSecrets({
    TIDB_DATABASE_URL: 'not-a-url',
    JWT_SECRET: 'x'.repeat(40),
  }), { code: 'CLOUDFLARE_RUNTIME_SECRET_MISSING' });
  assert.deepEqual(validateCloudflareRuntimeSecrets({
    TIDB_DATABASE_URL: 'mysql://user:password@tidb.example:4000/ktc',
    JWT_SECRET: 'x'.repeat(40),
  }), { valid: true });
});
