const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Render sync worker start command has a matching npm script', () => {
  assert.match(render, /startCommand:\s*npm run worker/);
  assert.equal(pkg.scripts?.worker, 'node worker.js');
});

test('backend startup initializes persistent Excel job recovery after DB connection', () => {
  assert.match(server, /excelExportJobQueue\s*=\s*require\("\.\/services\/excelExportJobQueue"\)/);
  assert.match(server, /await excelExportJobQueue\.initialize\(\)/);
});


test('sync worker validates environment, database connectivity and shuts down cleanly', () => {
  const worker = fs.readFileSync(path.join(root, 'worker.js'), 'utf8');
  assert.match(worker, /validateEnvironment\(process\.env, \{ production: isProduction \}\)/);
  assert.match(worker, /await db\.testConnection\(\)/);
  assert.match(worker, /SIGTERM/);
  assert.match(worker, /db\.closePool\(\)/);
});
