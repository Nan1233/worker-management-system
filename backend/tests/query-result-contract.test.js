const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');

function collectJs(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('backend query() consumers do not destructure direct query results', () => {
  const offenders = [];
  for (const file of collectJs(backendRoot)) {
    const text = fs.readFileSync(file, 'utf8');
    // Only flag direct destructuring of a custom query() helper when that
    // helper is known to return rows. Wrappers around mysql2/promise.query()
    // legitimately return the [rows, fields] tuple and must destructure it.
    const definesTupleQuery = /(?:function\s+query\s*\([^)]*\)|(?:const|let|var)\s+query\s*=)[\s\S]*?\.query\(/.test(text);
    const generated = file.includes(path.sep + '.wrangler' + path.sep) || file.includes(path.sep + 'tmp' + path.sep);
    if (!definesTupleQuery && !generated && /const\s*\[[^\]]+\]\s*=\s*await\s+query\s*\(/.test(text)) {
      offenders.push(path.relative(backendRoot, file));
    }
  }
  assert.deepEqual(offenders, []);
});

test('approval model does not call removed AuditService.logAction API', () => {
  const file = path.join(backendRoot, 'models', 'productionTempApprovalModel.js');
  const text = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /AuditService\.logAction\s*\(/);
});
