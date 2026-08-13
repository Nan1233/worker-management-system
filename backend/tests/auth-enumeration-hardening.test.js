const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'authController.js'), 'utf8');

test('ambiguous unauthenticated login does not disclose candidate usernames', () => {
  const branch = source.slice(source.indexOf('if (resolvedAccount.ambiguous)'), source.indexOf('if (!resolvedAccount.user)'));
  assert.match(branch, /code:\s*"ACCOUNT_AMBIGUOUS"/);
  assert.match(branch, /candidateCount/);
  assert.doesNotMatch(branch, /usernames:\s*resolvedAccount\.usernames/);
});
