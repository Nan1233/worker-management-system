// Infrastructure: production submission idempotency lookup.
// Keep query ordering, precedence and group retry mapping identical to the legacy service.
const db = require("../config/db");
const { query } = require("../models/productionTempModelShared");

const findExistingClientRequest = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const requestId = String(data?.client_request_id || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !requestId) return null;
    // Resolve ordinary requests and grouped per-machine submissions (GC legacy + Mài).
    // Exact child request IDs take precedence; a group retry returns every child report.
    const matches = await query(executor,
        `SELECT id, status, client_request_id,
                JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.gc_group_request_id')) AS gc_group_request_id,
                JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.machine_group_request_id')) AS machine_group_request_id
           FROM production_reports_temp
          WHERE worker_id=?
            AND (client_request_id=?
                 OR JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.gc_group_request_id'))=?
                 OR JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.machine_group_request_id'))=?)
          ORDER BY id ASC`,
        [workerId, requestId, requestId, requestId]);
    const exact = matches.find((row) => String(row.client_request_id || "") === requestId);
    if (exact) return exact;
    if (!matches.length) return null;
    const grouped = matches.filter((row) =>
        String(row.gc_group_request_id || "") === requestId
        || String(row.machine_group_request_id || "") === requestId
    );
    if (!grouped.length) return null;
    return { ...grouped[0], machine_group_ids: grouped.map((row) => Number(row.id)) };
};

module.exports = { findExistingClientRequest };
