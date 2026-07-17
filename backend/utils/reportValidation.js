const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_SHIFTS = new Set(["Ca 1", "Ca 2", "Ca 3", "HC", "Hành chính"]);

const finiteNumber = (value, field, errors, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const numberValue = Number(value ?? 0);
    if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
        errors[field] = `${field} phải là số từ ${min} đến ${max}`;
        return 0;
    }
    return numberValue;
};

const validateDetailList = (items, valueField, label, errors) => {
    if (!Array.isArray(items)) {
        errors[label] = `${label} phải là danh sách`;
        return;
    }
    items.forEach((item, index) => {
        const value = Number(item?.[valueField] ?? 0);
        if (!Number.isFinite(value) || value < 0) {
            errors[`${label}.${index}.${valueField}`] = `${valueField} không được âm`;
        }
    });
};

const validateProductionReport = (payload = {}) => {
    const errors = {};
    const workDate = String(payload.work_date || "").slice(0, 10);
    if (!DATE_PATTERN.test(workDate) || Number.isNaN(new Date(`${workDate}T00:00:00`).getTime())) {
        errors.work_date = "Ngày làm việc không hợp lệ";
    }

    const shift = String(payload.shift || "").trim();
    if (!shift) errors.shift = "Thiếu ca làm việc";
    else if (!ALLOWED_SHIFTS.has(shift)) errors.shift = "Ca làm việc không hợp lệ";

    const totalTime = finiteNumber(payload.total_time, "total_time", errors, { max: 24 });
    const deductionTime = finiteNumber(payload.deduction_time, "deduction_time", errors, { max: 24 });
    const actualTime = finiteNumber(payload.actual_time, "actual_time", errors, { max: 24 });
    const standardOutput = finiteNumber(payload.standard_output, "standard_output", errors);
    const actualOutput = finiteNumber(payload.actual_output, "actual_output", errors);
    const ttOk = finiteNumber(payload.tt_ok, "tt_ok", errors);
    const ttNg = finiteNumber(payload.tt_ng, "tt_ng", errors);

    if (deductionTime > totalTime) errors.deduction_time = "Thời gian trừ không được lớn hơn tổng thời gian";
    if (Math.abs(actualTime - Math.max(0, totalTime - deductionTime)) > 0.02) {
        errors.actual_time = "Thời gian thực tế phải bằng tổng thời gian trừ thời gian khấu trừ";
    }
    if (ttOk + ttNg > actualOutput && actualOutput > 0) {
        errors.actual_output = "Sản lượng thực tế không được nhỏ hơn tổng OK + NG";
    }

    validateDetailList(payload.defects || [], "quantity", "defects", errors);
    validateDetailList(payload.deductions || [], "hours", "deductions", errors);

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        normalized: {
            ...payload,
            work_date: workDate,
            shift,
            machine_no: String(payload.machine_no || "").trim() || null,
            product_name: String(payload.product_name || "").trim() || null,
            note: String(payload.note || "").trim(),
            total_time: totalTime,
            deduction_time: deductionTime,
            actual_time: actualTime,
            standard_output: standardOutput,
            actual_output: actualOutput,
            tt_ok: ttOk,
            tt_ng: ttNg
        }
    };
};

module.exports = { validateProductionReport };
