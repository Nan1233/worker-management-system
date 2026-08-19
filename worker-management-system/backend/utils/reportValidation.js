const { calculateActualOutput } = require('./outputCalculation');
const { normalizeTrainingPercent } = require('./trainingPercent');
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SHIFTS = new Set(["A", "B", "C", "D", "Ca 1", "Ca 2", "Ca 3"]);
const EPSILON = 0.02;
const MAX_TOTAL_TIME_HOURS = 12;

const parseHoursValue = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
    const normalized = String(value ?? '').trim().toLowerCase().replace(',', '.');
    if (!normalized) return 0;

    const hourMinuteMatch = normalized.match(/^(\d{1,3})\s*(?:h|g|:)\s*(\d{1,2})$/);
    if (hourMinuteMatch) {
        const hours = Number(hourMinuteMatch[1]);
        const minutes = Number(hourMinuteMatch[2]);
        if (minutes > 59) return Number.NaN;
        return hours + minutes / 60;
    }

    const hourOnlyMatch = normalized.match(/^(\d{1,3})\s*(?:h|g)$/);
    if (hourOnlyMatch) return Number(hourOnlyMatch[1]);

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const finiteNumber = (value, field, errors, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const numberValue = parseHoursValue(value);
    if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
        errors[field] = `${field} phải là số từ ${min} đến ${max}`;
        return 0;
    }
    return numberValue;
};

const normalizeDetails = (items, idField, valueField, label, errors) => {
    if (!Array.isArray(items)) {
        errors[label] = `${label} phải là danh sách`;
        return [];
    }

    const usedIds = new Set();
    return items.map((item, index) => {
        const typeId = Number(item?.[idField] || 0);
        const typeName = String(item?.defect_name || item?.deduction_name || "").trim();

        // Canonical API field for deductions is `hours`, but older/mobile clients
        // may still send the UI value as `minutes`. Accept both at the boundary.
        let rawValue = item?.[valueField];
        let valueUnit = "hours";
        if (rawValue === undefined || rawValue === null || rawValue === "") {
            if (valueField === "hours" && item?.minutes !== undefined) {
                rawValue = item.minutes;
                valueUnit = "minutes";
            } else if (item?.value !== undefined) {
                rawValue = item.value;
            } else {
                rawValue = 0;
            }
        }
        let value = Number(rawValue);
        if (valueUnit === "minutes" && Number.isFinite(value)) value /= 60;

        if ((!Number.isInteger(typeId) || typeId <= 0) && !typeName) {
            errors[`${label}.${index}.${idField}`] = `Loại ${label} không hợp lệ`;
        } else if (typeId > 0 && usedIds.has(typeId)) {
            errors[`${label}.${index}.${idField}`] = `Loại ${label} bị trùng`;
        } else if (typeId > 0) {
            usedIds.add(typeId);
        }

        if (!Number.isFinite(value) || value < 0) {
            errors[`${label}.${index}.${valueField}`] = `${valueField} không được âm`;
        }

        return { ...item, [idField]: typeId, [valueField]: Number.isFinite(value) ? value : 0 };
    }).filter((item) => item[valueField] > 0);
};

const finiteMinutes = (hours) => Math.round((Number(hours) || 0) * 60);

