import type { ProductionReport } from "../../types/production";

export function getValidReportIds(reports: ProductionReport[]): number[] {
  return reports.map(r => Number(r.id)).filter(id => Number.isInteger(id) && id > 0);
}

export function reconcileSelectedReportIds(previous: number[], reports: ProductionReport[]): number[] {
  const valid = new Set(getValidReportIds(reports));
  return previous.filter(id => valid.has(id));
}

export function toggleReportId(previous: number[], id: number): number[] {
  const n = Number(id);
  return previous.includes(n) ? previous.filter(x => x !== n) : [...previous, n];
}

export function toggleCurrentPageIds(previous: number[], pageIds: number[], allSelected: boolean): number[] {
  const page = [...new Set(pageIds.map(Number).filter(Number.isInteger))];
  if (allSelected) {
    const remove = new Set(page);
    return previous.filter(id => !remove.has(id));
  }
  return [...new Set([...previous, ...page])];
}

// Reports.tsx already exposes a functional "Trong tuần" KPI. Keep the quick-period
// controls compact without duplicating date-range logic in the JSX.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const installWeekQuickFilter = () => {
    const title = document.querySelector(".pending-page-title h1");
    const quickFilters = document.querySelector(".pending-quick-filters");
    if (!(title instanceof HTMLElement) || title.textContent?.trim() !== "Chờ duyệt báo cáo" || !(quickFilters instanceof HTMLElement)) return;
    if (quickFilters.querySelector("[data-pending-week-filter]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pendingWeekFilter = "true";
    button.textContent = "Tuần này";
    button.addEventListener("click", () => {
      const weekKpi = Array.from(document.querySelectorAll(".pending-kpi"))
        .find(node => node.querySelector("span")?.textContent?.trim() === "Trong tuần");
      if (weekKpi instanceof HTMLElement) weekKpi.click();
    });
    const firstPeriodButton = quickFilters.querySelector("button");
    if (firstPeriodButton) quickFilters.insertBefore(button, firstPeriodButton.nextElementSibling);
    else quickFilters.appendChild(button);
  };

  const observer = new MutationObserver(installWeekQuickFilter);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  installWeekQuickFilter();
}
