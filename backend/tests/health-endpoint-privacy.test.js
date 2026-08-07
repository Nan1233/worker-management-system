const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('public health endpoint does not disclose database name or user count', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const start = source.indexOf('app.get("/api/health"');
    const end = source.indexOf('app.use("/api/network"', start);
    const block = source.slice(start, end);
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(block, /database_name|user_count|COUNT\(\*\)/i);
    assert.match(block, /SELECT 1 AS ok/);
});
