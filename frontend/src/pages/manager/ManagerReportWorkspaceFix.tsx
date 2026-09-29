import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getPendingReports } from "../../services/productionService";
import Reports from "./Reports";
import ApprovedReportsDesktopActions from "./ApprovedReportsDesktopActions";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = (v: unknown) => num(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (v: unknown) => `${fmt(v)}%`;
const dateText = (v: unknown) => { const s = String(v || "").slice(0, 10); const [y, m, d] = s.split("-"); return y && m && d ? `${d}/${m}/${y}` : s || "—"; };
const dateValue = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "day" | "week" | "month" | "year") => {
  const start = new Date(`${value}T00:00:00`); const end = new Date(start);
  if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
  else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
  return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};
const reportCode = (r: any, index = 0) => `PR${String(r.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r.worker_code || String(r.id || index + 1).padStart(4, "0")}`;
const kpi = (r: any) => {
  const ok = num(r.tt_ok); const ng = num(r.tt_ng); const actual = num(r.actual_output) || ok + ng;
  const standard = num(r.standard_output) || num(r.target_output); const actualTime = num(r.actual_time);
  const ttDinhMuc = num(r.tt_dinh_muc) || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
  const nangSuat = num(r.nang_suat_percent) || (ttDinhMuc > 0 ? actual / ttDinhMuc * 100 : 0);
  const dat = actual > 0 ? ok / actual * 100 : 0; const pp = num(r.pp_percent) || (actual > 0 ? ng / actual * 100 : 0);
  const hv = r.training_percent ?? r.hv_percent ?? r.learning_percent ?? r.hoc_viec_percent ?? 0;
  const ngTypeCount = Math.max(num(r.ng_defect_type_count), num(r.worker_ng_type_count), num(r.machine_ng_type_count));
  return { ok, ng, actual, nangSuat, dat, pp, hv, ngTypeCount };
};

