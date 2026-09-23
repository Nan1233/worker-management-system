'use strict';

const EXPECTED_LATEST_VERSION = 45;
const HISTORICAL_GAP_START = 8;
const HISTORICAL_GAP_END = 26;
const DEFAULT_REPOSITORY = 'Nan1233/worker-management-system';

const isCloudflareWorker = process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);
const migrationRef = String(process.env.KTC_MIGRATION_REF || (isCloudflareWorker ? 'test' : 'main')).trim();
const repository = String(process.env.KTC_MIGRATION_REPOSITORY || DEFAULT_REPOSITORY).trim();
const apiBase = `https://api.github.com/repos/${repository}`;
const rawBase = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(migrationRef)}`;

function getMigrationError(error) {
  return String(error?.message || error || 'Unknown migration error');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ktc-migration-runner' },
  });
  if (!response.ok) throw new Error(`GitHub manifest request failed: HTTP ${response.status} ${response.statusText} ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: 'text/plain', 'User-Agent': 'ktc-migration-runner' } });
  if (!response.ok) throw new Error(`Migration SQL request failed: HTTP ${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

function normalizeMigrationEntries(entries) {
  if (!Array.isArray(entries)) throw new Error('GitHub migration manifest is not an array.');
  return entries
    .filter(entry => entry && entry.type === 'file' && /^\d+_.+\.sql$/i.test(String(entry.name || '')))
    .map(entry => ({
      filename: String(entry.name),
      number: Number(/^(\d+)_/.exec(String(entry.name))[1]),
      downloadUrl: String(entry.download_url || `${rawBase}/backend/migrations/${encodeURIComponent(entry.name)}`),
    }));
}

function validateMigrationInventory(migrations) {
  const seen = new Set();
  for (const entry of migrations) {
    if (seen.has(entry.filename)) throw new Error(`Duplicate migration filename in repository: ${entry.filename}`);
    seen.add(entry.filename);
  }
  migrations.sort((a, b) => a.number - b.number || a.filename.localeCompare(b.filename, 'en'));
  const versions = [...new Set(migrations.map(entry => entry.number))].sort((a, b) => a - b);
  const expected = Array.from({ length: EXPECTED_LATEST_VERSION }, (_, index) => index + 1);
  const missing = expected.filter(version => !versions.includes(version));
  const allowedHistoricalGap = missing.length > 0 && missing.every(version => version >= HISTORICAL_GAP_START && version <= HISTORICAL_GAP_END);
  if (!migrations.length || versions[0] !== 1 || versions.at(-1) !== EXPECTED_LATEST_VERSION || (missing.length && !allowedHistoricalGap)) {
    throw new Error(`Migration version inventory invalid: expected 001-045 executable range, got ${versions.join(', ')}; missing ${missing.join(', ')}`);
  }
  return { entries: migrations, versions, missingVersions: missing };
}

async function loadMigrationManifest() {
  const manifestUrl = `${rawBase}/backend/migrations/manifest.json`;
  try {
    const manifest = await fetchJson(manifestUrl);
    const names = Array.isArray(manifest?.migrations) ? manifest.migrations : manifest;
    if (!Array.isArray(names)) throw new Error('Static migration manifest has no migrations array.');
    const entries = names.map(name => ({
      name: String(name),
      type: 'file',
      download_url: `${rawBase}/backend/migrations/${encodeURIComponent(String(name))}`,
    }));
    const result = validateMigrationInventory(normalizeMigrationEntries(entries));
    console.log(`[KTC][MIGRATION] static manifest loaded: ${result.entries.length} SQL files / ${result.versions.length} migration versions (latest 045), ref=${migrationRef}`);
    return result;
  } catch (error) {
    console.error(`[KTC][MIGRATION] static manifest request failed: ${getMigrationError(error)}`);
    throw error;
  }
}

function splitSql(sql) {
  const statements = [];
  let start = 0;
  let quote = null;
  let lineComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (quote) {
      if (ch === quote && next === quote) { i += 1; continue; }
      if (ch === quote && sql[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '-' && next === '-' && (i + 2 >= sql.length || /\s/.test(sql[i + 2]))) { lineComment = true; i += 1; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === ';') {
      const statement = sql.slice(start, i + 1).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }
  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function runPendingMigrations() {
  const { entries, versions, missingVersions } = await loadMigrationManifest();
  const db = require('../config/db');
  const missingDb = typeof db.getMissingDatabaseVariables === 'function' ? db.getMissingDatabaseVariables() : [];
  if (missingDb.length) throw new Error(`Migration database configuration missing: ${missingDb.join(', ')}`);
  const connection = await db.promise().getConnection();
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (migration_id VARCHAR(160) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    console.log(`[KTC][MIGRATION] manifest loaded: ${entries.length} SQL files / ${versions.length} migration versions (latest 045), ref=${migrationRef}`);
    if (missingVersions.length) {
      const [rows] = await connection.query(`SELECT migration_id FROM schema_migrations WHERE CAST(SUBSTRING_INDEX(migration_id, '_', 1) AS UNSIGNED) BETWEEN ? AND ? ORDER BY migration_id`, [HISTORICAL_GAP_START, HISTORICAL_GAP_END]);
      const appliedVersions = new Set(rows.map(row => Number(String(row.migration_id).split('_', 1)[0])));
      const missingHistorical = missingVersions.filter(version => !appliedVersions.has(version));
      if (missingHistorical.length) throw new Error(`Historical migrations missing from both git and schema_migrations: ${missingHistorical.map(v => String(v).padStart(3, '0')).join(', ')}`);
      console.log('[KTC][MIGRATION] verified historical migrations 008-026 in schema_migrations');
    }
    for (const migration of entries) {
      const [existing] = await connection.query('SELECT checksum FROM schema_migrations WHERE migration_id=? LIMIT 1', [migration.filename]);
      if (existing.length) {
        console.log(`[KTC][MIGRATION] already applied: ${migration.filename}`);
        continue;
      }
      const sql = await fetchText(migration.downloadUrl);
      const checksum = await sha256(sql);
      const statements = splitSql(sql).filter(statement => !['START TRANSACTION;', 'BEGIN;', 'COMMIT;', 'ROLLBACK;'].includes(statement.replace(/\s+/g, ' ').trim().toUpperCase()));
      console.log(`[KTC][MIGRATION] applying ${migration.filename} (${statements.length} statements)`);
      await connection.beginTransaction();
      try {
        for (const statement of statements) await connection.query(statement);
        await connection.query('INSERT INTO schema_migrations (migration_id, checksum) VALUES (?, ?)', [migration.filename, checksum]);
        await connection.commit();
        console.log(`[KTC][MIGRATION] applied: ${migration.filename}`);
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw new Error(`Migration failed: ${migration.filename}: ${getMigrationError(error)}`);
      }
    }
    console.log('[KTC][MIGRATION] complete: executable migration files through 045 processed');
    return true;
  } finally {
    await connection.release();
  }
}

let cloudflareBootMigrationPromise = null;
function getCloudflareBootMigrationPromise() {
  const enabled = String(process.env.KTC_RUN_BUILD_DB_MIGRATIONS || '').toLowerCase() === 'true';
  if (!isCloudflareWorker || !enabled) return null;
  if (!cloudflareBootMigrationPromise) {
    cloudflareBootMigrationPromise = runPendingMigrations()
      .then(() => {
        console.log('[KTC][MIGRATION] Cloudflare test boot migration completed');
        return true;
      })
      .catch(error => {
        console.error(`[KTC][MIGRATION] Cloudflare test boot migration failed: ${getMigrationError(error)}`, error);
        throw error;
      });
  }
  return cloudflareBootMigrationPromise;
}

async function runPendingMigrationsForRuntime() {
  const bootPromise = getCloudflareBootMigrationPromise();
  if (bootPromise) return bootPromise;
  return runPendingMigrations();
}

module.exports = runPendingMigrationsForRuntime;

if (isCloudflareWorker && String(process.env.KTC_RUN_BUILD_DB_MIGRATIONS || '').toLowerCase() === 'true') {
  getCloudflareBootMigrationPromise()?.catch(() => undefined);
}

if (require.main === module) runPendingMigrations().then(() => process.exit(0)).catch(error => { console.error(`[KTC][MIGRATION] fatal: ${getMigrationError(error)}`, error); process.exit(1); });
