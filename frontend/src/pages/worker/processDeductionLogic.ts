import type { DeductionState } from "./processPageConfig";

const minutesOf = (d: DeductionState) => Object.values(d || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
const baseMinutes = (hours: string, minutes: string) => Math.max(0, (Number(hours) || 0) * 60 + (Number(minutes) || 0));

export function normalizeDeductionInput(value: string): string {
  const v = String(value ?? "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
  const first = v.indexOf(".");
  return first >= 0 ? v.slice(0, first + 1) + v.slice(first + 1).replace(/\./g, "") : v;
}

export function normalizeDeductionStoredValue(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : "";
}

export function getProspectiveTotalWorkMinutes(data: DeductionState, actualHours: string, actualMinutes: string): number {
  // P0 business rule: the 12h/day limit applies to actual working time only.
  // Deduction/support time is excluded from the worker's counted daily hours.
  // Keep deduction minutes out of this prospective value so the UI matches the
  // backend canonical daily-hours check, which sums actual_time only.
  void data;
  return baseMinutes(actualHours, actualMinutes);
}

export function calculateDeductionTimeSummary(data: DeductionState, actualHours: string, actualMinutes: string) {
  // entered time = actual/net working time
  // deduction time = excluded minutes
  // total time = actual + deduction (gross report duration)
  const actualMinutesTotal = baseMinutes(actualHours, actualMinutes);
  const deduction = minutesOf(data);
  return {
    actualTime: actualMinutesTotal / 60,
    deductionHours: deduction / 60,
    totalTime: (actualMinutesTotal + deduction) / 60,
  };
}
