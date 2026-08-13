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

const PRODUCT_STANDARD_SELECT = `
    SELECT
        ps.id,
        ps.process_id,
        p.process_code,
        ps.work_type,
        ps.product_code,
        ps.standard_output AS standard_output,
        COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
        EXISTS(
            SELECT 1
            FROM product_machine_standards pms
            WHERE pms.process_id = ps.process_id
              AND pms.product_code = ps.product_code
              AND pms.is_active = 1
        ) AS has_machine_specific_standard,
        COALESCE((
            SELECT GROUP_CONCAT(DISTINCT m.machine_code ORDER BY m.machine_code SEPARATOR ',')
            FROM product_machine_standards pms2
            JOIN machines m
              ON m.id = pms2.machine_id
             AND m.process_id = pms2.process_id
             AND m.status = 'active'
            WHERE pms2.process_id = ps.process_id
              AND pms2.product_code = ps.product_code
              AND pms2.is_active = 1
        ), '') AS eligible_machine_codes
    FROM product_standards ps
    JOIN processes p ON p.id = ps.process_id
`;

exports.findByProcess = async (processId) => {
    const sql = `${PRODUCT_STANDARD_SELECT}
        WHERE ps.process_id = ?
          AND ps.status = 'active'
          AND p.status = 'active'
        ORDER BY ps.product_code ASC
    `;
    return query(sql, [processId]);
};

exports.findByProcessCode = async (processCode) => {
    const sql = `${PRODUCT_STANDARD_SELECT}
        WHERE UPPER(TRIM(p.process_code)) = UPPER(TRIM(?))
          AND ps.status = 'active'
          AND p.status = 'active'
        ORDER BY ps.product_code ASC
    `;
    return query(sql, [processCode]);
};

exports.resolveByMachineAndProduct = async (processId, machineCode, productCode, workDate) => {
    const { resolveStandard } = require('../services/standardResolutionService');
    const resolved = await resolveStandard({ processId, machineCode, productCode, workDate });
    return {
        product_standard_id: resolved.productStandardId,
        standard_version_id: resolved.standardVersionId,
        machine_standard_id: resolved.machineStandardId,
        process_id: resolved.processId,
        product_code: resolved.productCode,
        machine_id: resolved.machineId || null,
        machine_code: resolved.machineCode || machineCode,
        standard_time_seconds: resolved.standardTimeSeconds,
        machine_standard_output: resolved.source === 'MACHINE' ? resolved.standardOutput : null,
        default_standard_output: resolved.source === 'MACHINE' ? null : resolved.standardOutput,
        resolved_output_per_hour: resolved.standardOutput,
        standard_source: resolved.source === 'MACHINE' ? 'MACHINE' : 'DEFAULT',
        exclude_kqd_from_tt: resolved.excludeKqdFromTt
    };
};
