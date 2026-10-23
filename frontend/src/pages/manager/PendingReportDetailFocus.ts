const DETAIL_SELECTOR = ".pending-reference-page .pending-detail-card";
const BODY_SELECTOR = ".pending-detail-body";
const CODE_SELECTOR = ".pending-detail-code";
const RESULT_GRID_SELECTOR = ".pending-result-grid";
const METRICS_MARKER = "data-ktc-detail-metrics";

function focusDetail(detail: HTMLElement): void {
  const body = detail.querySelector(BODY_SELECTOR) as HTMLElement | null;
  if (body) body.scrollTop = 0;

  // Keep the opened report itself at the top of the viewport so the manager
  // never lands at the bottom of a long detail card when opening a lower row.
  window.requestAnimationFrame(() => {
    const current = document.querySelector(DETAIL_SELECTOR) as HTMLElement | null;
    if (!current) return;
    current.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    const currentBody = current.querySelector(BODY_SELECTOR) as HTMLElement | null;
    if (currentBody) currentBody.scrollTop = 0;
  });
}

function parseNumber(value: string | null | undefined): number {
  const raw = String(value || "").replace(/\s/g, "").replace(/%/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") && raw.includes(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

let pendingPageReports: any[] = [];
window.addEventListener("ktc:manager-pending-page-data", (event: Event) => {
  const payload = (event as CustomEvent<{ reports?: unknown[] }>).detail;
  pendingPageReports = Array.isArray(payload?.reports) ? payload.reports as any[] : [];
});
function metricCard(className: string, label: string, value = "---"): HTMLDivElement {
  const item = document.createElement("div");
  item.className = `pending-result-item ${className}`;
  item.setAttribute(METRICS_MARKER, "1");
  const span = document.createElement("span");
  span.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = value;
  item.append(span, strong);
  return item;
}

async function addDetailMetrics(detail: HTMLElement): Promise<void> {
  const grid = detail.querySelector(RESULT_GRID_SELECTOR) as HTMLElement | null;
  if (!grid || grid.querySelector(`[${METRICS_MARKER}]`)) return;

  const achievementCard = metricCard("achievement", "% định mức", "Đang tính...");
  const ngRateCard = metricCard("ng-rate", "% NG", "0%");
  grid.append(achievementCard, ngRateCard);

  const totalText = grid.querySelector(".pending-result-item.total strong")?.textContent || "0";
  const ngText = grid.querySelector(".pending-result-item.ng strong")?.textContent || "0";
  const totalOutput = parseNumber(totalText);
  const ngOutput = parseNumber(ngText);
  ngRateCard.querySelector("strong")!.textContent = `${(totalOutput > 0 ? ngOutput / totalOutput * 100 : 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;

  const reportCode = detail.querySelector(CODE_SELECTOR)?.textContent?.trim() || "";
  const reportId = Number(reportCode.replace(/^#/, ""));
  const match = pendingPageReports.find((item) => Number(item?.id) === reportId);
  if (!match) {
    achievementCard.querySelector("strong")!.textContent = "---";
    return;
  }
  const standardRate = Number(match.standard_output || 0);
  const actualTime = Number(match.actual_time || 0);
  const trainingPercent = Math.min(100, Math.max(0, Number(match.training_percent ?? match.training_percent_snapshot ?? 100)));
  const standard = standardRate * actualTime;
  const achievement = standard > 0 ? (totalOutput / standard) * (trainingPercent / 100) * 100 : 0;
  achievementCard.querySelector("strong")!.textContent = `${achievement.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}

if (document.body) {
  let lastReportCode = "";
  const observer = new MutationObserver(() => {
    const detail = document.querySelector(DETAIL_SELECTOR) as HTMLElement | null;
    if (!detail) {
      lastReportCode = "";
      return;
    }

    const code = detail.querySelector(CODE_SELECTOR)?.textContent?.trim() || "";
    if (code && code !== lastReportCode) {
      lastReportCode = code;
      focusDetail(detail);
      void addDetailMetrics(detail);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.setTimeout(() => {
    const detail = document.querySelector(DETAIL_SELECTOR) as HTMLElement | null;
    if (detail) {
      focusDetail(detail);
      void addDetailMetrics(detail);
    }
  }, 100);
}
