"use strict";

const normalizeProcesses = (rows) =>
  rows.map((item) => ({
    id: Number(item.id),
    code: String(item.code || "").trim(),
    name: String(item.name || "").trim()
  }));

const withLegacyProcessFields = (worker, processes) => ({
  ...worker,
  processes,
  process_ids: processes.map((item) => item.id).join(","),
  process_codes: processes.map((item) => item.code).join(","),
  process_names: processes.map((item) => item.name).join(", ")
});

const createWorkerProfileLoader = ({ query }) => {
  if (typeof query !== "function") throw new TypeError("query must be a function");

  const loadProcesses = async (workerId) => normalizeProcesses(await query(
    `
      SELECT
        p.id,
        p.process_code AS code,
        p.process_name AS name
      FROM worker_processes wp
      INNER JOIN processes p ON p.id = wp.process_id
      WHERE wp.worker_id = ?
        AND p.status = 'active'
      ORDER BY p.id
    `,
    [workerId]
  ));

  const loadByColumn = async (column, value, { activeOnly = true } = {}) => {
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue) || numericValue <= 0) return null;

    const statusFilter = activeOnly
      ? "AND w.status = 'active' AND u.status = 'active'"
      : "";

    const rows = await query(
      `
        SELECT
          w.id AS worker_id,
          w.user_id,
          w.worker_code,
          w.phone,
          w.department,
          w.position,
          w.training_percent,
          w.status,
          w.created_at,
          w.updated_at,
          u.username,
          u.full_name,
          u.role,
          u.status AS user_status
        FROM workers w
        INNER JOIN users u ON u.id = w.user_id
        WHERE ${column} = ?
          ${statusFilter}
        LIMIT 1
      `,
      [numericValue]
    );

    const worker = rows[0] || null;
    if (!worker) return null;
    return withLegacyProcessFields(worker, await loadProcesses(worker.worker_id));
  };

  return {
    loadByUserId: (userId) => loadByColumn("w.user_id", userId, { activeOnly: true }),
    loadByWorkerId: (workerId, options) => loadByColumn("w.id", workerId, options)
  };
};

const createCurrentWorkerProfileLoader = ({ query }) => {
  const loader = createWorkerProfileLoader({ query });
  return loader.loadByUserId;
};

const createDatabaseQuery = (db) => async (sql, params = []) => {
  const [rows] = await db.promise().query(sql, params);
  return rows;
};

module.exports = {
  createWorkerProfileLoader,
  createCurrentWorkerProfileLoader,
  createDatabaseQuery
};