function installReportWorkspaceFix(navigate: (to: string) => void) {
  const STYLE_ID = "ktc-manager-report-workspace-fix";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width: 801px) {
        body.ktc-report-workspace-fix .management-sidebar { position: fixed !important; inset: 72px 0 auto 0 !important; width: 100% !important; height: 58px !important; min-height: 58px !important; padding: 0 18px !important; flex-direction: row !important; align-items: center !important; gap: 14px !important; border-right: 0 !important; border-bottom: 1px solid #dce8f5 !important; box-shadow: 0 3px 12px rgba(24,58,106,.05) !important; }
        body.ktc-report-workspace-fix .management-brand { width: 120px !important; flex: 0 0 120px !important; height: 48px !important; padding: 2px 4px !important; }
        body.ktc-report-workspace-fix .management-brand-logo { width: 112px !important; max-height: 42px !important; }
        body.ktc-report-workspace-fix .management-menu { display: flex !important; flex: 1 1 auto !important; min-width: 0 !important; margin-top: 0 !important; overflow-x: auto !important; overflow-y: hidden !important; gap: 4px !important; padding: 0 !important; }
        body.ktc-report-workspace-fix .management-menu button { width: auto !important; min-width: max-content !important; min-height: 42px !important; height: 42px !important; padding: 0 13px !important; gap: 7px !important; white-space: nowrap !important; }
        body.ktc-report-workspace-fix .management-sidebar-footer { display: none !important; }
        body.ktc-report-workspace-fix .management-main { margin-left: 0 !important; }
        body.ktc-report-workspace-fix .management-content { padding-top: 84px !important; }
        body.ktc-report-workspace-fix .pending-reference-page { max-width: none !important; }
        body.ktc-report-workspace-fix .pending-workspace { grid-template-columns: minmax(0, 1fr) minmax(520px, 43%) !important; align-items: start !important; }
        body.ktc-report-workspace-fix .pending-list-card { min-width: 0 !important; }
        body.ktc-report-workspace-fix .pending-table-wrap { width: 100% !important; }
        body.ktc-report-workspace-fix .pending-reference-table { min-width: 1500px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(2), body.ktc-report-workspace-fix .pending-list-card .pending-reference-table td:nth-child(2) { display: none !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th, body.ktc-report-workspace-fix .pending-list-card .pending-reference-table td { height: 42px !important; padding: 0 9px !important; font-size: 11px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(3) { width: 145px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(4) { width: 175px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(5) { width: 110px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(6) { width: 55px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(7) { width: 115px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(8) { width: 110px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(9), body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(10), body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(11), body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(12), body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(13), body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th:nth-child(14) { width: 105px !important; text-align: center !important; }
        body.ktc-report-workspace-fix .pending-full-metric { text-align:center !important; font-weight:600 !important; }
        body.ktc-report-workspace-fix .pending-full-productivity { background:#ffd6e7 !important; color:#9b123f !important; border:1px solid #ff9fbe !important; }
        body.ktc-report-workspace-fix .pending-full-pp { background:#fff0b8 !important; color:#795600 !important; border:1px solid #e3ad20 !important; }
      }
    `;
    document.head.appendChild(style);
  }
  document.body.classList.add("ktc-report-workspace-fix");

  let observer: MutationObserver | null = null;
  let timer: number | undefined;
  let lastSignature = "";
  let cachedReports: any[] = [];
  let cachedAt = 0;

  const getFilters = () => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".pending-filter-card input"));
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".pending-filter-card select"));
    const date = inputs.find(x => x.type === "date")?.value || dateValue(new Date());
    const search = inputs.find(x => x.type !== "date")?.value?.trim() || "";
    const processName = selects[0]?.value || "";
    const shift = selects[1]?.value || "";
    const active = document.querySelector<HTMLButtonElement>(".pending-quick-filters button.active")?.textContent?.trim() || "Hôm nay";
    const type = active === "Tuần này" ? "week" : active === "Tháng này" ? "month" : active === "Năm này" ? "year" : "day";
    const range = rangeFor(date, type as any);
    const page = Number(document.querySelector<HTMLButtonElement>(".pending-pagination button.active")?.textContent || "1") || 1;
    return { date, search, processName, shift, ...range, page, pageSize: 8 };
  };

  const styleMetric = (cell: HTMLTableCellElement, type: string, value: number, ngTypeCount = 0) => {
    cell.classList.add("pending-full-metric");
    if (type === "productivity" && (value <= 75 || value > 100)) cell.classList.add("pending-full-productivity");
    if (type === "pp" && (value === 0 || ngTypeCount === 1)) cell.classList.add("pending-full-pp");
  };

  const syncFullColumns = async () => {
    const table = document.querySelector<HTMLTableElement>(".pending-reference-table");
    if (!table || !window.location.pathname.includes("/manager/reports")) return;
    const bodyRows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr"));
    if (!bodyRows.length || bodyRows[0].querySelector(".management-empty,.management-error")) return;
    const filters = getFilters();
    const signature = JSON.stringify(filters);
    if (signature !== lastSignature || Date.now() - cachedAt > 1500) {
      try {
        const result = await getPendingReports({ ...filters, processName: filters.processName || undefined, shift: filters.shift || undefined, search: filters.search || undefined });
        cachedReports = result.data || [];
        lastSignature = signature;
        cachedAt = Date.now();
      } catch { return; }
    }
    const byCode = new Map(cachedReports.map((r: any, i: number) => [reportCode(r, i), r]));
    const header = table.tHead?.rows[0];
    if (header && !header.dataset.fullPending) {
      const ths = header.cells;
      if (ths[6]) ths[6].textContent = "Ngày báo cáo";
      if (ths[7]) ths[7].textContent = "Trạng thái";
      const timeTh = document.createElement("th"); timeTh.textContent = "Thời gian"; ths[7].before(timeTh);
      ["% HV", "TT OK", "NG", "% năng suất", "% đạt", "% PP"].forEach(label => { const th = document.createElement("th"); th.textContent = label; th.className = "pending-full-metric"; ths[ths.length - 1].before(th); });
      header.dataset.fullPending = "1";
    }
    for (const row of bodyRows) {
      if (row.dataset.fullPending) continue;
      const cells = row.cells;
      const code = cells[2]?.textContent?.trim() || "";
      const r = byCode.get(code);
      if (!r) continue;
      const x = kpi(r);
      if (cells[6]) {
        cells[6].textContent = dateText(r.work_date);
        const timeCell = document.createElement("td");
        const actualTime = num(r.actual_time || r.total_time);
        timeCell.textContent = `${fmt(actualTime)} giờ`;
        cells[7].before(timeCell);
        const values: Array<[string, number]> = [["hv", x.hv], ["ok", x.ok], ["ng", x.ng], ["productivity", x.nangSuat], ["dat", x.dat], ["pp", x.pp]];
        for (const [type, value] of values) {
          const cell = document.createElement("td"); cell.textContent = type === "hv" || type === "productivity" || type === "dat" || type === "pp" ? pct(value) : fmt(value); styleMetric(cell, type, value, x.ngTypeCount); cells[8].before(cell);
        }
      }
      row.dataset.fullPending = "1";
    }
  };

  const scheduleSync = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void syncFullColumns(), 80);
  };
  observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });
  scheduleSync();

  const openStandalone = (row: HTMLTableRowElement) => {
    const pathname = window.location.pathname;
    const source = pathname.includes("/approved") ? "approved" : "pending";
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td")).map(cell => (cell.innerText || "").replace(/\s+/g, " ").trim());
    const dateTextValue = cells.find(value => /\d{2}\/\d{2}\/\d{4}/.test(value)) || "";
    const dateMatch = dateTextValue.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : "";
    const workerMatch = (cells[2] || "").match(/\(([^)]+)\)/);
    const workerCode = workerMatch?.[1] || "";
    const processName = cells[3] || "";
    const shift = cells[4] || "";
    const reportCodeValue = cells[1] || "";
    const key = encodeURIComponent([date, workerCode, processName, shift, reportCodeValue].join("|"));
    navigate(`/manager/report/review?source=${source}&date=${date}&key=${key}`);
  };

  const onOpenDetail = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target || target.closest("input,select,textarea")) return;
    const row = target.closest<HTMLTableRowElement>(".pending-reference-table tbody tr");
    if (!row) return;
    const cells = row.querySelectorAll("td");
    if (cells.length < 3 || row.querySelector(".management-empty,.management-error")) return;
    event.preventDefault();
    event.stopPropagation();
    openStandalone(row);
  };

  document.addEventListener("click", onOpenDetail, true);
  return () => {
    observer?.disconnect();
    window.clearTimeout(timer);
    document.removeEventListener("click", onOpenDetail, true);
    document.body.classList.remove("ktc-report-workspace-fix");
    document.getElementById(STYLE_ID)?.remove();
  };
}

export function ManagerReportsWorkspaceFix() {
  const navigate = useNavigate();
  useEffect(() => installReportWorkspaceFix(navigate), [navigate]);
  return <Reports />;
}

export function ManagerApprovedReportsWorkspaceFix() {
  const navigate = useNavigate();
  useEffect(() => installReportWorkspaceFix(navigate), [navigate]);
  return <ApprovedReportsDesktopActions />;
}
