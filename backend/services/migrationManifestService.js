'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATION_FILE_PATTERN = /^\d+_.*\.sql$/i;
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function migrationVersion(filename) {
  const match = String(filename || '').match(/^(\d+)_/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function sortMigrationFilenames(files) {
  return [...files].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function getMigrationManifestSync({ migrationsDir = DEFAULT_MIGRATIONS_DIR } = {}) {
  const files = sortMigrationFilenames(
    fs.readdirSync(migrationsDir).filter((name) => MIGRATION_FILE_PATTERN.test(name)),
  );

  const manifest = files.map((filename) => {
    const content = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    return Object.freeze({
      version: migrationVersion(filename),
      filename,
      checksum: sha256(content),
    });
  });

  return Object.freeze(manifest);
}

let cachedDefaultManifest = null;
function getCanonicalMigrationManifest() {
  if (!cachedDefaultManifest) cachedDefaultManifest = getMigrationManifestSync();
  return cachedDefaultManifest;
}

function clearMigrationManifestCacheForTests() {
  cachedDefaultManifest = null;
}

function getExpectedSchemaMetadata(manifest = getCanonicalMigrationManifest()) {
  const latest = manifest[manifest.length - 1] || null;
  return Object.freeze({
    expectedSchemaVersion: latest?.version ?? null,
    expectedMigration: latest?.filename ?? null,
    expectedChecksum: latest?.checksum ?? null,
    migrationCount: manifest.length,
  });
}

module.exports = {
  MIGRATION_FILE_PATTERN,
  DEFAULT_MIGRATIONS_DIR,
  sha256,
  migrationVersion,
  sortMigrationFilenames,
  getMigrationManifestSync,
  getCanonicalMigrationManifest,
  getExpectedSchemaMetadata,
  clearMigrationManifestCacheForTests,
};
