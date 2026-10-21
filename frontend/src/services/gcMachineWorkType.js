// Single frontend rule for the Cắt/Lồng work type of a GC machine.
// The machine master (machines.gc_work_type = "CUT" | "LONG" | null, served by
// GET /machines) is the source of truth, exactly like the backend. The machine
// code prefix (C*, ML*) must not be used to decide the work type.

export const normalizeGcWorkType = (value) => {
  const text = String(value ?? "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (text === "CUT" || text === "CAT") return "CUT";
  if (text === "LONG" || text === "LNG") return "LONG";
  return null;
};

const normalizeCode = (value) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");

// "CUT" | "LONG" | null (unknown machine, or machine without a configured type)
export const gcWorkTypeOfMachine = (machines, machineCode) => {
  const code = normalizeCode(machineCode);
  if (!code || !Array.isArray(machines)) return null;
  const machine = machines.find((item) => normalizeCode(item?.machine_code) === code);
  return machine ? normalizeGcWorkType(machine.gc_work_type) : null;
};

// Scopes machine autocomplete options for the selected Cắt/Lồng operation.
// options: [{ value, workType? }]. When the API supplies gc_work_type, only machines
// whose configured type matches are offered (unconfigured machines are not offered
// because the backend would reject them). If the API predates migration 059
// (workType is undefined on every option) the previous prefix scoping is kept as a
// display convenience only; the backend remains the authority at submit time.
export const scopeGcMachineOptions = (options, workType) => {
  const list = Array.isArray(options) ? options : [];
  if (workType !== "CUT" && workType !== "LONG") return list;
  const masterTypeAvailable = list.some((option) => option?.workType !== undefined);
  if (masterTypeAvailable) return list.filter((option) => normalizeGcWorkType(option.workType) === workType);
  return list.filter((option) => {
    const code = String(option?.value ?? "").trim();
    return workType === "CUT" ? /^C\d+$/i.test(code) : /^ML\d+$/i.test(code) || /^\d+$/.test(code);
  });
};
