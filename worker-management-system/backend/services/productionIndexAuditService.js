const getDb = () => require('../config/db');

async function listIndexes(executor) {
  const [rows] = await executor.promise().query(`
    SELECT TABLE_NAME table_name, INDEX_NAME index_name, NON_UNIQUE non_unique,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) columns
    FROM information_schema.statistics
    WHERE TABLE_SCHEMA = DATABASE()
      AND INDEX_NAME <> 'PRIMARY'
    GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
    ORDER BY TABLE_NAME, INDEX_NAME
  `);
  return rows || [];
}

async function logProductionIndexAudit(db = null) {
  try {
    const connection = db || getDb();
    const indexes = await listIndexes(connection);
    console.log(JSON.stringify({
      type: 'production_index_audit',
      timestamp: new Date().toISOString(),
      index_count: indexes.length,
      indexes
    }));
    return indexes;
  } catch (error) {
    console.warn('[KTC] production index audit skipped:', error?.message || error);
    return [];
  }
}

module.exports = { logProductionIndexAudit, listIndexes };
