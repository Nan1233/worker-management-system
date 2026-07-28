const db = require("../config/db");
const query = (sql, params=[]) => db.promise().query(sql, params).then(([rows]) => rows);

exports.findByProcess = async (processId, filters = {}) => {
  const operationType = ["CUT","NEST"].includes(String(filters.operationType||"").toUpperCase())
    ? String(filters.operationType).toUpperCase() : null;
  const sql = `SELECT id, process_id, machine_code, machine_name, operation_type
               FROM machines
               WHERE process_id=? AND status='active'
                 AND (? IS NULL OR operation_type IS NULL OR operation_type=?)
               ORDER BY machine_code ASC`;
  return query(sql,[processId,operationType,operationType]);
};
