const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "../src/pages/worker/WorkerReportEditV2.tsx");
let source = fs.readFileSync(file, "utf8");
let changed = false;

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

const oldOperation = `setOperationType(data.operation_type === "LONG" ? "LONG" : "CUT");`;
const newOperation = `const normalizedOperation = s(data.operation_type || data.operation || "").trim().toUpperCase();
        setOperationType(normalizedOperation === "LONG" || normalizedOperation === "NEST" || normalizedOperation === "LÔNG" || normalizedOperation === "LỒNG" ? "LONG" : "CUT");`;
if (!source.includes(newOperation) && source.includes(oldOperation)) {
  source = source.replace(oldOperation, newOperation);
  changed = true;
}

// Keep this search pattern as a normal JS string. Using a template literal here would
// interpolate the patch script's own `total`, `actual`, and `deduction` variables.
const oldTimeFields = "totalTime: `" + "${total.hours}:${total.minutes}" + "`, actualTime: `" + "${actual.hours}:${actual.minutes}" + "`, actualHours: actual.hours, actualMinutes: actual.minutes,\n          deductionTime: `" + "${deduction.hours}:${deduction.minutes}" + "`,";
const newTimeFields = `totalTime: String(data.total_time ?? 0), actualTime: String(data.actual_time ?? 0), actualHours: actual.hours, actualMinutes: actual.minutes,
          deductionTime: String(data.deduction_time ?? 0),`;
if (!source.includes(newTimeFields) && source.includes(oldTimeFields)) {
  source = source.replace(oldTimeFields, newTimeFields);
  changed = true;
}

const marker = `  const updateForm = (key: string, value: string) =>`;
const standardResolver = `  const resolveEditLineStandards = async () => {
    const workDate = s(form.workDate).slice(0, 10);
    if (!workDate || !processId) return;
    const resolvedLines = await Promise.all(machineLines.map(async (line) => {
      if (!line.machineCode || !line.productCode) return line;
      try {
        const resolved: any = await resolveProductStandard(processId, line.machineCode, line.productCode, workDate);
        if (!resolved) return line;
        return {
          ...line,
          standardOutputPerHour: n(resolved.resolved_output_per_hour ?? resolved.default_standard_output ?? line.standardOutputPerHour),
          standardTimeSeconds: resolved.standard_time_seconds ?? line.standardTimeSeconds,
          standardSource: resolved.standard_source ?? line.standardSource,
        };
      } catch {
        return line;
      }
    }));
    setMachineLines(resolvedLines);
  };

  useEffect(() => {
    if (!loading && !loadingMasterData && machineLines.some((line) => line.machineCode && line.productCode)) {
      void resolveEditLineStandards();
    }
  }, [loading, loadingMasterData, form.workDate, processId]);

`;
if (!source.includes("const resolveEditLineStandards") && source.includes(marker)) {
  source = source.replace(marker, standardResolver + marker);
  changed = true;
}

if (!changed) {
  console.log("[KTC] WorkerReportEditV2 hydration patch already present or target changed; no source rewrite needed.");
  process.exit(0);
}

fs.writeFileSync(file, source, "utf8");
console.log("[KTC] WorkerReportEditV2 hydration/operation/time/standard patch applied.");