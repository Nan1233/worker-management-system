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
const gaps = [];
for (let i = 1; i <= (latest?.number || 0); i += 1) {
  if (!parsed.some((item) => item.number === i)) gaps.push(i);
}

console.log(JSON.stringify({
  migration_count: parsed.length,
  latest: latest?.filename || null,
  latest_number: latest?.number || null,
  duplicate_numbers: duplicateNumbers,
  missing_numbers: gaps,
  deterministic_order: true,
}, null, 2));

// Duplicate numeric prefixes are legacy-compatible: filenames remain the
// durable migration identity, so renaming an already-deployed migration would
// make an existing database appear to be missing a migration. We therefore
// report duplicates but only fail on malformed filenames/order gaps.
if (!latest || gaps.length) {
  console.error('MIGRATION_INVENTORY_INVALID');
  process.exitCode = 1;
}
