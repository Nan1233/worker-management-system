import type { DeductionState } from "./processPageConfig";

const minutesOf = (d: DeductionState) => Object.values(d || {}).reduce((sum,v)=>sum+(Number(v)||0),0);
const baseMinutes = (hours:string, minutes:string) => Math.max(0,(Number(hours)||0)*60+(Number(minutes)||0));

export function normalizeDeductionInput(value:string): string {
  const v=String(value??"").replace(/,/g,".").replace(/[^0-9.]/g,"");
  const first=v.indexOf(".");
  return first>=0 ? v.slice(0,first+1)+v.slice(first+1).replace(/\./g,"") : v;
}
export function normalizeDeductionStoredValue(value:string): string {
  const n=Number(value);
  return Number.isFinite(n) && n>0 ? String(Math.round(n*100)/100) : "";
}
export function getProspectiveTotalWorkMinutes(data:DeductionState, actualHours:string, actualMinutes:string): number {
  // Business rule: actual working time + all deduction minutes must never exceed 12 hours.
  // Keep this calculation pure so both mobile and web forms validate the same way.
  return baseMinutes(actualHours, actualMinutes) + minutesOf(data);
}
export function calculateDeductionTimeSummary(data:DeductionState, actualHours:string, actualMinutes:string) {
  const total = baseMinutes(actualHours,actualMinutes);
  const deduction = minutesOf(data);
  return {
    actualTime: Math.max(0,total-deduction)/60,
    deductionHours: deduction/60,
    totalTime: total/60
  };
}
