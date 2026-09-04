const defaultQuery = (sql, params = []) => {
    // Lazy-load the real database only when the runtime validator is used.
    // Tests that inject a query function therefore do not open DB handles or
    // require mysql2, which keeps the Node test runner deterministic.
    const db = require("../config/db");
    return db.promise().query(sql, params).then(([rows]) => rows);
};

const normalizeCode = (value) => String(value || "").trim();
const { validateEncodedGcMachineProduct } = require("../utils/productMachineEligibility");
const { createStandardResolver } = require("./standardResolutionService");
const { calculateProductionOutput } = require("../../shared/kqdPolicy.cjs");

const createMachineLineValidator = ({ query = defaultQuery, standardResolver: injectedStandardResolver = null } = {}) => {
    const standardResolver = injectedStandardResolver || createStandardResolver({ query });
    return async ({ processId, machineLines, operationMode = null, maxMachines = 4, workDate }) => {
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
        const rawDefects = defects
            .map((item) => ({
                defect_id: Number(item?.defect_type_id || item?.defect_id) || null,
                defect_code: normalizeCode(item?.defect_code),
                defect_name: normalizeCode(item?.defect_name),
                quantity: Math.max(0, Math.trunc(Number(item?.quantity) || 0))
            }))
            .filter((item) => item.quantity > 0);
        const normalizedDefects = [];
        for (const item of rawDefects) {
            let rows = [];
            if (item.defect_id) {
                rows = await query(
                    `SELECT id, defect_code, defect_name FROM defect_types WHERE process_id=? AND status='active' AND id=? LIMIT 2`,
                    [processId, item.defect_id]
                );
            }
            if (rows.length !== 1 && item.defect_code) {
                rows = await query(
                    `SELECT id, defect_code, defect_name FROM defect_types WHERE process_id=? AND status='active' AND UPPER(TRIM(defect_code))=UPPER(TRIM(?)) LIMIT 2`,
                    [processId, item.defect_code]
                );
            }
            // Worker master-data fallbacks can carry a generated code such as
            // CUT_04. If the DB uses the real master code but the same defect
            // name, resolve by the scoped name before rejecting the report.
            if (rows.length !== 1 && item.defect_name) {
                rows = await query(
                    `SELECT id, defect_code, defect_name FROM defect_types WHERE process_id=? AND status='active' AND UPPER(TRIM(defect_name))=UPPER(TRIM(?)) LIMIT 2`,
                    [processId, item.defect_name]
                );
            }
            if (rows.length !== 1) {
                errors[`machine_lines.${index}.defects`] = `Loại NG ${item.defect_code || item.defect_name || item.defect_id || ''} không tồn tại hoặc không duy nhất trong công đoạn`;
                continue;
            }
            normalizedDefects.push({
                defect_id: Number(rows[0].id),
                defect_type_id: Number(rows[0].id),
                defect_code: normalizeCode(rows[0].defect_code),
                defect_name: normalizeCode(rows[0].defect_name),
                quantity: item.quantity
            });
        }
        if (normalizedDefects.length !== rawDefects.length) continue;
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
            `SELECT m.id, m.machine_code, COALESCE(m.is_automatic,0) AS is_automatic, p.process_code
             FROM machines m JOIN processes p ON p.id=m.process_id
             WHERE m.process_id = ? AND m.status = 'active'
               AND UPPER(TRIM(m.machine_code)) = UPPER(?) LIMIT 1`,
            [processId, machineCode]
        );
        if (!machines.length) {
            errors[`machine_lines.${index}.machine_code`] = `Máy ${machineCode} không thuộc công đoạn`;
            continue;
        }

        let resolvedStandard;
        try {
            resolvedStandard = await standardResolver.resolveStandard({
                processId,
                productCode,
                machineId: machines[0].id,
                machineCode: machines[0].machine_code,
                workDate
            });
        } catch (error) {
            errors[`machine_lines.${index}.product_code`] = error?.message || `Không resolve được định mức cho ${productCode}`;
            continue;
        }

        const encodedScopeError = validateEncodedGcMachineProduct({
            processCode: machines[0].process_code,
            productCode,
            machineCode: machines[0].machine_code,
            isAutomatic: machines[0].is_automatic,
            operationMode: "MACHINE"
        });
        if (encodedScopeError) {
            errors[`machine_lines.${index}.product_code`] = encodedScopeError;
            continue;
        }

        const standardOutput = Number(resolvedStandard.standardOutput);
        if (!Number.isFinite(standardOutput) || standardOutput <= 0) {
            errors[`machine_lines.${index}.product_code`] =
                `Chưa có định mức hợp lệ cho ${productCode} trên máy ${machines[0].machine_code}`;
            continue;
        }

        // Định mức là mốc chuẩn cho sản lượng OK. Cho phép sản lượng OK cao hơn
        // định mức nhưng tối đa 200%. NG không bị giới hạn bởi định mức vì số NG
        // chỉ biết chính xác sau khi công nhân khai báo chi tiết lỗi.
        const maximumOutput = standardOutput * machineTimeHours;
        const maximumOkOutput = maximumOutput * 2;
        const excludeKqdFromTt = Number(resolvedStandard.excludeKqdFromTt || 0) === 1 ? 1 : 0;
        const outputMetrics = calculateProductionOutput({
            ok: okQuantity,
            defects: normalizedDefects,
            excludeKqdFromTt: Boolean(excludeKqdFromTt)
        });
        const excludedKqdQuantity = outputMetrics.excludedKqd;
        const countedOutput = outputMetrics.actualOutput;
        const earnedStandardHours = standardOutput > 0 ? countedOutput / standardOutput : 0;
        if (okQuantity > maximumOkOutput + 0.0001) {
            errors[`machine_lines.${index}.output`] =
                `Máy ${machines[0].machine_code}: OK không được vượt 200% định mức (${Math.floor(maximumOkOutput).toLocaleString("vi-VN")} sản phẩm)`;
            continue;
        }

        normalized.push({
            machine_id: machines[0].id,
            machine_code: machines[0].machine_code,
            product_standard_id: resolvedStandard.productStandardId,
            standard_version_id: resolvedStandard.standardVersionId,
            machine_standard_id: resolvedStandard.machineStandardId,
            product_code: resolvedStandard.productCode,
            machine_time_hours: machineTimeHours,
            standard_time_seconds: Number(resolvedStandard.standardTimeSeconds || 0) || null,
            standard_output: standardOutput,
            standard_source: resolvedStandard.source === "MACHINE" ? "MACHINE" : "PRODUCT_VERSION",
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
};

const validateMachineLines = createMachineLineValidator();

module.exports = {
    createMachineLineValidator,
    validateMachineLines
};
