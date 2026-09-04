import type { DeductionState, FormState } from './processPageConfig';

export const MAX_TOTAL_WORK_MINUTES = 12 * 60;

export function getDeductionMinutes(data: DeductionState): number {
    return Object.values(data).reduce(
        (sum, currentValue) => sum + (Number(currentValue) || 0),
        0,
    );
}

export function parseFlexibleTime(value: string): number {
    const normalized = String(value ?? '').trim().toLowerCase().replace(',', '.');

    if (!normalized) return 0;

    // Supports both internal forms ("10h 10", "10g 10", "10:10")
    // and the Vietnamese display value used by the submit confirmation
    // ("10 giờ 10 phút").
    const hourMinuteMatch = normalized.match(/^(\d{1,3})\s*(?:h|g|giờ)\s*(?:(\d{1,2})\s*(?:m|p|phút)?|:(\d{1,2}))$/);
    if (hourMinuteMatch) {
        const hours = Number(hourMinuteMatch[1]);
        const minutes = Number(hourMinuteMatch[2] ?? hourMinuteMatch[3]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return Number.NaN;
        return hours + minutes / 60;
    }

    const colonMatch = normalized.match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
    if (colonMatch) {
        const hours = Number(colonMatch[1]);
        const minutes = Number(colonMatch[2]);
        if (minutes > 59) return Number.NaN;
        return hours + minutes / 60;
    }

    const hourOnlyMatch = normalized.match(/^(\d{1,3})\s*(?:h|g|giờ)$/);
    if (hourOnlyMatch) return Number(hourOnlyMatch[1]);

    const minuteOnlyMatch = normalized.match(/^(\d{1,4})\s*(?:m|p|phút)$/);
    if (minuteOnlyMatch) return Number(minuteOnlyMatch[1]) / 60;

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
