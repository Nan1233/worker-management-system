import { rejectSelectedTempReports } from "../../services/productionService";
import type { ProductionReport } from "../../types/production";

/**
 * Rejection use case: deliberately sequential and best-effort per report.
 * The page owns confirmation, filter-scope checks and selection state.
 * Do not convert this to one bulk API request: historical partial failures
 * and their user-visible messages must remain intact.
 */
export async function rejectPendingReportBatch(targets: ProductionReport[], reason: string) {
    const failedIds: number[] = [];
    const failures: string[] = [];
    let succeeded = 0;
    for (const report of targets) {
        try {
            await rejectSelectedTempReports([Number(report.id)], reason);
            succeeded += 1;
        } catch (e: any) {
            failedIds.push(Number(report.id));
            failures.push(`#${report.id}: ${e?.response?.data?.message || e?.message || "Không thể từ chối"}`);
        }
    }
    return { failedIds, failures, succeeded };
}
