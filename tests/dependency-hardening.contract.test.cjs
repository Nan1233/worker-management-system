const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

test('dependency hardening pins vulnerable uuid transitively without force upgrades', () => {
  for (const file of ['backend/package.json', 'frontend/package.json']) {
    const pkg = readJson(file);
    assert.equal(pkg.overrides?.uuid, '11.1.1', `${file} must pin patched uuid`);
    const scripts = Object.values(pkg.scripts || {}).join('\n');
    assert.doesNotMatch(scripts, /npm audit fix --force/i, `${file} must not force dependency downgrades`);
  }
});

test('lockfiles carry the same uuid override contract', () => {
  for (const file of ['backend/package-lock.json', 'frontend/package-lock.json']) {
    const lock = readJson(file);
    assert.equal(lock.packages?.['']?.overrides?.uuid, '11.1.1', `${file} root override mismatch`);
  }
});
