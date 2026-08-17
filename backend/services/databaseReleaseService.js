'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const RELEASE_STEPS = Object.freeze([
  Object.freeze({ name: 'db:schema:verify', script: path.join(BACKEND_ROOT, 'scripts', 'verifyDatabaseSchema.js') }),
]);

function defaultRunStep(step) {
  return spawnSync(process.execPath, [step.script], { cwd: BACKEND_ROOT, env: process.env, encoding: 'utf8', stdio: ['inherit','inherit','inherit'] });
}

function runDatabaseRelease({ runStep = defaultRunStep } = {}) {
  const completed = [];
  for (const step of RELEASE_STEPS) {
    console.log(`[KTC][DB RELEASE] START ${step.name}`);
    const result = runStep(step) || {};
    const status = Number.isInteger(result.status) ? result.status : 1;
    if (status !== 0) {
      const error = new Error(`Database release stopped: ${step.name} failed`);
      error.code = 'DATABASE_SCHEMA_VERIFY_FAILED';
      error.step = step.name;
      error.exitCode = status || 1;
      throw error;
    }
    completed.push(step.name);
    console.log(`[KTC][DB RELEASE] OK ${step.name}`);
  }
  return Object.freeze({ success: true, completed: Object.freeze(completed) });
}

module.exports = { RELEASE_STEPS, runDatabaseRelease, _private: { defaultRunStep, BACKEND_ROOT } };
