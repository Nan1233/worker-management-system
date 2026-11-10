"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPhysicalMachineMetadata } = require("../electron/monthlyWorkbookPhysicalEvents.cjs");
const { machineEventDeductionSnapshot, addPhysicalMachineEventsMetadata } = createPhysicalMachineMetadata({
  asText: (value) => String(value ?? "").trim(),
  asNumber: (value) => value == null || value === "" ? null : Number(value),
});

test("no participant line and conflicting deductions are not assigned to physical event", () => {
  assert.equal(machineEventDeductionSnapshot([]).status, "NO_PARTICIPANT_LINE");
  assert.equal(machineEventDeductionSnapshot([
    { deduction_time_hours: 0.5 }, { deduction_time_hours: 1.0 },
  ]).status, "CONFLICTING_PARTICIPANT_LINES");
});

test("one consistent machine deduction snapshot is recorded only once", () => {
  const same = { deductions: [{ deduction_type_id: 2, hours: 0.25 }] };
  const snapshot = machineEventDeductionSnapshot([same, { ...same }]);
  assert.equal(snapshot.status, "RECORDED_ONCE");
  assert.equal(snapshot.hours, 0.25);
  assert.equal(JSON.parse(snapshot.detailsJson).length, 1);
});

test("metadata emits one row per physical event regardless of participant lines", () => {
  const sheets = new Map();
  const workbook = {
    getWorksheet: (name) => sheets.get(name),
    removeWorksheet: (id) => sheets.delete(id),
    addWorksheet(name) {
      const sheet = { id: name, rows: [], addRow(row) { this.rows.push(row); } };
      sheets.set(name, sheet);
      return sheet;
    },
  };
  const data = {
    reports: [{ machineLines: [
      { machine_event_id: 55, deduction_time_hours: 0.5 },
      { machine_event_id: 55, deduction_time_hours: 0.5 },
    ] }],
    physicalMachineEvents: [{ id: 55, machine_code: "C2556", physical_ok_quantity: 100, machine_time_hours: 2 }, { id: 55, machine_code: "C2556" }],
  };
  const sheet = addPhysicalMachineEventsMetadata(workbook, data);
  assert.equal(sheet.state, "veryHidden");
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.rows[1][0], 55);
  assert.equal(sheet.rows[1][14], 0.5);
  assert.equal(sheet.rows[1][16], "TOTAL_ONLY_NO_BREAKDOWN");
});
