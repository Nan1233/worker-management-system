const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseJsonc, stripJsonc } = require('../scripts/lib/jsonc.cjs');

test('parseJsonc strips line/block comments and trailing commas but keeps string content', () => {
  const value = parseJsonc('{\n // c\n "a": "http://x//y", /* b */ "b": [1, 2,],\n "c": "/* not */",\n}');
  assert.deepEqual(value, { a: 'http://x//y', b: [1, 2], c: '/* not */' });
  assert.throws(() => parseJsonc('{ "a": 1 /* open'), SyntaxError);
  assert.equal(stripJsonc('"\\"//"'), '"\\"//"');
});

test('every committed wrangler*.jsonc parses as JSONC', () => {
  const root = path.resolve(__dirname, '..');
  for (const file of ['backend/wrangler.jsonc', 'backend/wrangler.production.jsonc', 'frontend/wrangler.jsonc', 'frontend/wrangler.production.jsonc', 'wrangler.jsonc']) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const config = parseJsonc(fs.readFileSync(full, 'utf8'));
    assert.equal(typeof config.name, 'string', `${file} must have a worker name`);
  }
});
