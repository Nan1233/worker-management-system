const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'networkAccessRoutes.js'), 'utf8');

test('network access compatibility endpoint cannot reintroduce company Wi-Fi gating', () => {
  assert.match(source, /allowed:\s*true/);
  assert.match(source, /restricted:\s*false/);
  assert.match(source, /enforced:\s*false/);
  assert.doesNotMatch(source, /evaluateCompanyNetwork/);
  assert.doesNotMatch(source, /COMPANY_WIFI_REQUIRED/);
});
