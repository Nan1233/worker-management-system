import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Reports from "./Reports";
import ApprovedReportsDesktopActions from "./ApprovedReportsDesktopActions";

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
        body.ktc-report-workspace-fix .pending-reference-table { min-width: 1120px !important; }
      }
    `;
    document.head.appendChild(style);
  }
  document.body.classList.add("ktc-report-workspace-fix");

  const openStandalone = (row: HTMLTableRowElement) => {
    const pathname = window.location.pathname;
    const source = pathname.includes("/approved") ? "approved" : "pending";
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>("td")).map(cell => (cell.innerText || "").replace(/\s+/g, " ").trim());
    const dateText = cells.find(value => /\d{2}\/\d{2}\/\d{4}/.test(value)) || "";
    const dateMatch = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : "";
    const workerMatch = (cells[2] || "").match(/\(([^)]+)\)/);
    const workerCode = workerMatch?.[1] || "";
    const processName = cells[3] || "";
    const shift = cells[4] || "";
    const reportCode = cells[1] || "";
    const key = encodeURIComponent([date, workerCode, processName, shift, reportCode].join("|"));
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
