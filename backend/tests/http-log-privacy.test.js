const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('HTTP observability strips query-string values before logging/metrics', () => {
  assert.match(source, /const requestPath = String\(req\.originalUrl \|\| req\.path \|\| ""\)\.split\("\?"\)\[0\]/);
  assert.match(source, /recordHttp\([\s\S]*path: requestPath/);
  assert.match(source, /type: "http"[\s\S]*path: requestPath/);
});
