import { approveTempReport } from "../../services/productionService";
import { describeApprovalError } from "../../utils/approvalError";
import type { ProductionReport } from "../../types/production";

/**
 * Application-level bulk approval workflow.
 * Keep the existing two-request concurrency, per-report failure collection,
 * and sequential progress reporting. Selection and refresh remain UI-owned.
 */
export async function approvePendingReportBatch(
    targets: ProductionReport[],
    onProgress: (progress: { completed: number; total: number }) => void,
) {
    const failedIds: number[] = [];
    const failures: string[] = [];
    let succeeded = 0;
    let nextIndex = 0;
    let completed = 0;
    onProgress({ completed: 0, total: targets.length });
    const approveWorker = async () => {
        while (nextIndex < targets.length) {
            const report = targets[nextIndex++];
            const id = Number(report.id);
            try {
                await approveTempReport(id);
                succeeded += 1;
            } catch (e: any) {
                failedIds.push(id);
                const code = `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || id}`;
                failures.push(`${code} (#${id}): ${describeApprovalError(e, "Không thể duyệt")}`);
            } finally {
                completed += 1;
                onProgress({ completed, total: targets.length });
            }
        }
    };
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, () => approveWorker()));
    return { failedIds, failures, succeeded };
}
