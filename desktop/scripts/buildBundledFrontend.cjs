'use strict';
// Build the matching TEST FE inside Desktop, never embed the BE or TiDB secrets.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const desktop = path.resolve(__dirname, '..');
const root = path.resolve(desktop, '..', 'frontend');
const output = path.resolve(desktop, 'frontend', 'dist');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, cwd, env) {
  const result = spawnSync(npm, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Failed: npm ' + args.join(' ') + ' (exit ' + result.status + ')');
}
if (!fs.existsSync(path.join(root, 'node_modules'))) run(['ci'], root, process.env);
run(['run', 'build:cloudflare:test'], root, {
  ...process.env, VITE_API_URL: 'https://ktc-be-test.nan978971.workers.dev/api'
});
const source = path.join(root, 'dist');
if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Vite TEST dist/index.html missing');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.cpSync(source, output, { recursive: true });
console.log('[KTC] Bundled TEST frontend:', output);
