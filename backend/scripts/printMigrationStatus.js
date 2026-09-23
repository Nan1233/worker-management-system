'use strict';

const db = require('../config/db');

async function main() {
  const [rows] = await db.promise().query(`
    SELECT migration_id, applied_at
      FROM schema_migrations
     ORDER BY CAST(SUBSTRING_INDEX(migration_id, '_', 1) AS UNSIGNED), migration_id
  `);
  const items = (rows || []).map((row) => ({ migration_id: row.migration_id, applied_at: row.applied_at }));
  const versions = [...new Set(items.map((item) => Number(String(item.migration_id).split('_', 1)[0])))].sort((a, b) => a - b);
  const latest = versions.at(-1) || null;
  console.log(JSON.stringify({ migration_count: items.length, latest_version: latest, latest_migration_id: items.at(-1)?.migration_id || null, migrations: items }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('[KTC][MIGRATION] status failed:', error?.message || error);
  process.exit(1);
});
