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
const { parseJsonc: parseJsoncText } = require('../../scripts/lib/jsonc.cjs');
const parseJsonc = (file) => parseJsoncText(read(file));

test('Cloudflare TEST profile is explicitly isolated to TEST frontend origin', () => {
  const config = parseJsonc('wrangler.jsonc');
  assert.equal(config.name, 'ktc-be-test');
  assert.equal(config.vars.KTC_ENVIRONMENT, 'test');
  assert.equal(config.vars.NODE_ENV, 'test');
  assert.deepEqual(config.secrets.required, ['JWT_SECRET', 'DB_PASSWORD', 'TIDB_DATABASE_URL']);
  assert.equal(config.vars.KTC_FRONTEND_ORIGIN, TEST_FRONTEND_ORIGIN);
  const profile = resolveCloudflareDeploymentProfile(config.vars);
  assert.equal(profile.environment, 'test');
  assert.deepEqual(profile.allowedOrigins, [TEST_FRONTEND_ORIGIN]);
  assert.equal(profile.masterDataBootstrapEnabled, false);
});

test('Cloudflare production profile is explicit and does not contain secrets', () => {
  const config = parseJsonc('wrangler.production.jsonc');
  assert.equal(config.name, 'ktc-backend');
  assert.equal(config.vars.KTC_ENVIRONMENT, 'production');
  assert.equal(config.vars.NODE_ENV, 'production');
  assert.deepEqual(config.secrets.required, ['JWT_SECRET', 'DB_PASSWORD', 'TIDB_DATABASE_URL']);
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

test('Cloudflare production fails closed when NODE_ENV is missing or still test', () => {
  for (const nodeEnv of [undefined, '', 'test', 'development']) {
    assert.throws(
      () => resolveCloudflareDeploymentProfile({
        KTC_ENVIRONMENT: 'production',
        KTC_FRONTEND_ORIGIN: PRODUCTION_FRONTEND_ORIGIN,
        NODE_ENV: nodeEnv,
      }),
      { code: 'CLOUDFLARE_NODE_ENV_MISMATCH' }
    );
  }
  assert.equal(resolveCloudflareDeploymentProfile({
    KTC_ENVIRONMENT: 'production',
    KTC_FRONTEND_ORIGIN: PRODUCTION_FRONTEND_ORIGIN,
    NODE_ENV: 'production',
  }).environment, 'production');
  assert.throws(
    () => resolveCloudflareDeploymentProfile({
      KTC_ENVIRONMENT: 'test',
      KTC_FRONTEND_ORIGIN: TEST_FRONTEND_ORIGIN,
      NODE_ENV: 'production',
    }),
    { code: 'CLOUDFLARE_NODE_ENV_MISMATCH' }
  );
});

test('Cloudflare production rejects account-side master-data bootstrap drift', () => {
  assert.throws(
    () => resolveCloudflareDeploymentProfile({
      KTC_ENVIRONMENT: 'production',
      KTC_FRONTEND_ORIGIN: PRODUCTION_FRONTEND_ORIGIN,
      NODE_ENV: 'production',
      KTC_RUN_MASTER_DATA_BOOTSTRAP: 'true',
    }),
    { code: 'CLOUDFLARE_PRODUCTION_BOOTSTRAP_FORBIDDEN' }
  );
  const profile = resolveCloudflareDeploymentProfile({
    KTC_ENVIRONMENT: 'production',
    KTC_FRONTEND_ORIGIN: PRODUCTION_FRONTEND_ORIGIN,
    NODE_ENV: 'production',
    KTC_RUN_MASTER_DATA_BOOTSTRAP: 'false',
  });
  assert.equal(profile.masterDataBootstrapEnabled, false);
});

test('Cloudflare Worker uses profile-driven CORS and has no request-triggered master-data seed path', () => {
  const worker = read('cloudflare-worker.js');
  assert.match(worker, /resolveCloudflareDeploymentProfile/);
  assert.doesNotMatch(worker, /const cloudflareFrontendOrigin\s*=|const cloudflareTestFrontendOrigin\s*=/);
  assert.match(worker, /resolveCloudflareDeploymentProfile/);
  assert.doesNotMatch(worker, /ensureCloudflareSeeded|ensureGcDefectMasterData|ensureGcLong2801Lt/);
  assert.doesNotMatch(worker, /masterDataCache\.clear/);
});

test('Cloudflare runtime requires TiDB connection material and a strong JWT secret', () => {
  assert.throws(() => validateCloudflareRuntimeSecrets({}), {
    code: 'CLOUDFLARE_RUNTIME_SECRET_MISSING',
  });
  assert.throws(() => validateCloudflareRuntimeSecrets({
    TIDB_DATABASE_URL: 'not-a-url',
    JWT_SECRET: 'x'.repeat(40),
  }), { code: 'CLOUDFLARE_RUNTIME_SECRET_MISSING' });
  assert.throws(() => validateCloudflareRuntimeSecrets({
    TIDB_DATABASE_URL: 'https://tidb.example/ktc',
    JWT_SECRET: 'x'.repeat(40),
  }), { code: 'CLOUDFLARE_RUNTIME_SECRET_MISSING' });
  assert.deepEqual(validateCloudflareRuntimeSecrets({
    TIDB_DATABASE_URL: 'mysql://user:password@tidb.example:4000/ktc',
    JWT_SECRET: 'x'.repeat(40),
  }), { valid: true });
});

test('Cloudflare Worker CORS does not include the opposite environment or legacy Render frontend by default', () => {
  const worker = read('cloudflare-worker.js');
  const server = read('server.js');
  assert.equal(worker.includes('worker-management-system-3-dzox.onrender.com'), false);
  assert.doesNotMatch(worker, /cloudflareTestFrontendOrigin|cloudflareFrontendOrigin/);
  assert.equal(server.includes('worker-management-system-3-dzox.onrender.com'), false);
  assert.match(server, /const defaults = isProduction/);
});
