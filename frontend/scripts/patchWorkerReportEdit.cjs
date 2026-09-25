const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "../src/pages/worker/WorkerReportEditV2.tsx");
let source = fs.readFileSync(file, "utf8");
let changed = false;

// Legacy reports may not have machine_lines. Reconstruct one editable line
// from the canonical report-level machine/product/time/OK/NG/standard fields.
const oldLoad = `const firstLine = (Array.isArray(data.machine_lines) ? data.machine_lines : Array.isArray(data.machineLines) ? data.machineLines : [])[0];`;
const newLoad = `const rawMachineLines = Array.isArray(data.machine_lines) ? data.machine_lines : Array.isArray(data.machineLines) ? data.machineLines : [];
        const legacyMachine = s(data.machine_no).split(",").map((v) => v.trim()).filter(Boolean)[0] || "";
        const legacyProduct = s(data.product_name).split(",").map((v) => v.trim()).filter(Boolean)[0] || "";
        const editMachineLines = rawMachineLines.length ? rawMachineLines : (legacyMachine || legacyProduct ? [{ machine_code: legacyMachine, product_code: legacyProduct, machine_time_hours: data.actual_time, ok_quantity: data.tt_ok, ng_quantity: data.tt_ng, standard_output: data.standard_output }] : []);
        const firstLine = editMachineLines[0];`;
if (!source.includes(newLoad)) {
  if (source.includes(oldLoad)) {
    source = source.replace(oldLoad, newLoad);
    changed = true;
  }
}

// Keep reconstructed lines in state so the save payload cannot drop them.
const oldSetReport = `setExtraData(Object.fromEntries(Object.entries(data.extra_data || {}).filter(([key]) => key !== "adjustment_count" && key !== "work_type").map(([key, value]) => [key, value == null ? "" : String(value)])));`;
const newSetReport = `setExtraData(Object.fromEntries(Object.entries(data.extra_data || {}).filter(([key]) => key !== "adjustment_count" && key !== "work_type").map(([key, value]) => [key, value == null ? "" : String(value)])));
        setReport({ ...data, __edit_machine_lines: editMachineLines });`;
if (!source.includes(newSetReport) && source.includes(oldSetReport)) {
  source = source.replace(oldSetReport, newSetReport);
  changed = true;
}

// Hydrate machine lines from the reconstructed legacy lines as well as normal
// machine_lines, preserving machine-level NG/OK/NG/standard data.
const oldLines = `setMachineLines(sourceLines.map((line: any) => {`;
const newLines = `setMachineLines((Array.isArray(report?.__edit_machine_lines) ? report.__edit_machine_lines : sourceLines).map((line: any) => {`;
if (!source.includes(newLines) && source.includes(oldLines)) {
  source = source.replace(oldLines, newLines);
  changed = true;
}

// Re-resolve each editable line against the current canonical standard using
// process + machine + product + work_date. This prevents report-level legacy
// standards from masking a newer machine/product-specific standard.
const marker = `  const updateForm = (key: string, value: string) =>`;
const standardResolver = `  const resolveEditLineStandards = async () => {
    const workDate = s(form.workDate).slice(0, 10);
    if (!workDate || !processId) return;
    const resolvedLines = await Promise.all(machineLines.map(async (line) => {
      if (!line.machineCode || !line.productCode) return line;
      try {
        const resolved: any = await resolveProductStandard({ processId, machineCode: line.machineCode, productCode: line.productCode, workDate });
        if (!resolved) return line;
        return {
          ...line,
          standardOutputPerHour: n(resolved.standard_output ?? resolved.standardOutput ?? line.standardOutputPerHour),
          standardTimeSeconds: resolved.standard_time_seconds ?? resolved.standardTimeSeconds ?? line.standardTimeSeconds,
          standardSource: resolved.source ?? line.standardSource,
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
console.log("[KTC] WorkerReportEditV2 hydration/standard-resolution patch applied.");
