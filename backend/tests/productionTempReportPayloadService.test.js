const test = require("node:test");
const assert = require("node:assert/strict");
const { buildProductionTempReportPayload } = require("../services/productionTempReportPayloadService");
const { buildLogicalDuplicateKey } = require("../services/logicalDuplicateReportService");

function fixture(overrides = {}) {
    return {
        requestBody: { entry_date: "2026-11-10", operation_mode: "MANUAL", force_create: false },
        validation: { normalized: {
            work_date: "2026-11-10", shift: "A", machine_no: null, product_name: "SP1",
            tt_ok: 10, tt_ng: 0, actual_output: 10, operation_type: null,
            operation_mode: "MANUAL"
        } },
        machineValidation: { lines: [], totals: null },
        masterValidation: {
            machineCode: null, productCode: "SP1", standardOutput: 100,
            standardVersionId: 4, machineStandardId: 8, authoritativeDefects: []
        },
        extraDataInput: {},
        workerId: 49,
        processId: 1,
        operationMode: "MANUAL",
        clientRequestId: "unit-test-001",
        ...overrides
    };
}

test("manual report preserves legacy payload and logical duplicate identity", () => {
    const input = fixture();
    const result = buildProductionTempReportPayload(input);
    assert.equal(result.worker_id, 49);
    assert.equal(result.process_id, 1);
    assert.equal(result.machine_no, null);
    assert.equal(result.product_name, "SP1");
    assert.equal(result.actual_output, 10);
    assert.equal(result.tt_ok, 10);
    assert.equal(result.tt_ng, 0);
    assert.equal(result.standard_output, 100);
    assert.equal(result.standard_version_id, 4);
    assert.equal(result.machine_standard_id, 8);
    assert.equal(result.entry_date, "2026-11-10");
    assert.equal(result.client_request_id, "unit-test-001");
    assert.equal(result.force_create, false);
    assert.equal(result.defects, undefined);
    assert.equal(result.deductions, undefined);
    assert.equal(result.logical_duplicate_key, buildLogicalDuplicateKey({
        workerId: 49, processId: 1, workDate: "2026-11-10",
        shift: "A", operationMode: result.operation_mode,
        machineNo: null, productName: "SP1", machineLines: []
    }));
});

test("multi-machine report retains aggregate output, weighted standard and line identity", () => {
    const lines = [
        { machine_code: "M1", product_code: "SP1" },
        { machine_code: "M2", product_code: "SP2" }
    ];
    const input = fixture({
        requestBody: { entry_date: "2026-11-10", operation_mode: "MACHINE" },
        validation: { normalized: {
            work_date: "2026-11-10", shift: "B", machine_no: "M1, M2",
            product_name: "SP1, SP2", tt_ok: 0, tt_ng: 0,
            operation_mode: "MACHINE"
        } },
        machineValidation: { lines, totals: {
            totalMachineHours: 4, totalMaximum: 400,
            totalCounted: 125, totalOk: 120, totalNg: 5
        } },
        operationMode: "MACHINE"
    });
    const result = buildProductionTempReportPayload(input);
    assert.equal(result.machine_no, "M1, M2");
    assert.equal(result.product_name, "SP1, SP2");
    assert.equal(result.standard_output, 100);
    assert.equal(result.standard_version_id, null);
    assert.equal(result.machine_standard_id, null);
    assert.equal(result.actual_output, 125);
    assert.equal(result.tt_ok, 120);
    assert.equal(result.tt_ng, 5);
    assert.equal(result.logical_duplicate_key, buildLogicalDuplicateKey({
        workerId: 49, processId: 1, workDate: "2026-11-10",
        shift: "B", operationMode: result.operation_mode,
        machineNo: "M1, M2", productName: "SP1, SP2", machineLines: lines
    }));
});
