import type { ProductionReport } from "../../types/production";

// The manager table must display the immutable training snapshot first.
export function pendingTrainingPercent(report: ProductionReport): unknown {
    const values = report as ProductionReport & Record<string, unknown>;
    return values.training_percent_snapshot ?? values.training_percent ?? values.hv_percent
        ?? values.learning_percent ?? values.hoc_viec_percent ?? 0;
}

// Preserve the manager report-code display, including duplicate disambiguation.
export function pendingReportCode(report: ProductionReport, index = 0, duplicate = false) {
    const data = report as ProductionReport & Record<string, unknown>;
    const explicit = data.report_code || data.reportCode || data.code;
    if (explicit) return String(explicit);
    const fallback = `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || String(report.id || index + 1).padStart(4, "0")}`;
    return duplicate ? `${fallback}-${report.id ?? index + 1}` : fallback;
}

