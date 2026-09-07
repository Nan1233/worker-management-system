const PROCESS_IDS = Object.freeze({
  GC: 1,
  MAI: 2,
  K1: 3,
  K2: 4,
  DO: 60001,
  CAN: 60002,
  EP: 60003,
  XLBV: 60004,
  SX3: 60005,
  CVK: 60006
});

const CODE_BY_ID = new Map(Object.entries(PROCESS_IDS).map(([code, id]) => [Number(id), code]));

/**
 * Quy tắc máy theo thực tế xưởng KTC.
 * CVK = Công việc khác/không theo mã sản phẩm: không dùng máy sản xuất.
 */
const getProcessMachinePolicy = (processId) => {
  const code = CODE_BY_ID.get(Number(processId)) || "";
  if (["MAI", "DO", "EP", "CAN"].includes(code)) {
    return { code, mode: "MULTI_MACHINE_REQUIRED", minMachines: 1, maxMachines: 4 };
  }
  if (code === "GC") {
    return { code, mode: "MANUAL_OR_SMART_MACHINE", minMachines: 0, maxMachines: 4 };
  }
  if (["K1", "K2"].includes(code)) {
    return { code, mode: "MANUAL_OR_SINGLE_MACHINE", minMachines: 0, maxMachines: 1 };
  }
  if (["XLBV", "SX3", "CVK"].includes(code)) {
    return { code, mode: "MANUAL_ONLY", minMachines: 0, maxMachines: 0 };
  }
  return { code, mode: "LEGACY", minMachines: 0, maxMachines: 1 };
};

module.exports = { PROCESS_IDS, getProcessMachinePolicy };
