// A form that saves `machine_lines` replaces the stored machine rows. If the loaded report is incomplete
// (the machine list failed to load, or fewer lines came back than the report declares) the form must not
// be allowed to save, otherwise a load problem would turn into an empty/short machine_lines list.
type ReportLike = { machine_lines?: unknown; machineLines?: unknown; machine_lines_load_failed?: boolean; operation_mode?: unknown; machine_no?: unknown } | null | undefined;

export function detectIncompleteMachineData(report: ReportLike): string | null {
  if (!report) return null;
  if (report.machine_lines_load_failed) return "Không tải được danh sách máy của báo cáo. Vui lòng tải lại trang trước khi sửa.";
  const lines = Array.isArray(report.machine_lines) ? report.machine_lines : Array.isArray(report.machineLines) ? report.machineLines : [];
  const declared = String(report.machine_no ?? "").split(",").map((v) => v.trim()).filter(Boolean).length;
  if (String(report.operation_mode ?? "").toUpperCase() === "MACHINE" && declared > 1 && lines.length < declared) {
    return `Dữ liệu máy tải về không đầy đủ (${lines.length}/${declared} máy). Vui lòng tải lại trang trước khi sửa.`;
  }
  return null;
}
