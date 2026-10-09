const defaultQuery = (sql, params = []) => {
    // Lazy-load the real database only when the runtime validator is used.
    // Tests that inject a query function therefore do not open DB handles or
    // require mysql2, which keeps the Node test runner deterministic.
    const db = require("../config/db");
    return db.promise().query(sql, params).then(([rows]) => rows);
};

const normalizeCode = (value) => String(value || "").trim();
const normalizeDefectName = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/Đ/g, "D")
    .replace(/[^A-Z0-9]+/g, "")
    .trim();
const { validateEncodedGcMachineProduct } = require("../utils/productMachineEligibility");
const { createStandardResolver } = require("./standardResolutionService");
const { calculateProductionOutput } = require("../../shared/kqdPolicy.cjs");

const createMachineLineValidator = ({ query = defaultQuery, standardResolver: injectedStandardResolver = null } = {}) => {
    const standardResolver = injectedStandardResolver || createStandardResolver({ query });

    return async ({ processId, machineLines, operationMode = null, maxMachines = 4, workDate }) => {
        // An empty machine-line list is valid when there is no machine data to
        // validate. The caller decides whether a process requires a machine.
        // This is important for edit flows: the update model may pass an empty
        // machine_lines array for a manual report, even when the parent report
        // still has operation metadata.
        if (!Array.isArray(machineLines) || machineLines.length === 0) {
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

        // IMPORTANT for Cloudflare Workers + TiDB:
        // Do not query defect_types once per selected defect. When a worker
        // selects many NG types, the old code could perform 3-4 queries per
        // defect and exceed the Worker subrequest limit before the report was
        // persisted. Load the process master once and resolve everything from
        // memory afterwards.
        const rawDefectsByLine = machineLines.map((line) => {
            const defects = Array.isArray(line?.defects) ? line.defects : [];
            return defects
                .map((item) => ({
                    defect_id: Number(item?.defect_type_id || item?.defect_id) || null,
                    defect_code: normalizeCode(item?.defect_code),
                    defect_name: normalizeCode(item?.defect_name),
                    quantity: Math.max(0, Math.trunc(Number(item?.quantity) || 0))
                }))
                .filter((item) => item.quantity > 0);
        });

        const allRawDefects = rawDefectsByLine.flat();
        let defectMaster = [];
        if (allRawDefects.length > 0) {
            defectMaster = await query(
                `SELECT id, defect_code, defect_name
                   FROM defect_types
                  WHERE process_id=? AND status='active'`,
                [processId]
            );
        }

        // Thời gian trừ cho mỗi dòng máy (line.deductions). Trước đây bị bỏ qua hoàn
        // toàn trong normalized output nên deduction_time_hours/deductions_json luôn
        // lưu 0, dù Worker đã chọn loại trừ giờ. Áp dụng cùng chiến lược batch-query
        // như defect_types ở trên: tải một lần theo processId, resolve trong bộ nhớ.
        // Khi payload không gửi lại machine_lines (ví dụ chỉ sửa trường khác), caller có
        // thể truyền lại dòng máy đã lưu trong DB để re-validate. Dòng đó mang
        // deductions_json (string hoặc đã parse) thay vì mảng deductions như payload từ
        // Worker, nên phải chấp nhận cả hai nguồn để không làm mất lại dữ liệu trừ giờ.
        const parseStoredDeductions = (value) => {
            if (Array.isArray(value)) return value;
            if (!value) return [];
            try {
                const parsed = typeof value === "string" ? JSON.parse(value) : value;
                return Array.isArray(parsed) ? parsed : [];
            } catch (_error) {
                return [];
            }
        };
        const rawDeductionsByLine = machineLines.map((line) => {
            const deductions = Array.isArray(line?.deductions) ? line.deductions : parseStoredDeductions(line?.deductions_json);
            return deductions
                .map((item) => ({
                    deduction_id: Number(item?.deduction_type_id || item?.deduction_id) || null,
                    deduction_code: normalizeCode(item?.deduction_code),
                    deduction_name: normalizeCode(item?.deduction_name),
                    hours: Math.max(0, Number(item?.hours) || 0)
                }))
                .filter((item) => item.hours > 0);
        });

        const allRawDeductions = rawDeductionsByLine.flat();
        let deductionMaster = [];
        if (allRawDeductions.length > 0) {
            deductionMaster = await query(
                `SELECT id, deduction_code, deduction_name
                   FROM deduction_types
                  WHERE process_id=? AND status='active'`,
                [processId]
            );
        }

        const findUniqueDeduction = (items) => {
            if (items.length !== 1) return null;
            return items[0];
        };

        const resolveDeduction = (item) => {
            let match = null;
            if (item.deduction_id) {
                match = findUniqueDeduction(
                    deductionMaster.filter((row) => Number(row.id) === Number(item.deduction_id))
                );
            }
            if (!match && item.deduction_code) {
                const code = item.deduction_code.toUpperCase();
                match = findUniqueDeduction(
                    deductionMaster.filter((row) => normalizeCode(row.deduction_code).toUpperCase() === code)
                );
            }
            if (!match && item.deduction_name) {
                const normalizedName = normalizeDefectName(item.deduction_name);
                match = findUniqueDeduction(
                    deductionMaster.filter((row) => normalizeDefectName(row.deduction_name) === normalizedName)
                );
            }
            return match;
        };

        const findUniqueDefect = (items) => {
            if (items.length !== 1) return null;
            return items[0];
        };

        const resolveDefect = (item) => {
            let match = null;

            if (item.defect_id) {
                match = findUniqueDefect(
                    defectMaster.filter((row) => Number(row.id) === Number(item.defect_id))
                );
            }

            if (!match && item.defect_code) {
                const code = item.defect_code.toUpperCase();
                match = findUniqueDefect(
                    defectMaster.filter((row) => normalizeCode(row.defect_code).toUpperCase() === code)
                );
            }

            // Worker master-data fallbacks may generate a display code such as
            // CUT_04. Never persist/reject that synthetic code when the active
            // process master contains the same defect under a real code/name.
            if (!match && item.defect_name) {
                const name = item.defect_name.toUpperCase();
                match = findUniqueDefect(
                    defectMaster.filter((row) => normalizeCode(row.defect_name).toUpperCase() === name)
                );
            }

            // Last fallback is accent/punctuation-insensitive name matching.
            // This handles harmless master-data differences such as spacing,
            // punctuation or Vietnamese diacritics while still requiring a
            // unique active defect inside the same process.
            if (!match && item.defect_name) {
                const normalizedName = normalizeDefectName(item.defect_name);
                match = findUniqueDefect(
                    defectMaster.filter((row) => normalizeDefectName(row.defect_name) === normalizedName)
                );
            }

            return match;
        };

        // The machine master is also loaded once. This removes another
        // per-machine DB round-trip and keeps the worst-case request comfortably
        // below Cloudflare's subrequest ceiling.
        const machineRows = await query(
            `SELECT m.id, m.machine_code, COALESCE(m.is_automatic,0) AS is_automatic, p.process_code
               FROM machines m
               JOIN processes p ON p.id=m.process_id
              WHERE m.process_id=? AND m.status='active'`,
            [processId]
        );
        const machineByCode = new Map(
            machineRows.map((row) => [normalizeCode(row.machine_code).toUpperCase(), row])
        );

        const normalized = [];
        let totalOk = 0;
        let totalNg = 0;
        let totalMaximum = 0;

        for (let index = 0; index < machineLines.length; index += 1) {
            const line = machineLines[index] || {};
            const machineCode = normalizeCode(line.machine_code);
            const productCode = normalizeCode(line.product_code);
            const okQuantity = Number(line.ok_quantity || 0);
            const ngQuantity = Number(line.ng_quantity || 0);
            const rawDefects = rawDefectsByLine[index];
            const normalizedDefects = [];
            const rawDeductions = rawDeductionsByLine[index];
            const normalizedDeductions = [];

            for (const item of rawDeductions) {
                const match = resolveDeduction(item);
                if (!match) {
                    errors[`machine_lines.${index}.deductions`] = `Loại trừ giờ ${item.deduction_code || item.deduction_name || item.deduction_id || ''} không tồn tại hoặc không duy nhất trong công đoạn`;
                    continue;
                }
                normalizedDeductions.push({
                    deduction_type_id: Number(match.id),
                    deduction_code: normalizeCode(match.deduction_code),
                    deduction_name: normalizeCode(match.deduction_name),
                    hours: item.hours
                });
            }
            if (normalizedDeductions.length !== rawDeductions.length) continue;

            // Worker chỉ nhập "Thời gian chạy thực tế" (actual_time_hours); "Tổng thời
            // gian" (machine_time_hours, ý nghĩa gross cho kế toán giờ máy không đổi)
            // luôn được backend tự tính lại = thực tế + trừ giờ đã resolve ở trên.
            // Không tin tưởng machine_time_hours thô do client gửi lên; fallback trừ
            // ngược chỉ áp dụng khi client cũ không gửi actual_time_hours.
            const deductionTimeHours = normalizedDeductions.reduce((sum, item) => sum + item.hours, 0);
            const rawActualTimeHours = Number(line.actual_time_hours);
            const actualTimeHours = Number.isFinite(rawActualTimeHours) && line.actual_time_hours !== undefined && line.actual_time_hours !== null
                ? Math.max(0, rawActualTimeHours)
                : Math.max(0, (Number(line.machine_time_hours) || 0) - deductionTimeHours);
            const machineTimeHours = actualTimeHours + deductionTimeHours;

            for (const item of rawDefects) {
                const match = resolveDefect(item);
                if (!match) {
                    errors[`machine_lines.${index}.defects`] = `Loại NG ${item.defect_code || item.defect_name || item.defect_id || ''} không tồn tại hoặc không duy nhất trong công đoạn`;
                    continue;
                }
                normalizedDefects.push({
                    defect_id: Number(match.id),
                    defect_type_id: Number(match.id),
                    defect_code: normalizeCode(match.defect_code),
                    defect_name: normalizeCode(match.defect_name),
                    quantity: item.quantity
                });
            }

            if (normalizedDefects.length !== rawDefects.length) continue;
            const calculatedNgQuantity = normalizedDefects.reduce((sum, item) => sum + item.quantity, 0);

            if (!machineCode || !productCode) {
                errors[`machine_lines.${index}`] = `Dòng máy ${index + 1} thiếu máy hoặc sản phẩm`;
                continue;
            }
            if (!Number.isFinite(actualTimeHours) || actualTimeHours <= 0 || actualTimeHours > 12) {
                errors[`machine_lines.${index}.actual_time_hours`] = `Thời gian chạy thực tế máy ${index + 1} phải lớn hơn 0 và không quá 12 giờ`;
                continue;
            }
            if (!Number.isFinite(machineTimeHours) || machineTimeHours > 12) {
                errors[`machine_lines.${index}.machine_time_hours`] = `Tổng thời gian máy ${index + 1} (thực tế + trừ) không được quá 12 giờ`;
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

            const machine = machineByCode.get(machineCode.toUpperCase());
            if (!machine) {
                errors[`machine_lines.${index}.machine_code`] = `Máy ${machineCode} không thuộc công đoạn`;
                continue;
            }

            let resolvedStandard;
            try {
                resolvedStandard = await standardResolver.resolveStandard({
                    processId,
                    productCode,
                    machineId: machine.id,
                    machineCode: machine.machine_code,
                    workDate
                });
            } catch (error) {
                errors[`machine_lines.${index}.product_code`] = error?.message || `Không resolve được định mức cho ${productCode}`;
                continue;
            }

            const encodedScopeError = validateEncodedGcMachineProduct({
                processCode: machine.process_code,
                productCode,
                machineCode: machine.machine_code,
                isAutomatic: machine.is_automatic,
                operationMode: "MACHINE"
            });
            if (encodedScopeError) {
                errors[`machine_lines.${index}.product_code`] = encodedScopeError;
                continue;
            }

            const standardOutput = Number(resolvedStandard.standardOutput);
            if (!Number.isFinite(standardOutput) || standardOutput <= 0) {
                errors[`machine_lines.${index}.product_code`] =
                    `Chưa có định mức hợp lệ cho ${productCode} trên máy ${machine.machine_code}`;
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
            const countedOutput = outputMetrics.actualOutput;
            const earnedStandardHours = standardOutput > 0 ? countedOutput / standardOutput : 0;
            if (okQuantity > maximumOkOutput + 0.0001) {
                errors[`machine_lines.${index}.output`] =
                    `Máy ${machine.machine_code}: OK không được vượt 200% định mức (${Math.floor(maximumOkOutput).toLocaleString("vi-VN")} sản phẩm)`;
                continue;
            }

            normalized.push({
                machine_id: machine.id,
                machine_code: machine.machine_code,
                product_standard_id: resolvedStandard.productStandardId,
                standard_version_id: resolvedStandard.standardVersionId,
                machine_standard_id: resolvedStandard.machineStandardId,
                product_code: resolvedStandard.productCode,
                machine_time_hours: machineTimeHours,
                actual_time_hours: actualTimeHours,
                deduction_time_hours: deductionTimeHours,
                deductions: normalizedDeductions,
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
            totals: {
                totalOk,
                totalNg,
                totalActual: totalOk + totalNg,
                totalMaximum,
                totalCounted: normalized.reduce((sum, line) => sum + Number(line.counted_output || 0), 0),
                totalEarnedStandardHours: normalized.reduce((sum, line) => sum + Number(line.earned_standard_hours || 0), 0),
                totalMachineHours: normalized.reduce((sum, line) => sum + Number(line.machine_time_hours || 0), 0)
            }
        };
    };
};

const validateMachineLines = createMachineLineValidator();

module.exports = {
    createMachineLineValidator,
    validateMachineLines
};
