const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(backendRoot, 'routes', 'networkAccessRoutes.js'), 'utf8');
const render = fs.readFileSync(path.join(backendRoot, 'render.yaml'), 'utf8');
const middlewarePath = path.join(backendRoot, 'middleware', 'companyNetworkMiddleware.js');

test('worker submission is not gated by company Wi-Fi/network', () => {
  assert.match(source, /allowed:\s*true/);
  assert.match(source, /restricted:\s*false/);
  assert.match(source, /enforced:\s*false/);
  assert.doesNotMatch(source, /evaluateCompanyNetwork/);
  assert.doesNotMatch(source, /COMPANY_WIFI_REQUIRED/);
  assert.equal(fs.existsSync(middlewarePath), false, 'obsolete company-network enforcement middleware must not return');
  assert.doesNotMatch(render, /COMPANY_ALLOWED_IPS/);
});
