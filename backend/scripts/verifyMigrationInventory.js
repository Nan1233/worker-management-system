'use strict';

const fs = require('node:fs');
const path = require('node:path');

const migrationsDir = path.join(__dirname, '..', 'migrations');
const files = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d+_.+\.sql$/i.test(name))
  .sort((a, b) => a.localeCompare(b, 'en'));

const parsed = files.map((filename) => {
  const match = /^(\d+)_/.exec(filename);
  return { filename, number: Number(match[1]) };
});

const duplicateNumbers = [...new Set(parsed
  .filter((item, index) => parsed.findIndex((x) => x.number === item.number) !== index)
  .map((item) => item.number))]
  .sort((a, b) => a - b);

const latest = parsed.at(-1) || null;
const malformed = fs.readdirSync(migrationsDir)
  .filter((name) => name.toLowerCase().endsWith('.sql'))
  .filter((name) => !/^\d+_.+\.sql$/i.test(name));

console.log(JSON.stringify({
  migration_count: parsed.length,
  latest: latest?.filename || null,
  latest_number: latest?.number || null,
  duplicate_numbers: duplicateNumbers,
  malformed_files: malformed,
  deterministic_order: true,
}, null, 2));

// Numeric prefixes are not the durable migration identity in this repository;
// filenames are. Duplicate legacy prefixes are therefore diagnostic only.
// Never rename an already-deployed migration merely to make the prefix unique.
if (!latest || malformed.length) {
  console.error('MIGRATION_INVENTORY_INVALID');
  process.exitCode = 1;
}
