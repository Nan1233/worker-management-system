'use strict';

const { query } = require('../models/productionTempModelShared');

/** The repository owns SQL; the rejection use case owns selection and side effects. */
async function findRejectableReports(connection, reportIds, reviewerId, isAdmin) {
  const placeholders = reportIds.map(() => '?').join(',');
  const scopeJoin = isAdmin ? '' : 'JOIN manager_processes mp ON mp.process_id=temp.process_id';
  const scopeWhere = isAdmin ? '' : 'AND mp.manager_id=?';
  const params = isAdmin ? [...reportIds] : [...reportIds, Number(reviewerId)];
  return query(connection, `
    SELECT DISTINCT temp.id,temp.worker_id,temp.process_id,temp.work_date,temp.shift,temp.product_name,w.user_id AS worker_user_id
      FROM production_reports_temp temp
      JOIN workers w ON w.id=temp.worker_id
      ${scopeJoin}
     WHERE temp.id IN (${placeholders})
       AND temp.status IN ('pending','need_fix')
       ${scopeWhere}
     ORDER BY temp.id ASC`, params);
}

async function markReportRejected(connection, row, reviewerId, reason) {
  return query(connection, `
    UPDATE production_reports_temp
       SET status='rejected', review_note=?, reviewed_by=?, updated_at=NOW()
     WHERE id=? AND status IN ('pending','need_fix')`, [reason, Number(reviewerId), Number(row.id)]);
}

module.exports = { findRejectableReports, markReportRejected };
