import type { ProductionReport } from "../../types/production";

const norm = (v: unknown) => String(v ?? "").trim().toUpperCase();

export function getManagerReportDuplicateKey(report: Pick<ProductionReport,
  "worker_code"|"work_date"|"shift"|"machine_no"|"product_name">): string {
  return [report.worker_code, report.work_date, report.shift, report.machine_no, report.product_name].map(norm).join("|");
}
