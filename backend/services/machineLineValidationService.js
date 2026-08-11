const defaultQuery = (sql, params = []) => {
    // Lazy-load the real database only when the runtime validator is used.
    // Tests that inject a query function therefore do not open DB handles or
    // require mysql2, which keeps the Node test runner deterministic.
    const db = require("../config/db");
    return db.promise().query(sql, params).then(([rows]) => rows);
};

const normalizeCode = (value) => String(value || "").trim();

const createMachineLineValidator = ({ query = defaultQuery } = {}) => async ({ processId, machineLines, operationMode = null, maxMachines = 4 }) => {
    if (!Array.isArray(machineLines) || machineLines.length === 0) {
        if (String(operationMode || "").trim().toUpperCase() === "MACHINE") {
            return {
                valid: false,
                lines: [],
                totals: null,
                errors: { machine_lines: "Chế độ Máy phải có ít nhất một máy" }
            };
        }
        return { valid: true, lines: [], totals: null, errors: {} };
    }

    const errors = {};
    if (machineLines.length > maxMachines) {
        errors.machine_lines = `Chỉ được chọn tối đa ${maxMachines} máy`;
        return { valid: false, lines: [], totals: null, errors };
    }

    const machineCodes = machineLines.map((line) => normalizeCode(line.machine_code).toUpperCase());
    if (new Set(machineCodes).size !== machineCodes.length) {
        errors.machine_lines = "Không được chọn trùng máy";
        return { valid: false, lines: [], totals: null, errors };
    }

    const normalized = [];
    let totalOk = 0;
    let totalNg = 0;
    let totalMaximum = 0;

    for (let index = 0; index < machineLines.length; index += 1) {
        const line = machineLines[index] || {};
        const machineCode = normalizeCode(line.machine_code);
        const productCode = normalizeCode(line.product_code);
        const machineTimeHours = Number(line.machine_time_hours);
        const okQuantity = Number(line.ok_quantity || 0);
        const ngQuantity = Number(line.ng_quantity || 0);
        const defects = Array.isArray(line.defects) ? line.defects : [];
        const normalizedDefects = defects
            .map((item) => ({
                defect_id: Number(item?.defect_id) || null,
                defect_code: normalizeCode(item?.defect_code),
                defect_name: normalizeCode(item?.defect_name),
                quantity: Math.max(0, Math.trunc(Number(item?.quantity) || 0))
            }))
            .filter((item) => item.quantity > 0);
        const calculatedNgQuantity = normalizedDefects.reduce((sum, item) => sum + item.quantity, 0);

        if (!machineCode || !productCode) {
            errors[`machine_lines.${index}`] = `Dòng máy ${index + 1} thiếu máy hoặc sản phẩm`;
            continue;
        }
        if (!Number.isFinite(machineTimeHours) || machineTimeHours <= 0 || machineTimeHours > 12) {
            errors[`machine_lines.${index}.machine_time_hours`] = `Thời gian máy ${index + 1} phải lớn hơn 0 và không quá 12 giờ`;
            continue;
        }
        if (!Number.isInteger(okQuantity) || okQuantity < 0 || !Number.isInteger(ngQuantity) || ngQuantity < 0) {
            errors[`machine_lines.${index}.quantity`] = `OK và NG của máy ${index + 1} phải là số nguyên không âm`;
            continue;
        }
        if (ngQuantity !== calculatedNgQuantity) {
            errors[`machine_lines.${index}.defects`] = `NG máy ${index + 1} phải bằng tổng chi tiết lỗi NG (${calculatedNgQuantity})`;
            continue;
        }

        const machines = await query(
            `SELECT id, machine_code FROM machines
             WHERE process_id = ? AND status = 'active'
               AND UPPER(TRIM(machine_code)) = UPPER(?) LIMIT 1`,
            [processId, machineCode]
        );
        if (!machines.length) {
            errors[`machine_lines.${index}.machine_code`] = `Máy ${machineCode} không thuộc công đoạn`;
            continue;
        }
        

        const products = await query(
            `SELECT ps.id,
                    ps.product_code,
                    ps.standard_output AS default_standard_output,
                    COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt,
                    pms.standard_time_seconds,
                    pms.calculated_output_per_hour AS machine_standard_output,
                    EXISTS(SELECT 1 FROM product_machine_standards px WHERE px.process_id=ps.process_id AND px.product_code=ps.product_code AND px.is_active=1) AS has_machine_specific_standard
             FROM product_standards ps
             LEFT JOIN product_machine_standards pms
               ON pms.process_id = ps.process_id
              AND pms.product_code = ps.product_code
              AND pms.machine_id = ?
              AND pms.is_active = 1
              AND pms.effective_from <= CURRENT_DATE
              AND (pms.effective_to IS NULL OR pms.effective_to >= CURRENT_DATE)
             WHERE ps.process_id = ?
               AND ps.status = 'active'
               AND UPPER(TRIM(ps.product_code)) = UPPER(?)
             ORDER BY pms.effective_from DESC, pms.id DESC
             LIMIT 1`,
            [machines[0].id, processId, productCode]
        );
        if (!products.length) {
            errors[`machine_lines.${index}.product_code`] = `Sản phẩm ${productCode} không thuộc công đoạn`;
            continue;
        }

        if (Number(products[0].has_machine_specific_standard || 0) === 1 && products[0].machine_standard_output == null) {
            errors[`machine_lines.${index}.product_code`] =
                `Sản phẩm ${productCode} không được cấu hình chạy trên máy ${machines[0].machine_code} theo dữ liệu Book2`;
            continue;
        }

        const standardOutput = Number(
            products[0].machine_standard_output ?? products[0].default_standard_output ?? 0
        );
        if (!Number.isFinite(standardOutput) || standardOutput <= 0) {
            errors[`machine_lines.${index}.product_code`] =
                `Chưa có định mức hợp lệ cho ${productCode} trên máy ${machines[0].machine_code}`;
            continue;
        }
        const maximumOutput = standardOutput * machineTimeHours;
        const excludeKqdFromTt = Number(products[0].exclude_kqd_from_tt || 0) === 1 ? 1 : 0;
        const excludedKqdQuantity = excludeKqdFromTt
            ? normalizedDefects.reduce((sum, item) => {
                const code = String(item.defect_code || "").trim().toUpperCase();
                const name = String(item.defect_name || "").trim().toUpperCase();
                return sum + ((code === "KQD" || code.startsWith("KQD_") || name.includes("KQD")) ? item.quantity : 0);
            }, 0)
            : 0;
        const countedOutput = okQuantity + Math.max(0, ngQuantity - excludedKqdQuantity);
        const earnedStandardHours = standardOutput > 0 ? countedOutput / standardOutput : 0;
        if (okQuantity + ngQuantity > maximumOutput + 0.0001) {
            errors[`machine_lines.${index}.output`] =
                `Máy ${machines[0].machine_code}: OK + NG không được vượt ${Math.floor(maximumOutput).toLocaleString("vi-VN")} sản phẩm`;
            continue;
        }

        normalized.push({
            machine_id: machines[0].id,
            machine_code: machines[0].machine_code,
            product_standard_id: products[0].id,
            product_code: products[0].product_code,
            machine_time_hours: machineTimeHours,
            standard_time_seconds: Number(products[0].standard_time_seconds || 0) || null,
            standard_output: standardOutput,
            standard_source: products[0].machine_standard_output != null ? "MACHINE" : "DEFAULT",
            exclude_kqd_from_tt: excludeKqdFromTt,
            counted_output: countedOutput,
            earned_standard_hours: earnedStandardHours,
            ok_quantity: okQuantity,
            ng_quantity: ngQuantity,
            maximum_output: maximumOutput,
            defects: normalizedDefects
        });
        totalOk += okQuantity;
        totalNg += ngQuantity;
        totalMaximum += maximumOutput;
    }

    return {
        valid: Object.keys(errors).length === 0,
        lines: normalized,
        errors,
        totals: { totalOk, totalNg, totalActual: totalOk + totalNg, totalMaximum, totalCounted: normalized.reduce((sum, line) => sum + Number(line.counted_output || 0), 0), totalEarnedStandardHours: normalized.reduce((sum, line) => sum + Number(line.earned_standard_hours || 0), 0), totalMachineHours: normalized.reduce((sum, line) => sum + Number(line.machine_time_hours || 0), 0) }
    };
};

const validateMachineLines = createMachineLineValidator();

module.exports = {
    createMachineLineValidator,
    validateMachineLines
};
