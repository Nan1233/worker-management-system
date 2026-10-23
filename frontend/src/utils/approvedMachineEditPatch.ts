// Báo cáo ĐÃ DUYỆT nhiều máy: backend (approvedReportEditService) chỉ cho phép sửa các
// trường không phải số liệu tổng hợp. Các cột tổng hợp (sản lượng, lỗi, thời gian, máy, sản phẩm)
// được dẫn xuất từ production_report_machine_lines nên gửi chúng lên sẽ bị 422 MACHINE_AGGREGATE_READ_ONLY.
// Form sửa vì vậy chỉ gửi đúng những trường được phép và không đụng tới dữ liệu máy đã lưu.
export const isApprovedMachineReport = (source: string, operationMode: string) =>
  source === "approved" && String(operationMode || "").toUpperCase() === "MACHINE";

export const buildApprovedMachineNotePatch = (args: { note: string; reason: string; updatedAt?: string | null }) => ({
  note: String(args.note ?? ""),
  reason: String(args.reason ?? "").trim(),
  expected_updated_at: args.updatedAt || undefined,
});
