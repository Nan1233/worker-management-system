'use strict';
async function findPendingProcessIds(executor,ids) {
    if (!ids.length) return [];
    const [rows] = await executor.query(
        `SELECT DISTINCT process_id FROM production_reports_temp WHERE id IN (${ids.map(()=>'?').join(',')})`,ids
    );
    return rows.map(row=>row.process_id);
}
module.exports = { findPendingProcessIds };
