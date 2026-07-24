const db = require("../config/db");

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const validateMasterData = async ({ workerId, processId, machineNo, productName, defects, deductions, ttOk, actualOutput }) => {
    const errors = {};

    const assignments = await query(
        `SELECT 1 FROM worker_processes WHERE worker_id = ? AND process_id = ? LIMIT 1`,
        [workerId, processId]
    );
    if (!assignments.length) errors.process_id = "Công nhân chưa được phân công công đoạn này";

    if (machineNo) {
        const machines = await query(
            `SELECT id FROM machines WHERE process_id = ? AND machine_code = ? LIMIT 1`,
            [processId, machineNo]
        );
        if (!machines.length) errors.machine_no = "Máy không thuộc công đoạn đã chọn";
    }

    let standardOutput = null;
    let excludeKqdFromTt = 0;
    if (productName) {
        const products = await query(
            `SELECT standard_output, COALESCE(exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt FROM product_standards
             WHERE process_id = ? AND (product_code = ? OR product_name = ? )
             LIMIT 1`,
            [processId, productName, productName, productName]
        ).catch(async (error) => {
            if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
            return query(
                `SELECT standard_output, COALESCE(exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt FROM product_standards
                 WHERE process_id = ? AND (product_code = ?)
                 LIMIT 1`,
                [processId, productName, productName]
            );
        });
        if (!products.length) errors.product_name = "Sản phẩm không thuộc công đoạn đã chọn";
        else {
            standardOutput = Math.round(Number(products[0].standard_output) || 0);
            excludeKqdFromTt = Number(products[0].exclude_kqd_from_tt || 0) === 1 ? 1 : 0;
            if (ttOk !== undefined && actualOutput !== undefined) {
                const { calculateActualOutput } = require('../utils/outputCalculation');
                const expected = calculateActualOutput({ ttOk, defects, excludeKqdFromTt: Boolean(excludeKqdFromTt) });
                if (Math.abs(Number(actualOutput) - expected) > 0.02) {
                    errors.actual_output = 'Sản lượng thực tế không đúng theo quy tắc tính của mã sản phẩm';
                }
            }
        }
    }

    const defectIds = defects.map((item) => item.defect_type_id).filter((id) => id > 0);
    if (defectIds.length) {
        const placeholders = defectIds.map(() => "?").join(",");
        const rows = await query(
            `SELECT id FROM defect_types WHERE process_id = ? AND id IN (${placeholders})`,
            [processId, ...defectIds]
        );
        if (rows.length !== defectIds.length) errors.defects = "Có loại lỗi không thuộc công đoạn đã chọn";
    }

    const deductionIds = deductions.map((item) => item.deduction_type_id).filter((id) => id > 0);
    if (deductionIds.length) {
        const placeholders = deductionIds.map(() => "?").join(",");
        const rows = await query(
            `SELECT id FROM deduction_types WHERE process_id = ? AND id IN (${placeholders})`,
            [processId, ...deductionIds]
        );
        if (rows.length !== deductionIds.length) errors.deductions = "Có loại thời gian trừ không thuộc công đoạn đã chọn";
    }

    return { valid: Object.keys(errors).length === 0, errors, standardOutput, excludeKqdFromTt };
};

module.exports = { validateMasterData };
