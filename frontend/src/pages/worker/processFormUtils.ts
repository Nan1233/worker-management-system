import type { DeductionState, FormState } from './processPageConfig';

export const MAX_TOTAL_WORK_MINUTES = 12 * 60;

export function getDeductionMinutes(data: DeductionState): number {
    return Object.values(data).reduce(
        (sum, currentValue) => sum + (Number(currentValue) || 0),
        0,
    );
}

/** Parse a time value into whole minutes. This is the canonical unit for worker time calculations. */
export function parseTimeToMinutes(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? Math.max(0, Math.round(value * 60)) : 0;
    }

    const normalized = String(value ?? '').trim().toLowerCase().replace(',', '.');
    if (!normalized) return 0;

    const hourMinuteMatch = normalized.match(/^(\d{1,3})\s*(?:h|g|giờ)\s*(?:(\d{1,2})\s*(?:m|p|phút)?|:(\d{1,2}))$/);
    if (hourMinuteMatch) {
        const hours = Number(hourMinuteMatch[1]);
        const minutes = Number(hourMinuteMatch[2] ?? hourMinuteMatch[3]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return 0;
        return Math.max(0, hours * 60 + minutes);
    }

    const colonMatch = normalized.match(/^(\d{1,3})\s*:\s*(\d{1,2})$/);
    if (colonMatch) {
        const hours = Number(colonMatch[1]);
        const minutes = Number(colonMatch[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return 0;
        return Math.max(0, hours * 60 + minutes);
    }

    const hourOnlyMatch = normalized.match(/^(\d{1,3})\s*(?:h|g|giờ)$/);
    if (hourOnlyMatch) return Math.max(0, Number(hourOnlyMatch[1]) * 60);

    const minuteOnlyMatch = normalized.match(/^(\d{1,4})\s*(?:m|p|phút)$/);
    if (minuteOnlyMatch) return Math.max(0, Number(minuteOnlyMatch[1]));

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 0;

    // Existing form values such as actualTime/totalTime are decimal hours.
    return Math.max(0, Math.round(parsed * 60));
}

/** Compatibility wrapper for older code paths that expect decimal hours. */
export function parseFlexibleTime(value: string | number | null | undefined): number {
    return parseTimeToMinutes(value) / 60;
}

export function formatDurationMinutes(totalMinutes: number): string {
    const safeMinutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    if (hours === 0) return `${minutes} phút`;
    if (minutes === 0) return `${hours} giờ`;
    return `${hours} giờ ${minutes} phút`;
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
