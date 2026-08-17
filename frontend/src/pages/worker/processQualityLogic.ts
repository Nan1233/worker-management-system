import type { FormState } from "./processPageConfig";

type NgOption = { key: string; code?: string | null };

/** NG is a derived value: only configured defect buckets are counted. */
export function isValidIntegerInput(value: string): boolean {
  return /^\d*$/.test(String(value ?? ""));
}

export function calculateNgTotal(form: FormState, options: NgOption[]): number {
  return (options || []).reduce((sum, option) => {
    const value = Number(form[option.key] || 0);
    return sum + (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  }, 0);
}

export function syncQualityTotals(form: FormState, options: NgOption[], calculateActual: (next: FormState) => number): FormState {
  const ttNg = calculateNgTotal(form, options);
  const next = { ...form, ttNg: String(ttNg) };
  next.actualOutput = String(Math.max(0, Math.floor(calculateActual(next))));
  return next;
}

export function applyNgToggleToForm(form: FormState, key: string, checked: boolean, options: NgOption[], calculateActual: (next: FormState) => number): FormState {
  const next = { ...form, [key]: checked ? (form[key] || "0") : "" };
  return syncQualityTotals(next, options, calculateActual);
}

export function applyNgValueToForm(form: FormState, key: string, value: string, options: NgOption[], calculateActual: (next: FormState) => number): FormState {
  const next = { ...form, [key]: value };
  return syncQualityTotals(next, options, calculateActual);
}

export function applyTtOkToForm(form: FormState, value: string, options: NgOption[], calculateActual: (next: FormState) => number): FormState {
  const next = { ...form, ttOk: value };
  return syncQualityTotals(next, options, calculateActual);
}
