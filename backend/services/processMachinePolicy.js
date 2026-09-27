const PROCESS_IDS = Object.freeze({
  GC: 1,
  MAI: 2,
  DO: 3,
  K1: 4,
  K2: 5,
  XLBV: 6,
  EP: 7,
  CAN: 8,
  SX3: 9,
  CVK: 60006
});

// Accept legacy FE ids at the API boundary while all internal comparisons
// use the canonical process ids stored in the current DB.
const LEGACY_PROCESS_ID_MAP = Object.freeze({
  60001: PROCESS_IDS.DO,
  60002: PROCESS_IDS.CAN,
  60003: PROCESS_IDS.EP,
  60004: PROCESS_IDS.XLBV,
  60005: PROCESS_IDS.SX3,
});

const normalizeProcessId = (processId) => {
  const numeric = Number(processId);
  return LEGACY_PROCESS_ID_MAP[numeric] ?? numeric;
};

const CODE_BY_ID = new Map(Object.entries(PROCESS_IDS).map(([code, id]) => [Number(id), code]));

/**
 * Quy tắc máy theo thực tế xưởng KTC.
 * - Mài/Cán: có thể dùng nhiều máy, tối đa 4.
 * - Đo/Ép: đúng 1 công nhân / 1 máy cho mỗi báo cáo.
 * - GC: manual hoặc smart-machine, tối đa 4 máy.
 * - K1/K2: manual hoặc 1 máy.
 * - XLBV/SX3/CVK: không dùng máy sản xuất.
 */
const getProcessMachinePolicy = (processId) => {
  const canonicalId = normalizeProcessId(processId);
  const code = CODE_BY_ID.get(canonicalId) || "";
  if (code === "MAI") {
    return { code, mode: "MULTI_MACHINE_REQUIRED", minMachines: 1, maxMachines: 4 };
  }
  if (["DO", "EP"].includes(code)) {
    return { code, mode: "SINGLE_MACHINE_REQUIRED", minMachines: 1, maxMachines: 1 };
  }
  if (code === "CAN") {
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

module.exports = { PROCESS_IDS, normalizeProcessId, getProcessMachinePolicy };
