import { useLocation, useNavigate } from "react-router-dom";
import type { ProductionReport } from "../../types/production";
import Reports from "./Reports";
import ApprovedReportsDesktopActions from "./ApprovedReportsDesktopActions";
import "./ManagerReportWorkspace.css";

const n = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export function ManagerReportsWorkspaceFix() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/admin-ops") ? "/admin-ops" : "/manager";
  const openReport = (report: ProductionReport) => {
    const id = Number(report.id);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const date = String(report.work_date || "").slice(0, 10);
    const key = encodeURIComponent([
      date,
      String(report.worker_code || ""),
      String(report.process_name || report.process_code || ""),
      String(report.shift || ""),
      n(report.actual_time).toFixed(4),
      n(report.tt_ok).toFixed(3),
      n(report.tt_ng).toFixed(3)
    ].join("|"));
    navigate(`${basePath}/report/review?source=pending&date=${date}&key=${key}&id=${id}`);
  };
  return <div className="ktc-manager-report-workspace"><Reports onOpenPendingReport={openReport} /></div>;
}

export function ManagerApprovedReportsWorkspaceFix() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/admin-ops") ? "/admin-ops" : "/manager";
  return <ApprovedReportsDesktopActions onOpenReport={(id) => navigate(`${basePath}/report/${id}`)} />;
}
