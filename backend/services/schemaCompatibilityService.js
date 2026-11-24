const db = require('../config/db');

const columnCache = new Map();

function assertIdentifier(value, label) {
  const text = String(value || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(text)) {
    throw new Error(`${label} không hợp lệ`);
  }
  return text;
}

async function hasColumn(tableName, columnName) {
  const table = assertIdentifier(tableName, 'Tên bảng');
  const column = assertIdentifier(columnName, 'Tên cột');
  const cacheKey = `${table}.${column}`.toLowerCase();

  const existing = columnCache.get(cacheKey);
  if (existing && existing.expiresAt > Date.now()) return existing.value;

  const promise = (async () => {
    const [rows] = await db.promise().query(
      `SELECT 1 AS found
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1`,
      [table, column]
    );
    return Array.isArray(rows) && rows.length > 0;
  })();

  const entry = { value: promise, expiresAt: Date.now() + 30_000 };
  columnCache.set(cacheKey, entry);
  try {
    const result = await promise;
    if (columnCache.get(cacheKey) === entry) columnCache.set(cacheKey, { value: result, expiresAt: Date.now() + 30_000 });
    return result;
  } catch (error) {
    if (columnCache.get(cacheKey) === entry) columnCache.delete(cacheKey);
    throw error;
  }
}

function clearSchemaCompatibilityCache() {
  columnCache.clear();
}

module.exports = {
  hasColumn,
  clearSchemaCompatibilityCache,
  _private: {
    assertIdentifier,
    columnCache
  }
};
