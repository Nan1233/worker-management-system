const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(backend, rel), 'utf8');

test('database-first setup has no migration directory or runner scripts', () => {
  assert.equal(fs.existsSync(path.join(backend, 'migrations')), false);
  for (const file of [
    'scripts/runPendingMigrations.js',
    'scripts/runBuildMigrations.js',
    'scripts/verifyMigrationInventory.js',
    'scripts/printMigrationStatus.js',
  ]) {
    assert.equal(fs.existsSync(path.join(backend, file)), false, file);
  }
});

test('backend package exposes no migration commands or migration-gated verify step', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const [name, command] of Object.entries(pkg.scripts || {})) {
    assert.doesNotMatch(String(name) + ' ' + String(command), /migration|db:migrate/i);
  }
  assert.equal(pkg.scripts.verify, 'npm run check && npm test');
});

test('Cloudflare Worker has no migration status endpoint or migration manifest lookup', () => {
  const worker = read('cloudflare-worker.js');
  assert.doesNotMatch(worker, /handleMigrationStatus|expectedMigrationManifest|schema_migrations|health\/migrations|migration_enabled/);
});

test('Worker config has no migration-specific runtime variables', () => {
  const config = read('wrangler.jsonc');
  assert.doesNotMatch(config, /KTC_RUN_BUILD_DB_MIGRATIONS|KTC_MIGRATION_/);
});
