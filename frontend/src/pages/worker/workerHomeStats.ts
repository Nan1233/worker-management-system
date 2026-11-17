import type { ProductionReport } from "../../types/production";

export interface WorkerHomeTodayStats {
  ok: number;
  ng: number;
  time: number;
  reportCount: number;
}

/** Use persisted report totals; machine-line reports may have no parent defect rows. */
export function getWorkerReportNg(report: ProductionReport): number {
  const nonnegative = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  const total = Number(report.tt_ng);
  const lines = Array.isArray((report as any).machine_lines)
    ? (report as any).machine_lines
    : Array.isArray((report as any).machineLines) ? (report as any).machineLines : [];
  const machineNg = lines.reduce((sum: number, line: any) =>
    sum + nonnegative(line.ng_quantity ?? line.ngQuantity ?? line.tt_ng), 0);
  // A zero parent total is common for machine reports; prefer positive line totals.
  if (Number.isFinite(total) && total > 0) return total;
  if (machineNg > 0) return machineNg;
  const defects = Array.isArray(report.defects) ? report.defects : [];
  const defectNg = defects.reduce((sum, item) => sum + nonnegative(item.quantity), 0);
  if (defectNg > 0) return defectNg;
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

/** Aggregate every report for today; presentation limits belong to the report list, not these totals. */
export function calculateWorkerHomeTodayStats(
  todayReports: ProductionReport[],
  getReportActualHours: (report: ProductionReport) => number,
): WorkerHomeTodayStats {
  const ok = todayReports.reduce((sum, report) => sum + Number(report.tt_ok ?? 0), 0);
  const ng = todayReports.reduce((sum, report) => sum + getWorkerReportNg(report), 0);
  const time = todayReports.reduce((sum, report) => sum + getReportActualHours(report), 0);
  return { ok, ng, time, reportCount: todayReports.length };
}
