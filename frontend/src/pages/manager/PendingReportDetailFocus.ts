import api from "../../services/api";

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

function textByLabel(detail: HTMLElement, label: string): string {
  const fields = Array.from(detail.querySelectorAll(".pending-detail-field"));
  const field = fields.find((item) => item.querySelector("span")?.textContent?.trim() === label);
  return field?.querySelector("strong")?.textContent?.trim() || "";
}

function getDetailIdentity(detail: HTMLElement): { date: string; workerCode: string; process: string; machine: string; product: string } {
  const row = document.querySelector(".pending-reference-table tbody tr.pending-row-active");
  const cells = row ? Array.from(row.querySelectorAll("td")) : [];
  const workerCell = cells[3]?.textContent?.trim() || "";
  const workerMatch = workerCell.match(/\(([^)]+)\)\s*$/);
  const dateText = textByLabel(detail, "Ngày báo cáo");
  const [day, month, year] = dateText.split("/");
  const date = day && month && year ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` : "";
  return {
    date,
    workerCode: workerMatch?.[1]?.trim() || "",
    process: textByLabel(detail, "Công đoạn"),
    machine: textByLabel(detail, "Máy móc"),
    product: textByLabel(detail, "Sản phẩm")
  };
}

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

  const identity = getDetailIdentity(detail);
  if (!identity.date || !identity.workerCode) {
    achievementCard.querySelector("strong")!.textContent = "---";
    return;
  }

  try {
    const response = await api.get("/production-temp/pending", {
      params: {
        date_from: identity.date,
        date_to: identity.date,
        search: identity.workerCode,
        page: 1,
        page_size: 100,
        include_meta: 1
      }
    });
    const reports = Array.isArray(response.data?.data) ? response.data.data : [];
    const match = reports.find((item: any) =>
      String(item.worker_code || "") === identity.workerCode &&
      String(item.process_name || "") === identity.process &&
      String(item.machine_no || "") === identity.machine &&
      String(item.product_name || "") === identity.product
    ) || reports.find((item: any) => String(item.worker_code || "") === identity.workerCode);

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
  } catch {
    achievementCard.querySelector("strong")!.textContent = "---";
  }
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
