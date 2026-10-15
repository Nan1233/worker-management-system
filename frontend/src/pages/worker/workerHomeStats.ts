import type { ProductionReport } from "../../types/production";

export interface WorkerHomeTodayStats {
  ok: number;
  ng: number;
  time: number;
  reportCount: number;
}

/** Aggregate every report for today; presentation limits belong to the report list, not these totals. */
export function calculateWorkerHomeTodayStats(
  todayReports: ProductionReport[],
  getReportActualHours: (report: ProductionReport) => number,
): WorkerHomeTodayStats {
  const ok = todayReports.reduce((sum, report) => sum + Number(report.tt_ok ?? 0), 0);
  const ng = todayReports.reduce(
    (sum, report) => sum + (report.defects || []).reduce(
      (defectSum, defect) => defectSum + Number(defect.quantity ?? 0),
      0,
    ),
    0,
  );
  const time = todayReports.reduce((sum, report) => sum + getReportActualHours(report), 0);
  return { ok, ng, time, reportCount: todayReports.length };
}
