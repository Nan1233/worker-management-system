'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'migrations');
const inventoryScript = path.join(root, 'scripts', 'verifyMigrationInventory.js');

test('migration inventory validator follows the latest numbered migration and allows documented historical gaps', () => {
  const numbers = fs.readdirSync(migrationsDir)
    .filter((name) => /^\d+_.+\.sql$/i.test(name))
    .map((name) => Number(/^\d+/.exec(name)[0]));
  const expectedLatest = Math.max(...numbers);
  const run = spawnSync(process.execPath, [inventoryScript], { encoding: 'utf8' });

  assert.equal(run.status, 0, run.stderr || run.stdout);
  const report = JSON.parse(run.stdout);
  assert.equal(report.latest_number, expectedLatest);
  assert.equal(report.executable_inventory_valid, true);
  assert.deepEqual(report.unexpected_missing_versions, []);
});
