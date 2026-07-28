const db = require("../config/db");

const query = (sql, params = []) => db.promise().query(sql, params).then(([rows]) => rows);

const normalizeCode = (value) => String(value || "").trim();

const validateMachineLines = async ({ processId, machineLines, operationType = null, operationMode = null }) => {
    if (!Array.isArray(machineLines) || machineLines.length === 0) {
        return { valid: true, lines: [], totals: null, errors: {} };
    }

    const errors = {};
    if (machineLines.length > 4) {
        errors.machine_lines = "Chỉ được chọn tối đa 4 máy";
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

        if (!machineCode || !productCode) {
            errors[`machine_lines.${index}`] = `Dòng máy ${index + 1} thiếu máy hoặc sản phẩm`;
            continue;
        }
        if (!Number.isFinite(machineTimeHours) || machineTimeHours <= 0 || machineTimeHours > 24) {
            errors[`machine_lines.${index}.machine_time_hours`] = `Thời gian máy ${index + 1} phải lớn hơn 0 và không quá 24 giờ`;
            continue;
        }
        if (!Number.isInteger(okQuantity) || okQuantity < 0 || !Number.isInteger(ngQuantity) || ngQuantity < 0) {
            errors[`machine_lines.${index}.quantity`] = `OK và NG của máy ${index + 1} phải là số nguyên không âm`;
            continue;
        }

        const machines = await query(
            `SELECT id, machine_code, operation_type FROM machines
             WHERE process_id = ? AND status = 'active'
               AND UPPER(TRIM(machine_code)) = UPPER(?) LIMIT 1`,
            [processId, machineCode]
        );
        if (!machines.length) {
            errors[`machine_lines.${index}.machine_code`] = `Máy ${machineCode} không thuộc công đoạn`;
            continue;
        }
        if (operationType) {
            const configuredType = String(machines[0].operation_type || "").toUpperCase();
            if (configuredType && configuredType !== operationType) {
                errors[`machine_lines.${index}.machine_code`] = `Máy ${machineCode} không thuộc nhóm ${operationType === "CUT" ? "Cắt" : "Lồng"}`;
                continue;
            }
        }

        const products = await query(
            `SELECT id, product_code, standard_output
             FROM product_standards
             WHERE process_id = ? AND status = 'active'
               AND UPPER(TRIM(product_code)) = UPPER(?) LIMIT 1`,
            [processId, productCode]
        );
        if (!products.length) {
            errors[`machine_lines.${index}.product_code`] = `Sản phẩm ${productCode} không thuộc công đoạn`;
            continue;
        }
        const [operationRules, machineRules] = await Promise.all([
            query(`SELECT COUNT(*) AS total,
                          SUM(product_standard_id=? AND operation_type=? AND operation_mode=? AND status='active') AS matched
                   FROM product_operation_rules WHERE process_id=? AND status='active'`,
                  [products[0].id, operationType, operationMode, processId]),
            query(`SELECT COUNT(*) AS total,
                          SUM(product_standard_id=? AND machine_id=? AND status='active') AS matched
                   FROM product_machine_rules WHERE product_standard_id=? AND status='active'`,
                  [products[0].id, machines[0].id, products[0].id])
        ]);
        if (Number(operationRules[0]?.total || 0) > 0 && Number(operationRules[0]?.matched || 0) === 0) {
            errors[`machine_lines.${index}.product_code`] = `Sản phẩm ${productCode} không phù hợp lựa chọn Cắt/Lồng - Tay/Máy`;
            continue;
        }
        if (Number(machineRules[0]?.total || 0) > 0 && Number(machineRules[0]?.matched || 0) === 0) {
            errors[`machine_lines.${index}.product_code`] = `Sản phẩm ${productCode} không được cấu hình cho máy ${machineCode}`;
            continue;
        }

        const standardOutput = Number(products[0].standard_output || 0);
        const maximumOutput = standardOutput * machineTimeHours;
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
            standard_output: standardOutput,
            ok_quantity: okQuantity,
            ng_quantity: ngQuantity,
            maximum_output: maximumOutput
        });
        totalOk += okQuantity;
        totalNg += ngQuantity;
        totalMaximum += maximumOutput;
    }

    return {
        valid: Object.keys(errors).length === 0,
        lines: normalized,
        errors,
        totals: { totalOk, totalNg, totalActual: totalOk + totalNg, totalMaximum }
    };
};

module.exports = { validateMachineLines };
