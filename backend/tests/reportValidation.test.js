const test = require("node:test");
const assert = require("node:assert/strict");
const { validateProductionReport } = require("../utils/reportValidation");

const valid = {
    work_date: "2026-07-17", shift: "Ca 1", total_time: 8,
    deduction_time: 1, actual_time: 7, standard_output: 100,
    actual_output: 90, tt_ok: 85, tt_ng: 5,
    defects: [{ defect_type_id: 1, defect_name: "Lỗi mẫu", quantity: 5 }],
    deductions: [{ deduction_type_id: 1, deduction_name: "Trừ mẫu", hours: 1 }]
};

test("accepts a consistent report", () => {
    assert.equal(validateProductionReport(valid).valid, true);
});

test("rejects negative and inconsistent time", () => {
    const result = validateProductionReport({ ...valid, deduction_time: 9, actual_time: -1 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.deduction_time);
    assert.ok(result.errors.actual_time);
});

test("rejects actual output below OK + NG", () => {
    const result = validateProductionReport({ ...valid, actual_output: 50 });
    assert.equal(result.valid, false);
    assert.ok(result.errors.actual_output);
});
