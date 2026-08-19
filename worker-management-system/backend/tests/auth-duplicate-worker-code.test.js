const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('login prioritizes exact username and rejects ambiguous worker code', () => {
  const model = fs.readFileSync(path.join(__dirname, '../models/userModel.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/authController.js'), 'utf8');
  assert.match(model, /findExactByUsername/);
  assert.match(model, /findAllByWorkerCode/);
  assert.match(controller, /resolveLoginAccount/);
  assert.match(controller, /ACCOUNT_AMBIGUOUS/);
  assert.match(controller, /đăng nhập bằng tên đăng nhập cụ thể/i);
});
