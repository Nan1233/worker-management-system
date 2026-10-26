const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Worker source never requires or starts the migration runner', () => {
  const worker = read('cloudflare-worker.js');
  assert.doesNotMatch(worker, /runPendingMigrations|ensureCloudflareTestMigrations/);
  assert.match(worker, /migration_enabled: false/);
});

test('wrangler config disables automatic migrations and carries no runner allowlist', () => {
  const raw = read('wrangler.jsonc').replace(/\/\/.*$/gm, '');
  assert.match(raw, /"KTC_RUN_BUILD_DB_MIGRATIONS"\s*:\s*"false"/);
  assert.doesNotMatch(raw, /"KTC_RUN_BUILD_DB_MIGRATIONS"\s*:\s*"true"/);
  assert.doesNotMatch(raw, /"KTC_MIGRATION_(?:MAX|INCLUDE|REF|REPOSITORY)"/);
});

test('build gate validates the inventory only and never loads the database', () => {
  const gate = read('scripts/runBuildMigrations.js');
  assert.doesNotMatch(gate, /require\('..\/config\/db'\)|require\('.\/runPendingMigrations'\)/);
});

test('no start/build/postinstall script invokes the migration runner', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const name of ['start', 'prestart', 'poststart', 'postinstall', 'build', 'prebuild', 'predeploy', 'deploy']) {
    assert.doesNotMatch(String(pkg.scripts?.[name] || ''), /runPendingMigrations|db:migrate|runBuildMigrations/, name);
  }
});

test('the exported entry point refuses to migrate inside a Cloudflare Worker', () => {
  const src = read('scripts/runPendingMigrations.js');
  assert.match(src, /async function runPendingMigrationsForRuntime\(\)\{\s*if\(isCloudflareWorker\) throw new Error\('Automatic migrations are disabled/);
});

test('CLI refuses to run without explicit manual confirmation', () => {
  const env = { ...process.env };
  delete env.KTC_MANUAL_MIGRATION_CONFIRM; delete env.KTC_MIGRATION_DRY_RUN;
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'runPendingMigrations.js')], { env, encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /KTC_MANUAL_MIGRATION_CONFIRM=YES/);
});
