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
  if (type === "year") { start.setMonth(0, 1); end.setMonth(11, 31); }
  else if (type === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1, 0); }
  else if (type === "week") { const offset = (start.getDay() + 6) % 7; start.setDate(start.getDate() - offset); end.setTime(start.getTime()); end.setDate(start.getDate() + 6); }
  return { dateFrom: dateValue(start), dateTo: dateValue(end) };
};

function kpi(report: any) {
  const ok = n(report?.tt_ok);
  const ng = n(report?.tt_ng);
  const actual = n(report?.actual_output) || ok + ng;
  const standard = n(report?.standard_output) || n(report?.target_output);
  const actualTime = n(report?.actual_time);
  const target = n(report?.tt_dinh_muc) || (standard > 0 && actualTime > 0 ? standard * actualTime : 0);
  const productivity = n(report?.nang_suat_percent) || (target > 0 ? actual / target * 100 : 0);
  const achieved = actual > 0 ? ok / actual * 100 : 0;
  const pp = n(report?.pp_percent) || (actual > 0 ? ng / actual * 100 : 0);
  // Pending reports store an immutable training snapshot at creation time.
  // Never derive %HV from OK/NG/output and never fall back to a live worker value.
  const hv = report?.training_percent_snapshot ?? report?.training_percent ?? report?.hv_percent ?? report?.learning_percent ?? report?.hoc_viec_percent ?? 0;
  const ngTypes = Math.max(n(report?.ng_defect_type_count), n(report?.worker_ng_type_count), n(report?.machine_ng_type_count));
  return { ok, ng, actual, productivity, achieved, pp, hv, ngTypes };
}

const reportCode = (r: any, index = 0, duplicate = false) => {
  const explicit = r?.report_code || r?.reportCode || r?.code;
  if (explicit) return String(explicit);
  const base = `PR${String(r?.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${r?.worker_code || String(r?.id || index + 1).padStart(4, "0")}`;
  return duplicate ? `${base}-${r?.id ?? index + 1}` : base;
};

