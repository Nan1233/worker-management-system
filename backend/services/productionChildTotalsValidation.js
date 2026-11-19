"use strict";

// Pure child total validation. Keep error codes, minute rounding and the
// +/-1 minute tolerance identical to the production submission contract.
const validateChildTotals = (data, defects, deductions) => {
    const expectedNg = Math.max(0, Math.trunc(Number(data?.tt_ng || 0) || 0));
    const actualNg = defects.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity) || 0)), 0);
    if (expectedNg !== actualNg) {
        const error = new Error(`Chi tiết NG (${actualNg}) không khớp TT NG (${expectedNg})`);
        error.status = 422; error.code = "NG_DETAIL_TOTAL_MISMATCH"; error.isPublic = true; error.details = { expected: expectedNg, actual: actualNg }; throw error;
    }
    const expectedMinutes = Math.round((Number(data?.deduction_time || 0) || 0) * 60);
    const actualMinutes = Math.round(deductions.reduce((sum, item) => sum + (Number(item.hours) || 0), 0) * 60);
    // The form stores 70 minutes as 1.17 hours while the canonical detail is
    // 70/60 = 1.166666... . Compare rounded minutes, not raw decimals.
    if (Math.abs(expectedMinutes - actualMinutes) > 1) {
        const error = new Error(`Chi tiết trừ giờ (${actualMinutes} phút) không khớp tổng trừ giờ (${expectedMinutes} phút)`);
        error.status = 422; error.code = "DEDUCTION_DETAIL_TOTAL_MISMATCH"; error.isPublic = true; error.details = { expectedMinutes, actualMinutes }; throw error;
    }
};

module.exports = { validateChildTotals };
