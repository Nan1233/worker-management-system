const db = require("../config/db");
const query = (sql, params=[]) => db.promise().query(sql, params).then(([rows]) => rows);

exports.findByProcess = async (processId, filters = {}) => {
  const operationType = ["CUT","NEST"].includes(String(filters.operationType||"").toUpperCase()) ? String(filters.operationType).toUpperCase() : null;
  const operationMode = ["MANUAL","MACHINE"].includes(String(filters.operationMode||"").toUpperCase()) ? String(filters.operationMode).toUpperCase() : null;
  const machineId = Number(filters.machineId) > 0 ? Number(filters.machineId) : null;
  const sql = `SELECT DISTINCT ps.id, ps.process_id, '' AS work_type, ps.product_code,
                      CAST(ROUND(ps.standard_output) AS SIGNED) AS standard_output,
                      COALESCE(ps.exclude_kqd_from_tt,0) AS exclude_kqd_from_tt
               FROM product_standards ps
               WHERE ps.process_id=? AND ps.status='active'
                 AND (NOT EXISTS (SELECT 1 FROM product_operation_rules x WHERE x.process_id=ps.process_id AND x.status='active')
                      OR EXISTS (SELECT 1 FROM product_operation_rules por
                                 WHERE por.product_standard_id=ps.id AND por.status='active'
                                   AND (? IS NULL OR por.operation_type=?)
                                   AND (? IS NULL OR por.operation_mode=?)))
                 AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM product_machine_rules z WHERE z.product_standard_id=ps.id AND z.status='active')
                      OR EXISTS (SELECT 1 FROM product_machine_rules pmr WHERE pmr.product_standard_id=ps.id AND pmr.machine_id=? AND pmr.status='active'))
               ORDER BY ps.product_code ASC`;
  return query(sql,[processId,operationType,operationType,operationMode,operationMode,machineId,machineId]);
};
