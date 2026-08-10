const db =
    require("../config/db");




const query = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.query(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });

exports.findByProcess = async (processId) => {
    const sql = `
        SELECT
            id,
            process_id,
            '' AS work_type,
            product_code,
            standard_output AS standard_output,
            COALESCE(exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt
        FROM product_standards
        WHERE process_id = ?
          AND status = 'active'
        ORDER BY product_code ASC
    `;

    return query(sql, [processId]);
};

exports.resolveByMachineAndProduct = async (processId, machineCode, productCode) => {
    const sql = `
        SELECT
            ps.id AS product_standard_id,
            ps.process_id,
            ps.product_code,
            m.id AS machine_id,
            m.machine_code,
            pms.standard_time_seconds,
            pms.calculated_output_per_hour AS machine_standard_output,
            ps.standard_output AS default_standard_output,
            COALESCE(pms.calculated_output_per_hour, ps.standard_output) AS resolved_output_per_hour,
            CASE WHEN pms.id IS NOT NULL THEN 'MACHINE' ELSE 'DEFAULT' END AS standard_source,
            EXISTS(SELECT 1 FROM product_machine_standards px WHERE px.process_id=ps.process_id AND px.product_code=ps.product_code AND px.is_active=1) AS has_machine_specific_standard,
            COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt
        FROM product_standards ps
        JOIN machines m
          ON m.process_id = ps.process_id
         AND m.status = 'active'
         AND UPPER(TRIM(m.machine_code)) = UPPER(TRIM(?))
        LEFT JOIN product_machine_standards pms
          ON pms.process_id = ps.process_id
         AND pms.product_code = ps.product_code
         AND pms.machine_id = m.id
         AND pms.is_active = 1
         AND pms.effective_from <= CURRENT_DATE
         AND (pms.effective_to IS NULL OR pms.effective_to >= CURRENT_DATE)
        WHERE ps.process_id = ?
          AND ps.status = 'active'
          AND UPPER(TRIM(ps.product_code)) = UPPER(TRIM(?))
        ORDER BY pms.effective_from DESC, pms.id DESC
        LIMIT 1
    `;
    const rows = await query(sql, [machineCode, processId, productCode]);
    return rows[0] || null;
};
