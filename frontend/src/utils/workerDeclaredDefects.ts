// Defects declared by the worker at report level. API detail responses expose `defects` as a display merge that
// can fall back to machine-line defects; for reports that have machine lines, `worker_defects` (parent-table rows
// only) is the authoritative list, so machine defects are never shown or re-saved as worker-declared defects.
type ReportLike = { defects?: unknown; defect_items?: unknown; worker_defects?: unknown; machine_lines?: unknown; machineLines?: unknown } | null | undefined;

export function getWorkerDeclaredDefects<T = Record<string, unknown>>(report: ReportLike): T[] {
  if (!report) return [];
  const lines = Array.isArray(report.machine_lines) ? report.machine_lines : Array.isArray(report.machineLines) ? report.machineLines : [];
  if (lines.length > 0 && Array.isArray(report.worker_defects)) return report.worker_defects as T[];
  if (Array.isArray(report.defects)) return report.defects as T[];
  if (Array.isArray(report.defect_items)) return report.defect_items as T[];
  return [];
}
