"use strict";

// Central place for production rules that are likely to change.
// Keep hard safety/data-integrity checks outside this policy.
const DAILY_HOURS_POLICY = Object.freeze({
  enabled: true,
  limitHours: 12,
  // GC and MAI can involve multiple machines per worker. Until a per-machine
  // time policy is finalized, do not apply a combined worker/day cap to them.
  excludedProcessCodes: Object.freeze(["GC", "MAI"]),
});

const MACHINE_CAPACITY_POLICY = Object.freeze({
  multiMachineProcessCodes: Object.freeze(["GC", "MAI"]),
  maxMachinesPerWorker: 4,
  defaultSharedWorkersPerMachine: 4,
  gcSharedMachineNumbers: Object.freeze([5, 6, 7, 11]),
  gcAutomaticMachineNumbers: Object.freeze([
    1, 2, 10, 11, 4, 3, 9, 8, 25, 26, 14, 17, 23, 24, 16,
  ]),
});

const normalizeProcessCode = (value) => String(value || "").trim().toUpperCase();

const isDailyHoursLimitExemptProcess = (processCode) =>
  DAILY_HOURS_POLICY.excludedProcessCodes.includes(normalizeProcessCode(processCode));

module.exports = {
  DAILY_HOURS_POLICY,
  MACHINE_CAPACITY_POLICY,
  normalizeProcessCode,
  isDailyHoursLimitExemptProcess,
};