const validateProductionReport = (payload = {}, options = {}) => {
    const errors = {};
    const workDate = String(payload.work_date || "").slice(0, 10);
    const parsedDate = DATE_PATTERN.test(workDate) ? new Date(`${workDate}T00:00:00`) : null;

    if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        errors.work_date = "Ngày làm việc không hợp lệ";
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (parsedDate > today) errors.work_date = "Không được nhập báo cáo cho ngày tương lai";

        const maxBackDays = Number(options.maxBackDays ?? 14);
        if (Number.isFinite(maxBackDays) && maxBackDays >= 0 && options.enforceBackDate !== false) {
            const oldest = new Date(today);
            oldest.setDate(oldest.getDate() - maxBackDays);
            if (parsedDate < oldest) errors.work_date = `Chỉ được nhập báo cáo trong ${maxBackDays} ngày gần nhất`;
        }
    }

    const shift = String(payload.shift || "").trim();
    if (!shift) errors.shift = "Thiếu ca làm việc";
    else if (!ALLOWED_SHIFTS.has(shift)) errors.shift = "Ca làm việc không hợp lệ";

    const totalTime = finiteNumber(payload.total_time, "total_time", errors, { max: MAX_TOTAL_TIME_HOURS });
    const deductionTime = finiteNumber(payload.deduction_time, "deduction_time", errors, { max: MAX_TOTAL_TIME_HOURS });
    const actualTime = finiteNumber(payload.actual_time, "actual_time", errors, { max: MAX_TOTAL_TIME_HOURS });
    const standardOutput = finiteNumber(payload.standard_output, "standard_output", errors, { min: Number.MIN_VALUE, max: 100000000 });
    const actualOutput = finiteNumber(payload.actual_output, "actual_output", errors, { max: 100000000 });
    const ttOk = finiteNumber(payload.tt_ok, "tt_ok", errors, { max: 100000000 });
    const ttNg = finiteNumber(payload.tt_ng, "tt_ng", errors, { max: 100000000 });

    if (actualTime <= 0) errors.actual_time = "Thời gian làm thực tế phải lớn hơn 0";
    if (totalTime > MAX_TOTAL_TIME_HOURS) errors.total_time = "Tổng thời gian không được vượt quá 12 giờ";
    if (Math.abs(totalTime - (actualTime + deductionTime)) > EPSILON) {
        errors.total_time = "Tổng thời gian phải bằng thời gian làm thực tế cộng thời gian trừ";
    }
    const defects = normalizeDetails(payload.defects || [], "defect_type_id", "quantity", "defects", errors);
    if (options.skipActualOutputFormula !== true) {
        const policyValue = Object.prototype.hasOwnProperty.call(payload, 'exclude_kqd_from_tt_snapshot')
            ? payload.exclude_kqd_from_tt_snapshot
            : payload.exclude_kqd_from_tt;
        const expectedActualOutput = calculateActualOutput({
            ttOk,
            defects,
            excludeKqdFromTt: Boolean(Number(policyValue || 0))
        });
        if (Math.abs(actualOutput - expectedActualOutput) > EPSILON) {
            errors.actual_output = "Sản lượng thực tế không đúng theo quy tắc tính của mã sản phẩm";
        }
    }

    let deductions = normalizeDetails(payload.deductions || [], "deduction_type_id", "hours", "deductions", errors);

    // Canonical unit is HOURS. Support legacy minute-based detail payloads.
    const deductionTotal = deductions.reduce((sum, item) => sum + item.hours, 0);
    const minuteBasedTotal = deductionTotal / 60;
    if (
        deductionTime > EPSILON &&
        Math.abs(deductionTotal - deductionTime) > EPSILON &&
        Math.abs(minuteBasedTotal - deductionTime) <= EPSILON
    ) {
        deductions = deductions.map((item) => ({
            ...item,
            hours: item.hours / 60
        }));
    }

    const defectTotal = defects.reduce((sum, item) => sum + item.quantity, 0);
    const normalizedDeductionTotal = deductions.reduce((sum, item) => sum + item.hours, 0);

    if (Math.abs(defectTotal - ttNg) > EPSILON) {
        errors.tt_ng = "TT NG phải bằng tổng số lượng trong chi tiết lỗi";
    }

    // Compare in minutes as well as hours. This prevents harmless floating-point
    // representations such as 20/60 = 0.3333333333333333 from being rejected.
    if (Math.abs(finiteMinutes(normalizedDeductionTotal) - finiteMinutes(deductionTime)) > 1) {
        errors.deduction_time = "Thời gian trừ phải bằng tổng thời gian trong chi tiết khấu trừ";
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        normalized: {
            ...payload,
            work_date: workDate,
            shift,
            machine_no: String(payload.machine_no || "").trim() || null,
            product_name: String(payload.product_name || "").trim() || null,
            note: String(payload.note || "").trim().slice(0, 1000),
            client_request_id: String(payload.client_request_id || "").trim().slice(0, 64) || null,
            training_percent: normalizeTrainingPercent(payload.training_percent, 100),
            total_time: totalTime,
            deduction_time: deductionTime,
            actual_time: actualTime,
            standard_output: standardOutput,
            actual_output: actualOutput,
            tt_ok: ttOk,
            tt_ng: ttNg,
            defects,
            deductions
        }
    };
};

module.exports = { validateProductionReport, EPSILON, MAX_TOTAL_TIME_HOURS };
