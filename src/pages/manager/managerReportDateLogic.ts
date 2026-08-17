export type DateFilterMode = "today" | "month" | "range";

export const getToday = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

export function getDateRangeForMode(
  mode: DateFilterMode,
  selectedMonth = "",
  dateFrom = "",
  dateTo = "",
): { dateFrom: string; dateTo: string } {
  const today = getToday();
  if (mode === "today") return { dateFrom: today, dateTo: today };
  if (mode === "month") {
    const month = /^\d{4}-\d{2}$/.test(selectedMonth) ? selectedMonth : today.slice(0,7);
    const [y,m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { dateFrom: `${month}-01`, dateTo: `${month}-${String(last).padStart(2,"0")}` };
  }
  return { dateFrom: dateFrom || today, dateTo: dateTo || dateFrom || today };
}
