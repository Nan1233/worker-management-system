const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createProcessExtraDataValidator } = require("../services/processExtraDataValidationService");
const { getProcessMachinePolicy } = require("../services/processMachinePolicy");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("Đo only accepts a related machine that is active in the Mài master", async () => {
    let queryCount = 0;
    const validate = createProcessExtraDataValidator({
        query: async (sql, params) => {
            queryCount += 1;
            assert.match(sql, /process_code.*MAI/s);
            assert.match(sql, /m\.status = 'active'/);
            assert.deepEqual(params, ["m-01"]);
            return [{ machine_code: "M-01" }];
        }
    });
    const result = await validate({ processCode: "DO", extraData: { grinding_machine_no: " m-01 " } });
    assert.equal(result.valid, true);
    assert.equal(result.extraData.grinding_machine_no, "M-01");
    assert.equal(queryCount, 1);
});

test("Đo rejects an unknown or inactive related Mài machine", async () => {
    const validate = createProcessExtraDataValidator({ query: async () => [] });
    const result = await validate({ processCode: "DO", extraData: { grinding_machine_no: "M-99" } });
    assert.equal(result.valid, false);
    assert.match(result.errors.grinding_machine_no, /không tồn tại hoặc đã ngừng hoạt động/);
});

test("Other processes preserve their own extra data without querying Mài machines", async () => {
    const validate = createProcessExtraDataValidator({ query: async () => { throw new Error("should not query"); } });
    const extraData = { note: "keep" };
    const result = await validate({ processCode: "MAI", extraData });
    assert.equal(result.valid, true);
    assert.deepEqual(result.extraData, extraData);
});

test("Empty related Mài machine remains optional for Đo", async () => {
    const validate = createProcessExtraDataValidator({ query: async () => { throw new Error("should not query"); } });
    const result = await validate({ processCode: "DO", extraData: { grinding_machine_no: "" } });
    assert.equal(result.valid, true);
});

test("FE and BE agree that Mài supports up to four machines and Đo requires one", () => {
    assert.deepEqual(getProcessMachinePolicy(2), { code: "MAI", mode: "MULTI_MACHINE_REQUIRED", minMachines: 1, maxMachines: 4 });
    assert.deepEqual(getProcessMachinePolicy(3), { code: "DO", mode: "SINGLE_MACHINE_REQUIRED", minMachines: 1, maxMachines: 1 });
    const domain = read("frontend/src/pages/worker/processPageDomain.ts");
    assert.match(domain, /return \["GC", "MAI", "CAN", "EP"\]\.includes\(c\.processCode\) && mode === "MACHINE"/);
    const fields = read("frontend/src/pages/worker/processExtraFields.ts");
    // Related grinding machine field was deliberately hidden from the worker form.
    // Backend may still accept old extra_data for existing approved reports.
    assert.match(fields, /do:\\s*\\[\\s*\\]/);
    assert.doesNotMatch(fields, /key:\\s*"grinding_machine_no"/);
    const page = read("frontend/src/pages/worker/ProcessPage.tsx");
    assert.match(page, /getCachedMachines\(2\)/);
    assert.match(page, /Máy Mài liên quan không còn trong danh mục hoạt động/);
});

test("Create and edit endpoints both validate the DO related Mài machine", () => {
    assert.match(read("backend/controllers/productionTempWorkerController.js"), /validateProcessExtraData/);
    assert.match(read("backend/controllers/productionTempManagementController.js"), /validateProcessExtraData/);
});

test("Mài KQSX is sent by FE and checked again by BE", () => {
    const payload = read("frontend/src/pages/worker/processReportSubmission.ts");
    const validator = read("backend/services/machineLineValidationService.js");
    assert.match(payload, /actual_quantity: num\(l\.actualQuantity\)/);
    assert.match(validator, /line\.actual_quantity !== undefined/);
    assert.match(validator, /actualQuantity !== okQuantity \+ ngQuantity/);
});
