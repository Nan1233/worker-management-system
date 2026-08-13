const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'models', 'userModel.js'), 'utf8');

test('username login keeps the indexed username column sargable', () => {
  assert.match(source, /WHERE u\.username = \?/);
  assert.doesNotMatch(source, /WHERE TRIM\(u\.username\)/);
});

test('worker-code login performs indexed exact lookup before numeric compatibility fallback', () => {
  const block = source.slice(source.indexOf('const findAllByWorkerCode'), source.indexOf('// Tương thích cho code cũ'));
  const exact = block.indexOf('WHERE w.worker_code = ?');
  const fallback = block.indexOf("WHERE w.worker_code REGEXP '^[0-9]+$'");
  assert.ok(exact >= 0 && fallback > exact);
  assert.match(block, /if \(rows\.length \|\| !\/\^\[0-9\]\+\$\/\.test\(normalized\)\) return callback\(null, rows\)/);
});
