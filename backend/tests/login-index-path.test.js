const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'models', 'userModel.js'), 'utf8');

test('username login keeps the indexed username column sargable', () => {
  assert.match(source, /WHERE u\.username = \?/);
  assert.doesNotMatch(source, /WHERE TRIM\(u\.username\)/);
});

test('legacy worker-code alias resolves canonical worker before exact and numeric fallbacks', () => {
  const block = source.slice(source.indexOf('const findAllByWorkerCode'), source.indexOf('// Tương thích cho code cũ'));
  const alias = block.indexOf('FROM worker_code_aliases a');
  const exact = block.indexOf('WHERE w.worker_code = ?');
  const fallback = block.indexOf("WHERE w.worker_code REGEXP '^[0-9]+
");
  assert.ok(alias >= 0 && exact > alias && fallback > exact);
  assert.match(block, /WHERE a\.alias_code = \? AND a\.status = 'active'/);
  assert.match(block, /LEFT JOIN workers w ON w\.id = a\.worker_id/);
  assert.match(block, /String\(aliasRows\[0\]\.worker_status\)\.toLowerCase\(\) === "active"/);
  assert.match(block, /if \(rows\.length \|\| !\/\^\[0-9\]\+\$\/\.test\(normalized\)\) return callback\(null, rows\)/);
});
