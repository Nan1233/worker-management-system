const db = require("../config/db");
const { validateEncodedGcMachineProduct } = require("../utils/productMachineEligibility");
const { resolveStandard } = require("./standardResolutionService");

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
    allowEmptyMachine = false,
    operationMode = null,
    workDate
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
                `SELECT id, machine_code, COALESCE(is_automatic, 0) AS is_automatic
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
                `SELECT ps.id, ps.product_code,
                        ps.standard_output,
                        COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
                        p.process_code,
                        EXISTS(SELECT 1 FROM product_machine_standards pms WHERE pms.process_id=ps.process_id AND pms.product_code=ps.product_code AND pms.is_active=1) AS has_machine_specific_standard
                 FROM product_standards ps
                 JOIN processes p ON p.id=ps.process_id
                 WHERE ps.process_id = ?
                   AND ps.status = 'active'
                   AND ps.product_code = ?
                 LIMIT 1`,
                [processId, normalizedProductName]
            )
            : Promise.resolve([]),
        defectIds.length
            ? query(
                `SELECT DISTINCT id, defect_code, defect_name
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

    const canonicalDefectsById = new Map(validDefectRows.map((row) => [Number(row.id), row]));
    const authoritativeDefects = (defects || []).map((item) => ({
        ...item,
        defect_code: canonicalDefectsById.get(Number(item?.defect_type_id))?.defect_code || null,
        defect_name: canonicalDefectsById.get(Number(item?.defect_type_id))?.defect_name || null
    }));

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
    let standardVersionId = null;
    let machineStandardId = null;
    let productStandardId = null;
    if (!normalizedProductName) {
        errors.product_name = "Vui lòng chọn sản phẩm trong danh mục";
    } else if (!products.length) {
        errors.product_name = "Sản phẩm không tồn tại hoặc không thuộc công đoạn đã chọn";
    } else {
        productCode = products[0].product_code;
        const resolvedStandard = await resolveStandard({
            processId,
            productCode,
            machineId: machines[0]?.id || null,
            machineCode: machines[0]?.machine_code || null,
            workDate
        });
        standardOutput = Number(resolvedStandard.standardOutput);
        excludeKqdFromTt = Number(resolvedStandard.excludeKqdFromTt || 0) === 1 ? 1 : 0;
        standardVersionId = resolvedStandard.standardVersionId;
        machineStandardId = resolvedStandard.machineStandardId;
        productStandardId = resolvedStandard.productStandardId;

        const encodedScopeError = validateEncodedGcMachineProduct({
            processCode: products[0].process_code,
            productCode,
            machineCode: machineCode || normalizedMachineNo,
            isAutomatic: machines[0]?.is_automatic || 0,
            operationMode: operationMode || (normalizedMachineNo ? "MACHINE" : "MANUAL")
        });
        if (encodedScopeError) errors.product_name = encodedScopeError;


        if (ttOk !== undefined && actualOutput !== undefined) {
            const { calculateActualOutput } = require("../utils/outputCalculation");
            const expected = calculateActualOutput({
                ttOk,
                defects: authoritativeDefects,
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
        excludeKqdFromTt,
        standardVersionId,
        machineStandardId,
        productStandardId,
        authoritativeDefects
    };
};

module.exports = { validateMasterData };
