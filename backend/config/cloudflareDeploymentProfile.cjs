'use strict';

const TEST_FRONTEND_ORIGIN = 'https://ktc-fe-test.nan978971.workers.dev';
const PRODUCTION_FRONTEND_ORIGIN = 'https://ktc-frontend.nan978971.workers.dev';
const MOBILE_ORIGINS = Object.freeze(['https://localhost', 'capacitor://localhost']);

function normalizeHttpsOrigin(value, fieldName) {
  const raw = String(value || '').trim();
  let parsed;
  try { parsed = new URL(raw); } catch {
    const error = new Error(`${fieldName} must be an absolute HTTPS origin`);
    error.code = 'CLOUDFLARE_PROFILE_INVALID';
    throw error;
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== raw || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    const error = new Error(`${fieldName} must be an HTTPS origin without path, query or fragment`);
    error.code = 'CLOUDFLARE_PROFILE_INVALID';
    throw error;
  }
  return parsed.origin;
}

function resolveCloudflareDeploymentProfile(env = process.env) {
  const environment = String(env.KTC_ENVIRONMENT || '').trim().toLowerCase();
  if (environment !== 'test' && environment !== 'production') {
    const error = new Error('KTC_ENVIRONMENT must be explicitly set to test or production');
    error.code = 'CLOUDFLARE_PROFILE_INVALID';
    throw error;
  }

  const expectedFrontendOrigin = environment === 'test'
    ? TEST_FRONTEND_ORIGIN
    : PRODUCTION_FRONTEND_ORIGIN;
  const frontendOrigin = normalizeHttpsOrigin(env.KTC_FRONTEND_ORIGIN, 'KTC_FRONTEND_ORIGIN');
  if (frontendOrigin !== expectedFrontendOrigin) {
    const error = new Error(`KTC_FRONTEND_ORIGIN does not match the ${environment} deployment profile`);
    error.code = 'CLOUDFLARE_PROFILE_ORIGIN_MISMATCH';
    throw error;
  }

  const extraOrigins = String(env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => normalizeHttpsOrigin(value, 'CORS_ORIGINS'));

  const forbiddenOrigin = environment === 'test'
    ? PRODUCTION_FRONTEND_ORIGIN
    : TEST_FRONTEND_ORIGIN;
  if (extraOrigins.includes(forbiddenOrigin)) {
    const error = new Error(`CORS_ORIGINS crosses the ${environment} environment boundary`);
    error.code = 'CLOUDFLARE_PROFILE_CROSS_ENV_ORIGIN';
    throw error;
  }

  return Object.freeze({
    environment,
    frontendOrigin,
    allowedOrigins: Object.freeze([...new Set([frontendOrigin, ...extraOrigins])]),
    mobileOrigins: MOBILE_ORIGINS,
    masterDataBootstrapEnabled: String(env.KTC_RUN_MASTER_DATA_BOOTSTRAP || '').trim().toLowerCase() === 'true',
  });
}

function validateCloudflareRuntimeSecrets(env = {}) {
  const missing = [];
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  if (jwtSecret.length < 32) missing.push('JWT_SECRET (at least 32 characters)');

  const databaseUrl = String(env.TIDB_DATABASE_URL || env.TIDB_URL || env.DATABASE_URL || env.DB_URL || '').trim();
  const hasSplitCredentials = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].every((key) => String(env[key] || '').trim());
  if (!databaseUrl && !hasSplitCredentials) {
    missing.push('TIDB_DATABASE_URL or DB_HOST + DB_USER + DB_PASSWORD + DB_NAME');
  } else if (databaseUrl) {
    try {
      const parsed = new URL(databaseUrl);
      if (!parsed.hostname) missing.push('valid TIDB_DATABASE_URL host');
    } catch {
      missing.push('valid TIDB_DATABASE_URL');
    }
  }

  if (missing.length) {
    const error = new Error(`Cloudflare Worker runtime secrets are incomplete: ${missing.join('; ')}`);
    error.code = 'CLOUDFLARE_RUNTIME_SECRET_MISSING';
    error.missing = missing;
    throw error;
  }
  return { valid: true };
}

module.exports = {
  validateCloudflareRuntimeSecrets,
  TEST_FRONTEND_ORIGIN,
  PRODUCTION_FRONTEND_ORIGIN,
  MOBILE_ORIGINS,
  resolveCloudflareDeploymentProfile,
};
