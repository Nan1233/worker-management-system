'use strict';
// Regression: `npm start` runs two pre-start scripts before server.js. ensureGcLong2801Lt.js only
// exported a function, never called it and never exited, so the shell chain `a && b && server`
// blocked forever on `b` and the API never started. Each pre-start script must finish on its own.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.resolve(__dirname, '..');
const preStartScripts = JSON.parse(fs.readFileSync(path.join(backend, 'package.json'), 'utf8')).scripts.start
  .split('&&').map((part) => part.trim()).filter((part) => /^node scripts\/[\w.-]+\.js$/.test(part))
  .map((part) => part.replace(/^node /, ''));

test('npm start has pre-start scripts to check', () => assert.ok(preStartScripts.length >= 2, preStartScripts.join(',')));

for (const script of preStartScripts) {
  test(`${script} terminates by itself (unreachable DB must fail fast, not hang)`, async () => {
    const child = spawn(process.execPath, [script], {
      cwd: backend,
      env: { ...process.env, NODE_ENV: 'development', DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'x', DB_PASSWORD: 'x', DB_NAME: 'x', DB_SSL: 'false', JWT_SECRET: 'prestart-test-secret-prestart-test-secret' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve({ hung: true }); }, 45000);
      child.on('exit', (code) => { clearTimeout(timer); resolve({ hung: false, code }); });
    });
    assert.equal(result.hung, false, `${script} did not exit within 45 s`);
    assert.ok([0, 1].includes(result.code), `unexpected exit code ${result.code}`);
  });
}
