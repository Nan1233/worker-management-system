const test = require("node:test");
const assert = require("node:assert/strict");
const { createMachineLineValidator } = require("../services/machineLineValidationService");

test("machine line validation resolves many defects with bulk master queries", async () => {
    const queryCalls = [];
    const defectRows = Array.from({ length: 20 }, (_, index) => ({
        id: index + 1,
        defect_code: `D${String(index + 1).padStart(2, "2")}`,
        defect_name: `Lỗi ${index + 1}`
    }));

    const query = async (sql) => {
        queryCalls.push(sql);
        if (sql.includes("FROM defect_types")) return defectRows;
        if (sql.includes("FROM machines")) {
            return [{
                id: 101,
                machine_code: "C11",
                is_automatic: 1,
                process_code: "GC"
            }];
        }
        throw new Error(`Unexpected query in test: ${sql}`);
    };

    const standardResolver = {
        resolveStandard: async () => ({
            productStandardId: 500,
            standardVersionId: 700,
            machineStandardId: null,
            productCode: "C502",
            standardOutput: 1560,
            standardTimeSeconds: null,
            excludeKqdFromTt: 0,
            source: "PRODUCT_VERSION"
        })
    };

    const validator = createMachineLineValidator({ query, standardResolver });
    const defects = defectRows.map((row) => ({
        defect_type_id: row.id,
        defect_code: row.defect_code,
        defect_name: row.defect_name,
        quantity: 1
    }));

    const result = await validator({
        processId: 1,
        workDate: "2026-09-16",
        operationMode: "MACHINE",
        machineLines: [{
            machine_code: "C11",
            product_code: "C502",
            machine_time_hours: 1,
            ok_quantity: 1000,
            ng_quantity: 20,
            defects
        }]
    });

    assert.equal(result.valid, true);
    assert.equal(result.totals.totalNg, 20);
    assert.equal(result.lines[0].defects.length, 20);
    assert.equal(queryCalls.length, 2, "defect + machine masters must be loaded once each");
    assert.equal(queryCalls.filter((sql) => sql.includes("FROM defect_types")).length, 1);
    assert.equal(queryCalls.filter((sql) => sql.includes("FROM machines")).length, 1);
});
