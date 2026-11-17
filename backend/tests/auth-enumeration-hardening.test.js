'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'controllers', 'authController.js'),
  'utf8'
);

test('unauthenticated login does not reveal account existence, role or active status', () => {
  const block = source.slice(
    source.indexOf('if (resolvedAccount.ambiguous)'),
    source.indexOf('const passwordIsValid', source.indexOf('if (resolvedAccount.ambiguous)'))
  );
  assert.match(block, /candidateCount/);
  assert.doesNotMatch(block, /login:\s*username/);
  assert.doesNotMatch(block, /usernames:\s*resolvedAccount\.usernames/);
  assert.doesNotMatch(block, /code:\s*"ACCOUNT_NOT_FOUND"/);
  assert.doesNotMatch(block, /code:\s*"USER_INACTIVE"/);
  assert.doesNotMatch(block, /code:\s*"WORKER_INACTIVE"/);
  assert.match(block, /code:\s*"INVALID_CREDENTIALS"/);
  assert.match(block, /message:\s*"Thông tin đăng nhập không hợp lệ"/);
});

test('password failures use the same public error as nonexistent accounts', () => {
  const wrongPassword = source.slice(
    source.indexOf('if (!passwordIsValid)'),
    source.indexOf('return issueLoginSession(req, res, user);', source.indexOf('if (!passwordIsValid)'))
  );
  assert.match(wrongPassword, /code:\s*"INVALID_CREDENTIALS"/);
  assert.match(wrongPassword, /message:\s*"Thông tin đăng nhập không hợp lệ"/);
});
