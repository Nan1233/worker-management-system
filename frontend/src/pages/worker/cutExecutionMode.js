export const GC_AUTOMATIC_MACHINE_CODES = new Set(["C5", "C6", "C7", "C11"]);

export const normalizeMachineCode = (value) =>
  String(value ?? "").trim().toUpperCase().replace(/^MÁY\s*/i, "");

export const resolveCutExecutionMode = (machineCode) => {
  const normalized = normalizeMachineCode(machineCode);
  // No selected machine keeps the form's default mode; only selected unknown codes are NON_AUTO.
  if (!normalized) return "AUTO";
  return GC_AUTOMATIC_MACHINE_CODES.has(normalized) ? "AUTO" : "NON_AUTO";
};

export const getVisibleGcMachineOptions = (options, operationType, cutExecutionMode) => {
  if (operationType !== "CUT") return options;
  const automatic = cutExecutionMode === "AUTO";
  return options.filter(
    (option) => GC_AUTOMATIC_MACHINE_CODES.has(normalizeMachineCode(option.value)) === automatic,
  );
};
