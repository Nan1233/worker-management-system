import type { FormState } from "./processPageConfig";

type NgOption = { key: string; code?: string | null };

export function isValidIntegerInput(value: string): boolean {
  return /^\d*$/.test(String(value ?? ""));
}

/**
 * TT NG = tổng số lượng của các lỗi NG đã nhập.
 * Checkbox NG chưa có số lượng => 0.
 * TT NG tuyệt đối không lấy TT OK/actualOutput làm fallback.
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
  next.ttNg = String(calculateNgTotal(next, options));
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
  next.ttNg = String(calculateNgTotal(next, options));
  next.actualOutput = String(calc(next));
  return next;
}

export function applyTtOkToForm(form: FormState, value: string, calc: (f: FormState) => number, options: NgOption[] = []): FormState { const next = { ...form, ttOk: value }; next.ttNg = options.length > 0 ? String(calculateNgTotal(next, options)) : String(form.ttNg || '0'); next.actualOutput = String(calc(next)); return next; }
