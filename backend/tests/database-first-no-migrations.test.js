const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(backend, rel), 'utf8');

test('database-first setup may retain historical SQL files but has no migration runner scripts', () => {
  // Historical/manual SQL is retained for auditability; runtime and build must not execute it.
  const migrationsDir = path.join(backend, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    // Archived migrations include a historical JSON manifest for reference.
    // Neither SQL files nor the manifest can execute as part of npm start/build.
    const entries = fs.readdirSync(migrationsDir);
    assert.ok(entries.every((name) => name.endsWith('.sql') || name === 'manifest.json'), 'migration directory contains only SQL archives and their historical manifest');
    if (entries.includes('manifest.json')) {
      const manifest = JSON.parse(fs.readFileSync(path.join(migrationsDir, 'manifest.json'), 'utf8'));
      assert.ok(Array.isArray(manifest.migrations), 'archived manifest remains valid JSON');
    }
  }
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
