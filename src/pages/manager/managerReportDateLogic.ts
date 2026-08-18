import api from "../../services/api";

export type DateFilterMode = "today" | "yesterday" | "week" | "currentMonth" | "all" | "month" | "range";

// The heavy server-side consolidated Excel endpoint is intentionally disabled on
// the Render deployment. Manager Excel updates are handled by the Desktop IPC
// flow (company-data -> local workbook build). Guard the legacy POST at the
// Manager feature boundary so a stale/legacy caller can never create a request
// storm against /reports/export-excel.
api.interceptors.request.use((config) => {
  const method = String(config.method || "get").toLowerCase();
  const url = String(config.url || "");
  const isLegacyConsolidatedExport =
    method === "post" && /(?:^|\/)reports\/export-excel\/?$/.test(url);

  if (isLegacyConsolidatedExport) {
    throw new Error(
      "Xuất Excel tổng hợp trên Web đã được tắt để bảo vệ Render. " +
      "Hãy dùng KTC Desktop: Cập nhật Excel từ DB."
    );
  }

  return config;
});

export const getToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

export function getDateRangeForMode(
  mode: DateFilterMode,
  selectedMonth = "",
  dateFrom = "",
  dateTo = "",
): { dateFrom: string; dateTo: string } {
  const today = new Date();

  if (mode === "today") {
    const value = getToday();
    return { dateFrom: value, dateTo: value };
  }

  if (mode === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    const value = formatDate(d);
    return { dateFrom: value, dateTo: value };
  }

  if (mode === "week") {
    const start = new Date(today);
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { dateFrom: formatDate(start), dateTo: formatDate(end) };
  }

  if (mode === "currentMonth") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { dateFrom: formatDate(start), dateTo: formatDate(end) };
  }

  if (mode === "month") {
    const month = /^\d{4}-\d{2}$/.test(selectedMonth)
      ? selectedMonth
      : getToday().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      dateFrom: `${month}-01`,
      dateTo: `${month}-${String(last).padStart(2, "0")}`,
    };
  }

  if (mode === "range") {
    return {
      dateFrom: dateFrom || getToday(),
      dateTo: dateTo || dateFrom || getToday(),
    };
  }

  return { dateFrom: "", dateTo: "" };
}
