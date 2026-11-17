"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isGiaCongProcess,
  isMaiProcess,
  shouldSplitMachineReports,
  groupMaiMachineProductLines,
  childRequestId,
  splitMachineLinePayload,
} = require("../services/productionMachineReportGrouping");

const base = {
  worker_id: 49, process_id: 2, work_date: "2026-11-10", shift: "A",
  process_code: "MAI", operation_mode: "MACHINE", extra_data: { source: "test" }
};

test("process classification and machine split remain unchanged", () => {
  assert.equal(isMaiProcess(base), true);
  assert.equal(isGiaCongProcess(base), false);
  assert.equal(shouldSplitMachineReports(base, [{}, {}]), true);
  assert.equal(shouldSplitMachineReports(base, [{}]), false);
  assert.equal(shouldSplitMachineReports({ ...base, process_code: "K1" }, [{}, {}]), false);
});

test("MAI groups duplicate machine/product lines and preserves details", () => {
  const lines = [
    { machine_code: "M1", product_code: "P1", machine_time_hours: 1, deduction_time_hours: 0.25, counted_output: 10, ok_quantity: 9, ng_quantity: 1, defects: [{ quantity: 1 }] },
    { machine_code: "m1", product_code: "p1", machine_time_hours: 2, deduction_time_hours: 0.5, counted_output: 20, ok_quantity: 18, ng_quantity: 2, defects: [{ quantity: 2 }] },
    { machine_code: "M1", product_code: "P2", machine_time_hours: 3, counted_output: 30 }
  ];
  const grouped = groupMaiMachineProductLines(lines);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].machine_time_hours, 3);
  assert.equal(grouped[0].counted_output, 30);
  assert.equal(grouped[0]._source_machine_lines.length, 2);
  assert.equal(grouped[0].defects.length, 2);
  const child = splitMachineLinePayload(base, grouped[0]._source_machine_lines, "group-001", 0, 2);
  assert.equal(child.total_time, 3);
  assert.equal(child.deduction_time, 0.75);
  assert.equal(child.tt_ok, 27);
  assert.equal(child.tt_ng, 3);
  assert.equal(child.defects.length, 2);
  assert.equal(child.extra_data.machine_group_request_id, "group-001");
  assert.equal(child.extra_data.source, "test");
  assert.equal(child.client_request_id, childRequestId("group-001", grouped[0]._source_machine_lines, 0));
});

test("child identities remain stable and distinct for products on the same machine", () => {
  const a = [{ machine_code: "M1", product_code: "P1" }];
  const b = [{ machine_code: "M1", product_code: "P2" }];
  assert.equal(childRequestId("r", a, 0), childRequestId("r", a, 0));
  assert.notEqual(childRequestId("r", a, 0), childRequestId("r", b, 0));
  assert.notEqual(childRequestId("r", a, 0), childRequestId("r", a, 1));
});
