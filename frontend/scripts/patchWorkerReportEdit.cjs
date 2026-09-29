const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "../src/pages/worker/WorkerReportEditV2.tsx");
let source = fs.readFileSync(file, "utf8");
let changed = false;

const oldProcessId = `const processId = Number(report?.process_id) > 0 ? Number(report.process_id) : (capabilities.processCode === "CVK" ? 60006 : 0);`;
const newProcessId = `const PROCESS_ID_BY_CODE: Record<string, number> = { GC: 1, MAI: 2, DO: 60001, K1: 3, K2: 4, CAN: 60002, EP: 60003, XLBV: 60004, SX3: 60005, CVK: 60006 };
  const processId = Number(report?.process_id) > 0 ? Number(report.process_id) : (PROCESS_ID_BY_CODE[capabilities.processCode] || 0);`;
if (!source.includes("PROCESS_ID_BY_CODE") && source.includes(oldProcessId)) {
  source = source.replace(oldProcessId, newProcessId);
  changed = true;
}

const oldLoad = `const firstLine = (Array.isArray(data.machine_lines) ? data.machine_lines : Array.isArray(data.machineLines) ? data.machineLines : [])[0];`;
const newLoad = `const rawMachineLines = Array.isArray(data.machine_lines) ? data.machine_lines : Array.isArray(data.machineLines) ? data.machineLines : [];
        const legacyMachine = s(data.machine_no).split(",").map((v) => v.trim()).filter(Boolean)[0] || "";
        const legacyProduct = s(data.product_name).split(",").map((v) => v.trim()).filter(Boolean)[0] || "";
        const editMachineLines = rawMachineLines.length ? rawMachineLines : (legacyMachine || legacyProduct ? [{ machine_code: legacyMachine, product_code: legacyProduct, machine_time_hours: data.actual_time, ok_quantity: data.tt_ok, ng_quantity: data.tt_ng, standard_output: data.standard_output }] : []);
        const firstLine = editMachineLines[0];`;
if (!source.includes(newLoad) && source.includes(oldLoad)) {
  source = source.replace(oldLoad, newLoad);
  changed = true;
}

const oldSetReport = `setExtraData(Object.fromEntries(Object.entries(data.extra_data || {}).filter(([key]) => key !== "adjustment_count" && key !== "work_type").map(([key, value]) => [key, value == null ? "" : String(value)])));`;
const newSetReport = `setExtraData(Object.fromEntries(Object.entries(data.extra_data || {}).filter(([key]) => key !== "adjustment_count" && key !== "work_type").map(([key, value]) => [key, value == null ? "" : String(value)])));
        setReport({ ...data, __edit_machine_lines: editMachineLines });`;
if (!source.includes(newSetReport) && source.includes(oldSetReport)) {
  source = source.replace(oldSetReport, newSetReport);
  changed = true;
}

const oldLines = `setMachineLines(sourceLines.map((line: any) => {`;
const newLines = `setMachineLines((Array.isArray(report?.__edit_machine_lines) ? report.__edit_machine_lines : sourceLines).map((line: any) => {`;
if (!source.includes(newLines) && source.includes(oldLines)) {
  source = source.replace(oldLines, newLines);
  changed = true;
}

if (!changed) {
  console.log("[KTC] WorkerReportEditV2 master-data patch already present or target changed; no source rewrite needed.");
  process.exit(0);
}

fs.writeFileSync(file, source, "utf8");
console.log("[KTC] WorkerReportEditV2 master-data fallback patch applied.");