import type { FormState } from "./processPageConfig";

type NgOption = { key: string; code?: string | null };

export function isValidIntegerInput(value: string): boolean {
  return /^\d*$/.test(String(value ?? ""));
}

/**
 * TT NG is the sum of NG quantities only.
 * An enabled/selected NG defect with an empty quantity contributes 0.
 * TT NG must never use OK/actualOutput as a fallback.
 */
export function calculateNgTotal(form: FormState, options: NgOption[]): number {
  return (options || []).reduce((sum, option) => {
    const quantity = Number(form[option.key]);
    return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}

export function applyNgToggleToForm(
  form: FormState,
  key: string,
  checked: boolean,
  options: NgOption[],
  calc: (f: FormState) => number
): FormState {
  const next = { ...form, [key]: checked ? (form[key] || "") : "" };
  const ttNg = calculateNgTotal(next, options);
  next.ttNg = String(ttNg);
  next.actualOutput = String(calc(next));
  return next;
}

export function applyNgValueToForm(
  form: FormState,
  key: string,
  value: string,
  options: NgOption[],
  calc: (f: FormState) => number
): FormState {
  const next = { ...form, [key]: value };
  const ttNg = calculateNgTotal(next, options);
  next.ttNg = String(ttNg);
  next.actualOutput = String(calc(next));
  return next;
}

export function applyTtOkToForm(
  form: FormState,
  value: string,
  calc: (f: FormState) => number
): FormState {
  const next = { ...form, ttOk: value };
  next.ttNg = String(calculateNgTotal(next, []));
  next.actualOutput = String(calc(next));
  return next;
}
