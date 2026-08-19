'use strict';

function envEnabled(name) {
  return String(process.env[name] || '').trim().toLowerCase() === 'true';
}

function anyEnvEnabled(names) {
  return names.some(envEnabled);
}

module.exports = { envEnabled, anyEnvEnabled };
