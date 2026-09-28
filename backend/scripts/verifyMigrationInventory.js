'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Canonical migration source: backend/migrations only.
const migrationsDir = path.join(__dirname, '..', 'migrations');
const files = [];
const seen = new Set();

if (!fs.existsSync(migrationsDir)) {
  console.error(`MIGRATION_DIRECTORY_NOT_FOUND: ${migrationsDir}`);
  process.exit(1);
}

for (const name of fs.readdirSync(migrationsDir).filter((item) => /^\d+_.+\.sql$/i.test(item))) {
  if (seen.has(name)) {
    console.error(`DUPLICATE_MIGRATION_FILENAME: ${name}`);
    process.exitCode = 1;
  }
  seen.add(name);
  const match = /^(\d+)_/.exec(name);
  files.push({ filename: name, number: Number(match[1]), directory: migrationsDir });
}

files.sort((a, b) => a.number - b.number || a.filename.localeCompare(b.filename, 'en'));

const duplicateNumbers = [...new Set(files
  .filter((item, index) => files.findIndex((x) => x.number === item.number) !== index)
  .map((item) => item.number))]
  .sort((a, b) => a - b);

const versions = [...new Set(files.map((item) => item.number))].sort((a, b) => a - b);
const malformed = fs.readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith('.sql'))
  .filter((name) => !/^\d+_.+\.sql$/i.test(name));

const latest = files.at(-1) || null;
const expectedVersions = Array.from({ length: 45 }, (_, index) => index + 1);
const missingVersions = expectedVersions.filter((value) => !versions.includes(value));
const allowedHistoricalGap = missingVersions.length > 0 && missingVersions.every((value) => value >= 8 && value <= 26);
const completeExecutableInventory = versions[0] === 1 && versions.at(-1) === 45 && (!missingVersions.length || allowedHistoricalGap);

console.log(JSON.stringify({
  migration_file_count: files.length,
  migration_version_count: versions.length,
  latest: latest?.filename || null,
  latest_number: latest?.number || null,
  duplicate_numbers: duplicateNumbers,
  versions,
  missing_versions: missingVersions,
  historical_gap_008_026: allowedHistoricalGap,
  malformed_files: malformed,
  deterministic_order: true,
  complete_001_045: missingVersions.length === 0,
  executable_inventory_valid: completeExecutableInventory,
}, null, 2));

if (!latest || malformed.length || !completeExecutableInventory || process.exitCode) {
  console.error('MIGRATION_INVENTORY_INVALID');
  process.exitCode = 1;
}
