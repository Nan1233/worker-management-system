"use strict";

// Pure compatibility helpers for the TiDB Serverless HTTP driver. Keep
// mysql2-shaped result conversion and legacy SQL rewrites out of connection,
// retry, and transaction lifecycle code. No database or environment access.

function normalizeCloudflareResult(result, sql) {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    // TiDB Serverless fullResult can include rows: [] even for UPDATE/INSERT/DELETE.
    // Do not mistake that empty rowset for a SELECT result: approval's optimistic
    // transition relies on affectedRows === 1, and inserts need lastInsertId.
    const isWrite = /^\s*(?:INSERT|REPLACE|UPDATE|DELETE)\b/i.test(String(sql || ""));
    if (!isWrite && Array.isArray(result.rows)) return [result.rows, result.fields || []];
    const affectedRows = Number(result.rowsAffected ?? result.affectedRows ?? 0);
    return [{
      affectedRows,
      insertId: Number(result.lastInsertId ?? result.insertId ?? 0),
      changedRows: affectedRows,
      warningStatus: 0,
    }, result.fields || []];
  }
  return [Array.isArray(result) ? result : [], []];
}

function normalizeNotificationBackfillQuery(sql, params) {
  if (!/^\s*INSERT\s+INTO\s+notifications\b/i.test(sql) || !/\bSELECT\s+\?/i.test(sql)) return { sql, params };
  let paramIndex = 0;
  let quote = null;
  let output = "";
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      output += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) { output += sql[i + 1]; i += 1; }
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; output += ch; continue; }
    if (ch === "?" && paramIndex < params.length) {
      const numeric = Number(params[paramIndex]);
      if (!Number.isInteger(numeric) || numeric <= 0) return { sql, params };
      output += String(numeric);
      paramIndex += 1;
      continue;
    }
    output += ch;
  }
  output = output.replace(/'\?source=approved'/g, "CONCAT(CHAR(63), 'source=approved')").replace(/'\?source=pending'/g, "CONCAT(CHAR(63), 'source=pending')");
  return { sql: output, params: [] };
}

function normalizeApprovedMachineEventQuery(sql, params) {
  if (!/FROM\s+machine_production_events\b/i.test(sql) || !/status\s*=\s*'approved'/i.test(sql)) return { sql, params };
  if (!/UPPER\(TRIM\(machine_code\)\)\s*=\s*UPPER\(TRIM\(\?\)\)/i.test(sql)) return { sql, params };
  const canonicalSql = "REGEXP_REPLACE(UPPER(TRIM(machine_code)), '^(MÁY|MAY|MACHINE|GC|G|M)\\s*[-_]?', '')";
  const normalizedSql = sql.replace(/REPLACE\(REPLACE\(REPLACE\(UPPER\(TRIM\(machine_code\)\),' ',' '\),'-',''\),'_',''\)=\?/i, `${canonicalSql}=?`);
  return { sql: normalizedSql, params };
}

module.exports = {
  normalizeCloudflareResult,
  normalizeNotificationBackfillQuery,
  normalizeApprovedMachineEventQuery,
};
