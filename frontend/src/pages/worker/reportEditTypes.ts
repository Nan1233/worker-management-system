import type { ProductionDeduction, ProductionDefect, ProductionReport } from "../../types/production";

/** Legacy detail rows may contain aliases not present on current master-data rows. */
export type ReportEditDefect = Partial<ProductionDefect> & {
    defect_label?: string;
};

export type ReportEditDeduction = Partial<ProductionDeduction> & {
    deduction_label?: string;
    code?: string;
    name?: string;
    label?: string;
    minutes?: number | string;
    deduction_minutes?: number | string;
    deduction_hours?: number | string;
    duration_hours?: number | string;
};

export type ReportEditMachineLine = Partial<Omit<NonNullable<ProductionReport["machine_lines"]>[number], "deductions" | "defects">> & {
    grinding_machine_no?: string;
    deductions_json?: string | ReportEditDeduction[] | null;
    deductions?: ReportEditDeduction[];
    defects?: ReportEditDefect[];
};

/** The edit API carries saved legacy aliases in addition to the write contract. */
export type ReportEditRecord = Omit<ProductionReport, "machine_lines" | "defects" | "deductions"> & {
    machine_lines?: ReportEditMachineLine[];
    machineLines?: ReportEditMachineLine[];
    defects?: ReportEditDefect[];
    defect_items?: ReportEditDefect[];
    worker_defects?: ReportEditDefect[];
    deductions?: ReportEditDeduction[];
    deduction_items?: ReportEditDeduction[];
    operation?: string;
    machine_lines_load_failed?: boolean;
    training_percent_snapshot?: number | string | null;
    adjustment_count?: number | string | null;
    execution_method?: string;
    __edit_machine_lines?: ReportEditMachineLine[];
};

/** Parse stored deduction JSON without letting malformed legacy rows reach the edit form. */
export function parseReportEditDeductions(value: unknown): ReportEditDeduction[] {
    let decoded: unknown = value;
    if (typeof value === "string") {
        try { decoded = JSON.parse(value); } catch { return []; }
    }
    if (!Array.isArray(decoded)) return [];
    // Reject a partially corrupted list as a whole. Silently dropping an
    // invalid historical deduction could make an edit erase persisted detail.
    const valid = decoded.every((row) => {
        if (row === null || typeof row !== "object" || Array.isArray(row)) return false;
        const item = row as Record<string, unknown>;
        for (const key of ["hours", "minutes", "deduction_minutes", "deduction_hours", "duration_hours"]) {
            if (item[key] != null && (String(item[key]).trim() === ""
                || !Number.isFinite(Number(item[key])) || Number(item[key]) < 0)) return false;
        }
        if (item.deduction_type_id != null && (!Number.isSafeInteger(Number(item.deduction_type_id))
            || Number(item.deduction_type_id) <= 0)) return false;
        return true;
    });
    return valid ? decoded as ReportEditDeduction[] : [];
}

/** Preserve legacy fallback priority: a real deductions array wins over
 * malformed or empty deductions_json; otherwise decode JSON text. */
export function getReportEditLineDeductions(line: ReportEditMachineLine | null | undefined): ReportEditDeduction[] {
    if (!line) return [];
    if (Array.isArray(line.deductions_json)) return parseReportEditDeductions(line.deductions_json);
    if (Array.isArray(line.deductions)) return parseReportEditDeductions(line.deductions);
    return parseReportEditDeductions(line.deductions_json);
}

/** Only accept the minimum report identity required to edit safely. */
export function unwrapReportEditResponse(payload: unknown): ReportEditRecord | null {
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
    const envelope = payload as Record<string, unknown>;
    const candidate = envelope.report ?? envelope.data ?? payload;
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    const id = Number(record.id);
    const processId = Number(record.process_id);
    if (!Number.isSafeInteger(id) || id <= 0
        || !Number.isSafeInteger(processId) || processId <= 0
        || typeof record.work_date !== "string"
        || !/^\\d{4}-\\d{2}-\\d{2}/.test(record.work_date)
        || typeof record.shift !== "string" || !record.shift.trim()) return null;
    // Never treat a broken machine-lines payload as an empty report; the
    // editor would replace all persisted machines on save.
    for (const key of ["machine_lines", "machineLines"] as const) {
        const value = record[key];
        if (value != null && !Array.isArray(value)) return null;
        if (Array.isArray(value) && value.some((line) =>
            line === null || typeof line !== "object" || Array.isArray(line))) return null;
    }
    return { ...record, id, process_id: processId } as ReportEditRecord;
}