function installPendingTableFix(navigate: (to: string) => void) {
  const styleId = "ktc-manager-report-workspace-fix";
  const style = document.getElementById(styleId) || document.createElement("style");
  style.id = styleId;
  style.textContent = `
    @media (min-width:801px) {
      body.ktc-report-workspace-fix .management-sidebar { position:fixed!important; inset:72px 0 auto!important; width:100%!important; height:58px!important; min-height:58px!important; padding:0 18px!important; flex-direction:row!important; align-items:center!important; gap:14px!important; border-right:0!important; border-bottom:1px solid #dce8f5!important; box-shadow:0 3px 12px rgba(24,58,106,.05)!important; }
      body.ktc-report-workspace-fix .management-brand { width:120px!important; flex:0 0 120px!important; height:48px!important; padding:2px 4px!important; }
      body.ktc-report-workspace-fix .management-brand-logo { width:112px!important; max-height:42px!important; }
      body.ktc-report-workspace-fix .management-menu { display:flex!important; flex:1 1 auto!important; min-width:0!important; margin-top:0!important; overflow-x:auto!important; overflow-y:hidden!important; gap:4px!important; padding:0!important; }
      body.ktc-report-workspace-fix .management-menu button { width:auto!important; min-width:max-content!important; min-height:42px!important; height:42px!important; padding:0 13px!important; gap:7px!important; white-space:nowrap!important; }
      body.ktc-report-workspace-fix .management-sidebar-footer { display:none!important; }
      body.ktc-report-workspace-fix .management-main { margin-left:0!important; }
      body.ktc-report-workspace-fix .management-content { padding-top:24px!important; }
      body.ktc-report-workspace-fix .pending-reference-page { max-width:none!important; margin-top:0!important; }
      body.ktc-report-workspace-fix .pending-reference-table { min-width:1450px!important; table-layout:fixed!important; }
      body.ktc-report-workspace-fix .pending-reference-table th, body.ktc-report-workspace-fix .pending-reference-table td { height:42px!important; padding:0 9px!important; font-size:11px!important; }
      body.ktc-report-workspace-fix .pending-full-metric { text-align:center!important; font-weight:600!important; }
      body.ktc-report-workspace-fix .pending-full-productivity { background:#ffd6e7!important; color:#9b123f!important; border:1px solid #ff9fbe!important; font-weight:800!important; }
      body.ktc-report-workspace-fix .pending-full-pp { background:#fff0b8!important; color:#795600!important; border:1px solid #e3ad20!important; font-weight:800!important; }
    }
  `;
  if (!style.parentElement) document.head.appendChild(style);
  document.body.classList.add("ktc-report-workspace-fix");

  let disposed = false;
  let lastSignature = "";
  let cache: any[] = [];
  let tableRef: HTMLTableElement | null = null;
  let busy = false;
  let renderTimer: number | undefined;

  const isPending = () => window.location.pathname === "/manager/reports";
  const readFilters = () => {
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".pending-filter-card input"));
    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".pending-filter-card select"));
    const date = inputs.find(x => x.type === "date")?.value || dateValue(new Date());
    const search = inputs.find(x => x.type !== "date")?.value?.trim() || "";
    const processName = selects.find(x => x.previousElementSibling?.textContent?.trim() === "Công đoạn")?.value || selects[0]?.value || "";
    const shift = selects.find(x => x.previousElementSibling?.textContent?.trim() === "Ca làm việc")?.value || selects[1]?.value || "";
    const active = document.querySelector<HTMLButtonElement>(".pending-quick-filters button.active")?.textContent?.trim() || "Hôm nay";
    const type = active === "Tuần này" ? "week" : active === "Tháng này" ? "month" : active === "Năm này" ? "year" : "day";
    const range = rangeFor(date, type);
    const page = Number(document.querySelector<HTMLButtonElement>(".pending-pagination button.active")?.textContent || 1) || 1;
    return { date, search, processName, shift, ...range, page, pageSize: 8 };
  };

  const rebuild = (table: HTMLTableElement, rows: HTMLTableRowElement[]) => {
    const labels = ["", "Mã báo cáo", "Công nhân", "Công đoạn", "Ca", "Ngày báo cáo", "Thời gian", "% HV", "TT OK", "NG", "% năng suất", "% đạt", "% PP", "Trạng thái"];
    const header = table.tHead?.rows[0] || table.tHead?.insertRow() || table.createTHead().insertRow();
    while (header.firstChild) header.removeChild(header.firstChild);
    labels.forEach((label, index) => {
      const th = document.createElement("th"); th.textContent = label;
      if (index === 0) th.className = "select-col";
      if (index >= 7 && index <= 12) th.classList.add("pending-full-metric");
      header.appendChild(th);
    });

    const duplicateCounts = new Map<string, number>();
    cache.forEach(r => { const base = reportCode(r); duplicateCounts.set(base, (duplicateCounts.get(base) || 0) + 1); });
    const tbody = table.tBodies[0] || table.createTBody();
    const fragment = document.createDocumentFragment();
    cache.forEach((r, index) => {
      const original = rows[index];
      const tr = document.createElement("tr");
      tr.className = original?.className || "";
      tr.dataset.reportId = String(r?.id || "");
      const checkbox = original?.querySelector<HTMLInputElement>("input[type=checkbox]");
      const tdSelect = document.createElement("td"); tdSelect.className = "select-col"; if (checkbox) tdSelect.appendChild(checkbox); tr.appendChild(tdSelect);
      const x = kpi(r);
      const add = (value: string, cls = "") => { const td = document.createElement("td"); td.textContent = value; if (cls) td.className = cls; tr.appendChild(td); return td; };
      const baseCode = reportCode(r, index);
      add(reportCode(r, index, (duplicateCounts.get(baseCode) || 0) > 1), "report-code");
      add(`${String(r?.full_name || r?.worker_name || "—")} (${String(r?.worker_code || "—")})`);
      add(String(r?.process_name || r?.process_code || "—"));
      add(String(r?.shift || "—"));
      add(dateText(r?.work_date));
      add(`${f(r?.actual_time || r?.total_time)} giờ`);
      add(pct(x.hv), "pending-full-metric");
      add(f(x.ok), "pending-full-metric");
      add(f(x.ng), "pending-full-metric");
      const productivity = add(pct(x.productivity), "pending-full-metric");
      if (x.productivity <= 75 || x.productivity > 100) productivity.classList.add("pending-full-productivity");
      add(pct(x.achieved), "pending-full-metric");
      const pp = add(pct(x.pp), "pending-full-metric");
      if (x.pp === 0 || x.ngTypes === 1) pp.classList.add("pending-full-pp");
      add("Chờ duyệt");
      fragment.appendChild(tr);
    });
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    tbody.appendChild(fragment);
  };

  const sync = async (force = false) => {
    if (disposed || !isPending()) return;
    const table = document.querySelector<HTMLTableElement>(".pending-reference-table");
    if (!table) return;
    const q = readFilters();
    const signature = JSON.stringify(q);
    const shapeOk = table.tHead?.rows[0]?.cells.length === 14 && Array.from(table.tBodies[0]?.rows || []).every(r => r.cells.length === 14);
    if (!force && signature === lastSignature && table === tableRef && shapeOk) return;
    if (busy) return;
    busy = true;
    try {
      const result = signature === lastSignature && cache.length ? { data: cache } : await getPendingReports({ dateFrom:q.dateFrom,dateTo:q.dateTo,processName:q.processName||undefined,shift:q.shift||undefined,search:q.search||undefined,page:q.page,pageSize:q.pageSize });
      cache = result.data || [];
      lastSignature = signature;
      tableRef = table;
      const rows = Array.from(table.tBodies[0]?.rows || []).filter(row => !row.querySelector(".management-empty,.management-error"));
      rebuild(table, rows);
    } catch {
      // Reports.tsx keeps ownership of loading/error state; the patch is visual only.
    } finally {
      busy = false;
    }
  };

  const click = (event: MouseEvent) => {
    if (!isPending()) return;
    const target = event.target as Element | null;
    if (!target || target.closest("input,select,textarea,button,a")) return;
    const row = target.closest<HTMLTableRowElement>(".pending-reference-table tbody tr[data-report-id]");
    if (!row) return;
    const id = Number(row.dataset.reportId || 0);
    const item = cache.find(r => Number(r?.id) === id);
    if (!item?.id) return;
    const date = String(item.work_date || "").slice(0, 10);
    const key = encodeURIComponent([date,String(item.worker_code||""),String(item.process_name||item.process_code||""),String(item.shift||""),n(item.actual_time).toFixed(4),n(item.tt_ok).toFixed(3),n(item.tt_ng).toFixed(3)].join("|"));
    event.preventDefault(); event.stopPropagation();
    navigate(`/manager/report/review?source=pending&date=${date}&key=${key}&id=${Number(item.id)}`);
  };

  document.addEventListener("click", click, true);
  const observer = new MutationObserver(() => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => void sync(false), 40);
  });
  observer.observe(document.body, { childList:true, subtree:true });
  const interval = window.setInterval(() => void sync(false), 500);
  void sync(true);

  return () => {
    disposed = true;
    observer.disconnect();
    document.removeEventListener("click", click, true);
    window.clearTimeout(renderTimer);
    window.clearInterval(interval);
    document.body.classList.remove("ktc-report-workspace-fix");
    document.getElementById(styleId)?.remove();
  };
}

export function ManagerReportsWorkspaceFix() {
  const navigate = useNavigate();
  useEffect(() => installPendingTableFix(navigate), [navigate]);
  return <Reports />;
}

export function ManagerApprovedReportsWorkspaceFix() {
  return <ApprovedReportsDesktopActions />;
}
