import type { FormState } from "./processPageConfig";

type NgOption = { key: string; code?: string | null };

export function isValidIntegerInput(value: string): boolean {
    return /^\d*$/.test(String(value ?? ""));
}

export function calculateNgTotal(form: FormState, options: NgOption[]): number {
    return (options || []).reduce((sum, option) => sum + (Number(form[option.key]) || 0), 0);
}

/**
 * Canonical worker quality-total synchronizer.
 * TT NG is always derived from the configured NG defect fields, while
 * actualOutput is delegated to the canonical calculator so KQD policy can
 * exclude configured KQD codes when required.
 */
export function syncQualityTotals(
    form: FormState,
    options: NgOption[],
    calculateActualOutput: (values: FormState) => number
): FormState {
    const ttNg = calculateNgTotal(form, options);
    const next = { ...form, ttNg: String(ttNg) };
    next.actualOutput = String(calculateActualOutput(next));
    return next;
}

export function applyNgToggleToForm(
    form: FormState,
    key: string,
    checked: boolean,
    options: NgOption[],
    calculateActualOutput: (values: FormState) => number
): FormState {
    const next = { ...form, [key]: checked ? (form[key] || "0") : "" };
    return syncQualityTotals(next, options, calculateActualOutput);
}

export function applyNgValueToForm(
    form: FormState,
    key: string,
    value: string,
    options: NgOption[],
    calculateActualOutput: (values: FormState) => number
): FormState {
    const next = { ...form, [key]: value };
    return syncQualityTotals(next, options, calculateActualOutput);
}

export function applyTtOkToForm(
    form: FormState,
    value: string,
    calculateActualOutput: (values: FormState) => number
): FormState {
    const next = { ...form, ttOk: value };
    next.actualOutput = String(calculateActualOutput(next));
    return next;
}
