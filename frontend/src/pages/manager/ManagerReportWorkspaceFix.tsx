import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getApprovedReports, getPendingReports } from "../../services/productionService";
import Reports from "./Reports";
import ApprovedReportsDesktopActions from "./ApprovedReportsDesktopActions";

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const f = (v: unknown) => n(v).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const pct = (v: unknown) => `${f(v)}%`;
const dateText = (v: unknown) => {
  const s = String(v || "").slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s || "—";
};
const dateValue = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
const rangeFor = (value: string, type: "day" | "week" | "month" | "year") => {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(start);
  if (type === "year") {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
  } else if (type === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else if (type === "week") {
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  }
  return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

// Keep the pending list mathematically identical to ApprovedReports.kpi().
// Do not derive %HV from OK/NG or output: use the persisted report snapshot/fallback fields.
function kpi(report: any) {
  const ok = n(report?.tt_ok);
  const ng = n(report?.tt_ng);
  const actual = n(report?.actual_output) || ok + ng;
  const standard = n(report?.standard_output) || n(report?.target_output);
  const actualTime = n(report?.actual_time);
  const ttDinhMuc = n(report?.tt_dinh_muc) || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
  const nangSuat = n(report?.nang_suat_percent) || (ttDinhMuc > 0 ? (actual / ttDinhMuc) * 100 : 0);
  const dat = actual > 0 ? (ok / actual) * 100 : 0;
  const pp = n(report?.pp_percent) || (actual > 0 ? (ng / actual) * 100 : 0);
  const hv = report?.training_percent ?? report?.hv_percent ?? report?.learning_percent ?? report?.hoc_viec_percent ?? 0;
  const ngTypeCount = Math.max(n(report?.ng_defect_type_count), n(report?.worker_ng_type_count), n(report?.machine_ng_type_count));
  return { ok, ng, actual, ttDinhMuc, nangSuat, dat, pp, hv, ngTypeCount };
}

const makeDetailKey = (report: any) => [
  String(report?.work_date || "").slice(0, 10),
  String(report?.worker_code || ""),
  String(report?.process_name || report?.process_code || ""),
  String(report?.shift || ""),
  n(report?.actual_time).toFixed(4),
  n(report?.tt_ok).toFixed(3),
  n(report?.tt_ng).toFixed(3),
].join("|");

function installReportWorkspaceFix(navigate: (to: string) => void) {
  const styleId = "ktc-manager-report-workspace-fix";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      @media (min-width: 801px) {
        body.ktc-report-workspace-fix .management-sidebar {
          position: fixed !important;
          inset: 72px 0 auto !important;
          width: 100% !important;
          height: 58px !important;
          min-height: 58px !important;
          padding: 0 18px !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 14px !important;
          border-right: 0 !important;
          border-bottom: 1px solid #dce8f5 !important;
          box-shadow: 0 3px 12px rgba(24,58,106,.05) !important;
        }
        body.ktc-report-workspace-fix .management-brand { width: 120px !important; flex: 0 0 120px !important; height: 48px !important; padding: 2px 4px !important; }
        body.ktc-report-workspace-fix .management-brand-logo { width: 112px !important; max-height: 42px !important; }
        body.ktc-report-workspace-fix .management-menu { display: flex !important; flex: 1 1 auto !important; min-width: 0 !important; margin-top: 0 !important; overflow-x: auto !important; overflow-y: hidden !important; gap: 4px !important; padding: 0 !important; }
        body.ktc-report-workspace-fix .management-menu button { width: auto !important; min-width: max-content !important; min-height: 42px !important; height: 42px !important; padding: 0 13px !important; gap: 7px !important; white-space: nowrap !important; }
        body.ktc-report-workspace-fix .management-sidebar-footer { display: none !important; }
        body.ktc-report-workspace-fix .management-main { margin-left: 0 !important; }
        body.ktc-report-workspace-fix .management-content { padding-top: 24px !important; }
        body.ktc-report-workspace-fix .pending-reference-page { max-width: none !important; margin-top: 0 !important; }
        body.ktc-report-workspace-fix .pending-reference-table { min-width: 1450px !important; }
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table th,
        body.ktc-report-workspace-fix .pending-list-card .pending-reference-table td { height: 42px !important; padding: 0 9px !important; font-size: 11px !important; }
        body.ktc-report-workspace-fix .pending-full-metric { text-align: center !important; font-weight: 600 !important; }
        body.ktc-report-workspace-fix .pending-full-hv { color: #315a91 !important; }
        body.ktc-report-workspace-fix .pending-full-productivity { background: #ffd6e7 !important; color: #9b123f !important; border: 1px solid #ff9fbe !important; font-weight: 800 !important; }
        body.ktc-report-workspace-fix .pending-full-pp { background: #fff0b8 !important; color: #795600 !important; border: 1px solid #e3ad20 !important; font-weight: 800 !important; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.classList.add("ktc-report-workspace-fix");

  let timer: number | undefined;
  let lastSignature = "";
  let cache: any[] = [];
  let cachedAt = 0;
  let renderedKey = "";
  let rendering = false;

  const isPending = () => window.location.pathname === "/manager/reports";
  const isApproved = () => window.location.pathname === "/manager/approved";

  const readFilters = () => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".pending-filter-card input"));
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".pending-filter-card select"));
    const date = inputs.find(x => x.type === "date")?.value || dateValue(new Date());
    const search = inputs.find(x => x.type !== "date")?.value?.trim() || "";
    const processName = selects.find(x => x.previousElementSibling?.textContent?.trim() === "Công đoạn")?.value || selects[0]?.value || "";
    const shift = selects.find(x => x.previousElementSibling?.textContent?.trim() === "Ca làm việc")?.value || selects[1]?.value || "";
    const active = document.querySelector<HTMLButtonElement>(".pending-quick-filters button.active")?.textContent?.trim() || "Hôm nay";
    const type = active === "Tuần này" ? "week" : active === "Tháng này" ? "month" : active === "Năm này" ? "year" : "day";
    const r = rangeFor(date, type as "day" | "week" | "month" | "year");
    const page = Number(document.querySelector<HTMLButtonElement>(".pending-pagination button.active")?.textContent || 1) || 1;
    return { date, search, processName, shift, ...r, page, pageSize: 8 };
  };

  const buildHeader = (table: HTMLTableElement) => {
    const thead = table.tHead || table.createTHead();
    const header = thead.rows[0] || thead.insertRow();
    while (header.firstChild) header.removeChild(header.firstChild);
    const labels = ["", "Mã báo cáo", "Công nhân", "Công đoạn", "Ca", "Ngày báo cáo", "Thời gian", "% HV", "TT OK", "NG", "% năng suất", "% đạt", "% PP", "Trạng thái"];
    labels.forEach((label, index) => {
      const th = document.createElement("th");
      th.textContent = label;
      if (index === 0) th.className = "select-col";
      if (index >= 7 && index <= 12) th.classList.add("pending-full-metric");
      header.appendChild(th);
    });
    return header;
  };

  const buildRow = (report: any, index: number, originalRow: HTMLTableRowElement | undefined) => {
    const row = document.createElement("tr");
    row.className = originalRow?.className || "";
    row.dataset.reportId = String(report?.id || "");
    const originalCheckbox = originalRow?.querySelector<HTMLInputElement>("input[type='checkbox']");
    const checkboxCell = document.createElement("td");
    checkboxCell.className = "select-col";
    if (originalCheckbox) checkboxCell.appendChild(originalCheckbox);
    row.appendChild(checkboxCell);

    const add = (value: string, className = "") => {
      const td = document.createElement("td");
      td.textContent = value;
      if (className) td.className = className;
      row.appendChild(td);
      return td;
    };

    const x = kpi(report);
    const code = `PR${String(report?.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report?.worker_code || String(report?.id || index + 1).padStart(4, "0")}`;
    add(code);
    add(`${String(report?.full_name || report?.worker_name || "—")} (${String(report?.worker_code || "—")})`);
    add(String(report?.process_name || report?.process_code || "—"));
    add(String(report?.shift || "—"));
    add(dateText(report?.work_date));
    add(`${f(report?.actual_time || report?.total_time)} giờ`);
    add(pct(x.hv), "pending-full-metric pending-full-hv");
    add(f(x.ok), "pending-full-metric");
    add(f(x.ng), "pending-full-metric");
    const productivity = add(pct(x.nangSuat), "pending-full-metric");
    if (x.nangSuat <= 75 || x.nangSuat > 100) productivity.classList.add("pending-full-productivity");
    add(pct(x.dat), "pending-full-metric");
    const pp = add(pct(x.pp), "pending-full-metric");
    if (x.pp === 0 || x.ngTypeCount === 1) pp.classList.add("pending-full-pp");
    add("Chờ duyệt");
    return row;
  };

  const sync = async () => {
    if (!isPending() && !isApproved()) return;
    const table = document.querySelector<HTMLTableElement>(".pending-reference-table");
    if (!table) return;

    const q = readFilters();
    const signature = JSON.stringify({ route: isPending() ? "pending" : "approved", ...q });
    if (signature !== lastSignature || Date.now() - cachedAt > 1200) {
      try {
        const result = isPending()
          ? await getPendingReports({ dateFrom: q.dateFrom, dateTo: q.dateTo, processName: q.processName || undefined, shift: q.shift || undefined, search: q.search || undefined, page: q.page, pageSize: q.pageSize })
          : await getApprovedReports({ dateFrom: q.dateFrom, dateTo: q.dateTo, processName: q.processName || undefined, shift: q.shift || undefined, search: q.search || undefined, page: q.page, pageSize: q.pageSize });
        cache = result.data || [];
        lastSignature = signature;
        cachedAt = Date.now();
        renderedKey = "";
      } catch {
        return;
      }
    }

    if (!isPending() || rendering) return;
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter(row => !row.querySelector(".management-empty,.management-error"));
    const key = `${signature}|${cache.map(x => String(x?.id || "")).join(",")}|${table.tBodies[0]?.rows.length || 0}`;
    if (key === renderedKey) return;

    rendering = true;
    try {
      const tbody = table.tBodies[0] || table.createTBody();
      const originalRows = rows;
      const fragment = document.createDocumentFragment();
      cache.forEach((report, index) => fragment.appendChild(buildRow(report, index, originalRows[index])));
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      tbody.appendChild(fragment);
      buildHeader(table);
      renderedKey = key;
    } finally {
      rendering = false;
    }
  };

  const openDetail = (row: HTMLTableRowElement) => {
    const id = Number(row.dataset.reportId || 0);
    const item = id ? cache.find(report => Number(report.id) === id) : null;
    if (!item?.id) return;
    const source = isApproved() ? "approved" : "pending";
    const date = String(item.work_date || "").slice(0, 10);
    const key = encodeURIComponent(makeDetailKey(item));
    navigate(`/manager/report/review?source=${source}&date=${date}&key=${key}&id=${Number(item.id)}`);
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void sync(), 80);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();

  const click = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target || target.closest("input,select,textarea,button,a")) return;
    const row = target.closest<HTMLTableRowElement>(".pending-reference-table tbody tr");
    if (!row || row.querySelector(".management-empty,.management-error")) return;
    if (!isPending() && !isApproved()) return;
    event.preventDefault();
    event.stopPropagation();
    openDetail(row);
  };
  document.addEventListener("click", click, true);

  return () => {
    observer.disconnect();
    window.clearTimeout(timer);
    document.removeEventListener("click", click, true);
    document.body.classList.remove("ktc-report-workspace-fix");
    document.getElementById(styleId)?.remove();
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
