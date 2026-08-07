const db = require("../config/db");

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

const normalizeText = (value) => String(value ?? "").trim();

const uniquePositiveIds = (items, key) => [
    ...new Set(
        (Array.isArray(items) ? items : [])
            .map((item) => Number(item?.[key]))
            .filter((id) => Number.isInteger(id) && id > 0)
    )
];

const validateMasterData = async ({
    workerId,
    processId,
    machineNo,
    productName,
    defects = [],
    deductions = [],
    ttOk,
    actualOutput,
    allowEmptyMachine = false
}) => {
    const errors = {};
    const normalizedMachineNo = normalizeText(machineNo);
    const normalizedProductName = normalizeText(productName);
    const defectIds = uniquePositiveIds(defects, "defect_type_id");
    const deductionIds = uniquePositiveIds(deductions, "deduction_type_id");

    // Các kiểm tra độc lập được chạy song song. So sánh trực tiếp mã danh mục
    // để TiDB dùng được index, tránh UPPER(TRIM(column)) làm full scan.
    const [assignments, machines, products, validDefectRows, validDeductionRows] = await Promise.all([
        query(
            `SELECT 1
             FROM worker_processes
             WHERE worker_id = ? AND process_id = ?
             LIMIT 1`,
            [workerId, processId]
        ),
        normalizedMachineNo
            ? query(
                `SELECT machine_code
                 FROM machines
                 WHERE process_id = ?
                   AND status = 'active'
                   AND machine_code = ?
                 LIMIT 1`,
                [processId, normalizedMachineNo]
            )
            : Promise.resolve([]),
        normalizedProductName
            ? query(
                `SELECT product_code,
                        standard_output,
                        COALESCE(exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt
                 FROM product_standards
                 WHERE process_id = ?
                   AND status = 'active'
                   AND product_code = ?
                 LIMIT 1`,
                [processId, normalizedProductName]
            )
            : Promise.resolve([]),
        defectIds.length
            ? query(
                `SELECT DISTINCT id
                 FROM defect_types
                 WHERE process_id = ?
                   AND status = 'active'
                   AND id IN (${defectIds.map(() => "?").join(",")})`,
                [processId, ...defectIds]
            )
            : Promise.resolve([]),
        deductionIds.length
            ? query(
                `SELECT DISTINCT id
                 FROM deduction_types
                 WHERE process_id = ?
                   AND status = 'active'
                   AND id IN (${deductionIds.map(() => "?").join(",")})`,
                [processId, ...deductionIds]
            )
            : Promise.resolve([])
    ]);

    if (!assignments.length) {
        errors.process_id = "Công nhân chưa được phân công công đoạn này";
    }

    let machineCode = null;
    if (!normalizedMachineNo) {
        if (!allowEmptyMachine) {
            errors.machine_no = "Vui lòng chọn máy trong danh mục";
        }
    } else if (!machines.length) {
        errors.machine_no = "Máy không tồn tại hoặc không thuộc công đoạn đã chọn";
    } else {
        machineCode = machines[0].machine_code;
    }

    let productCode = null;
    let standardOutput = null;
    let excludeKqdFromTt = 0;
    if (!normalizedProductName) {
        errors.product_name = "Vui lòng chọn sản phẩm trong danh mục";
    } else if (!products.length) {
        errors.product_name = "Sản phẩm không tồn tại hoặc không thuộc công đoạn đã chọn";
    } else {
        productCode = products[0].product_code;
        standardOutput = Math.round(Number(products[0].standard_output) || 0);
        excludeKqdFromTt = Number(products[0].exclude_kqd_from_tt || 0) === 1 ? 1 : 0;

        if (ttOk !== undefined && actualOutput !== undefined) {
            const { calculateActualOutput } = require("../utils/outputCalculation");
            const expected = calculateActualOutput({
                ttOk,
                defects,
                excludeKqdFromTt: Boolean(excludeKqdFromTt)
            });
            if (Math.abs(Number(actualOutput) - expected) > 0.02) {
                errors.actual_output = "Sản lượng thực tế không đúng theo quy tắc tính của mã sản phẩm";
            }
        }
    }

    if (defectIds.length && validDefectRows.length !== defectIds.length) {
        errors.defects = "Có loại lỗi không tồn tại hoặc không thuộc công đoạn đã chọn";
    }

    if (deductionIds.length && validDeductionRows.length !== deductionIds.length) {
        errors.deductions = "Có loại thời gian trừ không tồn tại hoặc không thuộc công đoạn đã chọn";
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        machineCode,
        productCode,
        standardOutput,
        excludeKqdFromTt
    };
};

module.exports = { validateMasterData };
