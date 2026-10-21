const db =
    require("../config/db");
const { isMissingColumnError } = require("../utils/gcMachineWorkType");


exports.findByProcess = (processId) => {
    // gc_work_type (migration 059) is the Cắt/Lồng source of truth for GC machines.
    // If the migration has not been applied yet, fall back to the legacy column set
    // so the machine list keeps working; gc_work_type is then simply absent.
    const load = (withGcWorkType) => new Promise((resolve, reject) => {
        const sql = `
            SELECT
                id,
                process_id,
                machine_code,
                machine_name,
                COALESCE(is_automatic, 0) AS is_automatic,
                COALESCE(max_workers_per_machine, 1) AS max_workers_per_machine,
                COALESCE(output_basis, 'PRODUCT') AS output_basis${withGcWorkType ? ',\n                gc_work_type' : ''}
            FROM machines
            WHERE process_id = ?
            AND status = 'active'
            ORDER BY machine_code ASC
        `;
        db.query(sql, [processId], (error, rows) => (error ? reject(error) : resolve(rows)));
    });
    return load(true).catch((error) => {
        if (!isMissingColumnError(error)) throw error;
        return load(false);
    });
};
