import type { DeductionState, FormState } from './processPageConfig';

export const MAX_TOTAL_WORK_MINUTES = 12 * 60;

export function getDeductionMinutes(data: DeductionState): number {
    return Object.values(data).reduce(
        (sum, currentValue) => sum + (Number(currentValue) || 0),
        0,
    );
}

export function parseFlexibleTime(value: string): number {
    const normalized = value.trim().toLowerCase().replace(',', '.');

    if (!normalized) return 0;

    const hourMinuteMatch = normalized.match(/^(\d{1,3})\s*(?:h|:|g)\s*(\d{1,2})$/);
    if (hourMinuteMatch) {
        const hours = Number(hourMinuteMatch[1]);
        const minutes = Number(hourMinuteMatch[2]);
        if (minutes > 59) return Number.NaN;
        return hours + minutes / 60;
    }

    const hourOnlyMatch = normalized.match(/^(\d{1,3})\s*(?:h|g)$/);
    if (hourOnlyMatch) return Number(hourOnlyMatch[1]);

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function formatIntegerDisplay(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits ? Number(digits).toLocaleString('vi-VN') : '';
}

export function parseIntegerDisplay(value: string): string {
    return value.replace(/\D/g, '');
}

export function calculateCountedNg(
    values: FormState,
    activeNgOptions: Array<{ key: string; code?: string | null }>,
    excludeKqd: boolean,
    kqdCodes: ReadonlySet<string>,
): number {
    return activeNgOptions.reduce((sum, item) => {
        const code = String(item.code || '').trim().toUpperCase();
        if (excludeKqd && kqdCodes.has(code)) {
            return sum;
        }
        return sum + Number(values[item.key] || 0);
    }, 0);
}

export function calculateActualOutput(
    values: FormState,
    activeNgOptions: Array<{ key: string; code?: string | null }>,
    excludeKqd: boolean,
    kqdCodes: ReadonlySet<string>,
): number {
    return Number(values.ttOk || 0) + calculateCountedNg(
        values,
        activeNgOptions,
        excludeKqd,
        kqdCodes,
    );
}
