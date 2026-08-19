const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'electron', 'main.cjs'), 'utf8');
test('Desktop retries Render network and transient HTTP failures', () => {
  assert.match(source, /API_FETCH_RETRY/);
  assert.match(source, /\[408, 425, 429, 500, 502, 503, 504\]/);
  assert.match(source, /COMPANY_DATA_INVALID_PAYLOAD/);
});
