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

const NON_STANDARD = /\b(?:XUATNHAP|KTCD|TAIPP)\b/i;

function metrics(report: any) {
  const ok = n(report?.tt_ok);
  const ng = n(report?.tt_ng);
  const actual = n(report?.actual_output) || ok + ng;
  const standard = n(report?.standard_output) || n(report?.target_output);
  const actualTime = n(report?.actual_time);
  const standardTarget = standard > 0 && actualTime > 0 ? standard * actualTime : 0;
  const noStandard = NON_STANDARD.test(`${report?.product_name || ""} ${report?.process_name || ""}`) || standard <= 0;

  // % HV is immutable report history data. Never derive it from output/quality.
  const snapshot = Number(report?.training_percent_snapshot);
  const hv = Number.isFinite(snapshot) ? snapshot : null;

  if (noStandard) {
    return { hv, ok: null, ng: null, productivity: null, achieved: null, pp: null };
  }

  return {
    hv,
    ok,
    ng,
    productivity: standardTarget > 0 ? (actual / standardTarget) * 100 : null,
    achieved: actual > 0 ? (ok / actual) * 100 : null,
    pp: actual > 0 ? (ng / actual) * 100 : null,
  };
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
        body.ktc-report-workspace-fix .pending-full-productivity { background: #ffd6e7 !important; color: #9b123f !important; border: 1px solid #ff9fbe !important; }
        body.ktc-report-workspace-fix .pending-full-pp { background: #fff0b8 !important; color: #795600 !important; border: 1px solid #e3ad20 !important; }
        body.ktc-report-workspace-fix .pending-full-na { color: #8a9ab0 !important; background: #f8fafc !important; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.classList.add("ktc-report-workspace-fix");

  let timer: number | undefined;
  let lastSignature = "";
  let cache: any[] = [];
  let cachedAt = 0;

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

  const sync = async () => {
    if (!isPending() && !isApproved()) return;
    const table = document.querySelector<HTMLTableElement>(".pending-reference-table");
    if (!table) return;
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter(row => !row.querySelector(".management-empty,.management-error"));
    if (!rows.length) return;

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
      } catch {
        return;
      }
    }

    rows.forEach((row, index) => {
      const report = cache[index];
      if (report?.id) row.dataset.reportId = String(report.id);
    });

    if (!isPending()) return;

    const header = table.tHead?.rows[0];
    if (header && header.dataset.fullPending !== "1") {
      const checkboxCell = header.cells[0];
      while (header.cells.length > 1) header.deleteCell(1);
      ["Mã báo cáo", "Công nhân", "Công đoạn", "Ca", "Ngày báo cáo", "Thời gian", "% HV", "TT OK", "NG", "% năng suất", "% đạt", "% PP", "Trạng thái"].forEach((label, index) => {
        const th = document.createElement("th");
        th.textContent = label;
        if (index >= 6 && index <= 11) th.className = "pending-full-metric";
        header.appendChild(th);
      });
      header.dataset.fullPending = "1";
      void checkboxCell;
    }

    rows.forEach((row, index) => {
      const report = cache[index];
      if (!report || row.dataset.fullPending === "1") return;
      const firstCell = row.cells[0];
      const checkbox = firstCell?.querySelector("input[type='checkbox']");
      while (row.cells.length > 1) row.deleteCell(1);
      const addCell = (value: string, className = "") => {
        const td = document.createElement("td");
        td.textContent = value;
        if (className) td.className = className;
        row.appendChild(td);
        return td;
      };
      const x = metrics(report);
      const code = `PR${String(report.work_date || "REPORT").slice(0, 10).replace(/-/g, "")}-${report.worker_code || String(report.id || index + 1).padStart(4, "0")}`;
      addCell(code);
      addCell(`${String(report.full_name || report.worker_name || "—")} (${String(report.worker_code || "—")})`);
      addCell(String(report.process_name || report.process_code || "—"));
      addCell(String(report.shift || "—"));
      addCell(dateText(report.work_date));
      addCell(`${f(report.actual_time || report.total_time)} giờ`);
      addCell(x.hv === null ? "—" : pct(x.hv), "pending-full-metric pending-full-hv");
      addCell(x.ok === null ? "—" : f(x.ok), "pending-full-metric");
      addCell(x.ng === null ? "—" : f(x.ng), "pending-full-metric");
      const prodCell = addCell(x.productivity === null ? "—" : pct(x.productivity), "pending-full-metric");
      if (x.productivity === null) prodCell.classList.add("pending-full-na");
      else if (x.productivity <= 75 || x.productivity > 100) prodCell.classList.add("pending-full-productivity");
      const achievedCell = addCell(x.achieved === null ? "—" : pct(x.achieved), "pending-full-metric");
      if (x.achieved === null) achievedCell.classList.add("pending-full-na");
      const ppCell = addCell(x.pp === null ? "—" : pct(x.pp), "pending-full-metric");
      if (x.pp === null) ppCell.classList.add("pending-full-na");
      else if (x.pp === 0) ppCell.classList.add("pending-full-pp");
      addCell("Chờ duyệt");
      if (checkbox && firstCell) firstCell.replaceChildren(checkbox);
      row.dataset.fullPending = "1";
    });
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
    timer = window.setTimeout(() => void sync(), 60);
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
