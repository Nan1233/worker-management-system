const db = require("../config/db");

const query = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.query(sql, params, (error, rows) => {
            if (error) return reject(error);
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
        pa.alias_code,
        ps.standard_output,
        COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
        EXISTS(
            SELECT 1 FROM product_machine_standards pms
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
    LEFT JOIN product_aliases pa
      ON pa.process_id = ps.process_id
     AND UPPER(TRIM(pa.product_code)) = UPPER(TRIM(ps.product_code))
     AND pa.status = 'active'
`;

/*
 * GC is alias-master driven, but a product standard must never become
 * unreachable merely because its alias row is missing. Return all active
 * aliases and also active GC product_standards that have no active alias.
 */
const GC_ALIAS_SELECT = `
    SELECT
        COALESCE(ps.id, -CAST(pa.id AS SIGNED)) AS id,
        pa.process_id,
        p.process_code,
        CASE WHEN UPPER(TRIM(pa.alias_code)) LIKE 'C%' THEN 'CUT' ELSE 'LONG' END AS work_type,
        COALESCE(ps.product_code, pa.product_code) AS product_code,
        pa.alias_code,
        COALESCE(ps.standard_output, 0) AS standard_output,
        COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
        CASE WHEN ps.id IS NULL THEN 0 ELSE EXISTS(
            SELECT 1 FROM product_machine_standards pms
            WHERE pms.process_id = pa.process_id
              AND pms.product_code = ps.product_code
              AND pms.is_active = 1
        ) END AS has_machine_specific_standard,
        CASE WHEN ps.id IS NULL THEN '' ELSE COALESCE((
            SELECT GROUP_CONCAT(DISTINCT m.machine_code ORDER BY m.machine_code SEPARATOR ',')
            FROM product_machine_standards pms2
            JOIN machines m
              ON m.id = pms2.machine_id
             AND m.process_id = pms2.process_id
             AND m.status = 'active'
            WHERE pms2.process_id = pa.process_id
              AND pms2.product_code = ps.product_code
              AND pms2.is_active = 1
        ), '') END AS eligible_machine_codes
    FROM product_aliases pa
    JOIN processes p ON p.id = pa.process_id
    LEFT JOIN product_standards ps
      ON ps.process_id = pa.process_id
     AND UPPER(TRIM(ps.product_code)) = UPPER(TRIM(pa.product_code))
     AND ps.status = 'active'
    WHERE pa.status = 'active'
      AND p.status = 'active'
      AND UPPER(TRIM(p.process_code)) = 'GC'

    UNION ALL

    SELECT
        ps.id,
        ps.process_id,
        p.process_code,
        ps.work_type,
        ps.product_code,
        NULL AS alias_code,
        ps.standard_output,
        COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
        EXISTS(
            SELECT 1 FROM product_machine_standards pms
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
    WHERE ps.status = 'active'
      AND p.status = 'active'
      AND UPPER(TRIM(p.process_code)) = 'GC'
      AND NOT EXISTS (
          SELECT 1
          FROM product_aliases pa2
          WHERE pa2.process_id = ps.process_id
            AND UPPER(TRIM(pa2.product_code)) = UPPER(TRIM(ps.product_code))
            AND pa2.status = 'active'
      )
`;

exports.findByProcess = async (processId) => {
    const processRows = await query(
        "SELECT process_code FROM processes WHERE id = ? LIMIT 1",
        [processId]
    );
    const processCode = String(processRows[0]?.process_code || '').trim().toUpperCase();

    if (processCode === 'GC') {
        return query(`${GC_ALIAS_SELECT} ORDER BY product_code ASC, alias_code ASC`, []);
    }

    return query(`${PRODUCT_STANDARD_SELECT}
        WHERE ps.process_id = ?
          AND ps.status = 'active'
          AND p.status = 'active'
        ORDER BY ps.product_code ASC
    `, [processId]);
};

exports.findByProcessCode = async (processCode) => {
    const normalized = String(processCode || '').trim().toUpperCase();
    if (normalized === 'GC') {
        return query(`${GC_ALIAS_SELECT} ORDER BY product_code ASC, alias_code ASC`, []);
    }

    return query(`${PRODUCT_STANDARD_SELECT}
        WHERE UPPER(TRIM(p.process_code)) = UPPER(TRIM(?))
          AND ps.status = 'active'
          AND p.status = 'active'
        ORDER BY ps.product_code ASC
    `, [processCode]);
};

const resolveAliasToProductCode = async (processId, productCode) => {
    const input = String(productCode || '').trim();
    if (!input) return input;

    const rows = await query(`
        SELECT product_code
        FROM product_aliases
        WHERE process_id = ?
          AND UPPER(TRIM(alias_code)) = UPPER(TRIM(?))
          AND status = 'active'
        ORDER BY id
        LIMIT 1
    `, [processId, input]);

    return rows[0]?.product_code ? String(rows[0].product_code).trim() : input;
};

exports.resolveByMachineAndProduct = async (processId, machineCode, productCode, workDate) => {
    const { resolveStandard } = require('../services/standardResolutionService');
    const canonicalProductCode = await resolveAliasToProductCode(processId, productCode);
    const resolved = await resolveStandard({
        processId,
        machineCode,
        productCode: canonicalProductCode,
        workDate
    });
    return {
        product_standard_id: resolved.productStandardId,
        standard_version_id: resolved.standardVersionId,
        machine_standard_id: resolved.machineStandardId,
        process_id: resolved.processId,
        product_code: resolved.productCode,
        alias_code: String(productCode || '').trim() !== canonicalProductCode ? String(productCode || '').trim() : null,
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
