'use strict';

const PROFILES = Object.freeze({
  test: Object.freeze({
    environment: 'test',
    frontendUrl: 'https://ktc-fe-test.nan978971.workers.dev',
    apiUrl: 'https://ktc-be-test.nan978971.workers.dev/api',
  }),
  production: Object.freeze({
    environment: 'production',
    frontendUrl: 'https://ktc-frontend.nan978971.workers.dev',
    apiUrl: 'https://ktc-backend.nan978971.workers.dev/api',
  }),
});

function resolveDesktopDeploymentProfile(value = 'test') {
  const environment = String(value || '').trim().toLowerCase();
  const profile = PROFILES[environment];
  if (!profile) {
    const error = new Error('KTC Desktop deployment environment must be test or production');
    error.code = 'DESKTOP_DEPLOYMENT_PROFILE_INVALID';
    throw error;
  }
  return profile;
}

module.exports = { PROFILES, resolveDesktopDeploymentProfile };
