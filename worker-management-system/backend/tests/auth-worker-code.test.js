const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('login and refresh responses preserve worker_code', () => {
  const controller = read('controllers/authController.js');
  const sessions = read('models/sessionModel.js');
  assert.match(controller, /worker_code:\s*user\.worker_code\s*\|\|\s*null/);
  assert.match(controller, /worker_code:\s*session\.worker_code\s*\|\|\s*null/);
  assert.match(sessions, /w\.worker_code/);
});

test('JWT includes worker_code for session recovery', () => {
  const controller = read('controllers/authController.js');
  assert.match(controller, /worker_code:\s*user\.worker_code\s*\|\|\s*null,[\s\S]*username:\s*user\.username/);
});
