const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'reportService.js'), 'utf8');

test('legacy approved-by-date query uses a quoted SQL status literal', () => {
  assert.match(source, /AND pr\.status = 'approved'/);
  assert.doesNotMatch(source, /AND pr\.status = approved/);
});
