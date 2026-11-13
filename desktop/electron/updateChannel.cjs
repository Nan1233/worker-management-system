'use strict';

// Separate TEST prereleases from production stable releases on the shared GitHub repo.
function resolveUpdateChannel(environment = 'test') {
  const value = String(environment || '').toLowerCase();
  if (value === 'test') return { channel: 'beta', allowPrerelease: true };
  if (value === 'production') return { channel: 'latest', allowPrerelease: false };
  throw new Error('Unknown desktop update environment');
}

module.exports = { resolveUpdateChannel };
