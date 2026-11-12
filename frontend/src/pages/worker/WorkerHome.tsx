import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Activity, ArrowRight, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, ClipboardPenLine, Clock3, History, Sparkles, TrendingUp, XCircle } from "lucide-react";
import { clearAuthSession, getStoredUser } from "../../utils/authStorage";
import { getCurrentWorker } from "../../services/workerService";
import { getMyTempReports } from "../../services/productionService";
import type { WorkerProfile } from "../../types/worker";
import type { ProductionReport } from "../../types/production";
import { calculateWorkerHomeTodayStats, getWorkerReportNg } from "./workerHomeStats";
import "./WorkerHome.css";

const formatNumber = (value: unknown) => new Intl.NumberFormat("vi-VN").format(Number(value ?? 0));
const formatPercent = (value: unknown) => `${Math.max(0, Math.min(100, Number(value ?? 0))).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;
const formatHours = (value: unknown) => {
  const hours = Number(value ?? 0);
  if (!Number.isFinite(hours) || hours <= 0) return "0 giờ";
  return hours.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) + " giờ";
};

// Legacy GC machine lines may carry the effective time when the report-level field is zero.
type WorkerMachineLine = {
  machine_time_hours?: number | string;
  machineTimeHours?: number | string;
  deduction_time_hours?: number | string;
  deductionTimeHours?: number | string;
  deductions_json?: string | WorkerDeduction[];
  deductions?: WorkerDeduction[];
};
type WorkerDeduction = {
  minutes?: number | string;
  deduction_minutes?: number | string;
  hours?: number | string;
};

const getMachineLines = (report: ProductionReport): WorkerMachineLine[] => {
  const legacy = report as ProductionReport & {
    machine_lines?: WorkerMachineLine[];
    machineLines?: WorkerMachineLine[];
  };
  if (Array.isArray(legacy.machine_lines)) return legacy.machine_lines;
  return Array.isArray(legacy.machineLines) ? legacy.machineLines : [];
};

const getDeductions = (line: WorkerMachineLine): WorkerDeduction[] => {
  if (Array.isArray(line.deductions_json)) return line.deductions_json;
  if (Array.isArray(line.deductions)) return line.deductions;
  if (typeof line.deductions_json !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(line.deductions_json);
    return Array.isArray(parsed) ? parsed as WorkerDeduction[] : [];
  } catch {
    return [];
  }
};

const getReportActualHours = (report: ProductionReport): number => {
  const actual = Number(report.actual_time ?? 0);
  if (Number.isFinite(actual) && actual > 0) return actual;

  const lines = getMachineLines(report);
  if (lines.length) {
    const totals = lines.reduce((sum, line) => {
      const gross = Math.max(0, Number(line.machine_time_hours ?? line.machineTimeHours ?? 0) || 0);
      let deduction = Number(line.deduction_time_hours ?? line.deductionTimeHours);
      if (!Number.isFinite(deduction) || deduction < 0) {
        deduction = getDeductions(line).reduce(
          (hours, item) => hours + Math.max(
            0,
            Number(item.minutes ?? item.deduction_minutes ?? (Number(item.hours) || 0) * 60) || 0,
          ) / 60,
          0,
        );
      }
      return {
        gross: sum.gross + gross,
        deduction: sum.deduction + Math.min(gross, Math.max(0, deduction)),
      };
    }, { gross: 0, deduction: 0 });
    if (totals.gross > 0) return Math.max(0, totals.gross - totals.deduction);
  }

  const total = Number(report.total_time ?? 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
};

const formatDate = (value?: string) => {
  if (!value) return "--/--/----";
  const [year, month, day] = value.split("T")[0].split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};
const formatWeekday = (date: Date) => new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(date).replace(/^./, (c) => c.toUpperCase());

const statusMeta = (status?: string) => {
  switch (status) {
    case "approved": return { label: "Đã duyệt", className: "approved" };
    case "rejected": return { label: "Từ chối", className: "rejected" };
    case "need_fix": return { label: "Cần sửa", className: "need-fix" };
    default: return { label: "Đã gửi", className: "pending" };
  }
};

export default function WorkerHome() {
  const navigate = useNavigate();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [reports, setReports] = useState<ProductionReport[]>([]);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    let alive = true;
    const user = getStoredUser();
    if (!user || user.role !== "worker") {
      clearAuthSession({ bumpEpoch: false });
      navigate("/login", { replace: true });
      return () => { alive = false; };
    }

    // Render the home shell immediately; profile and report data load independently.
    void getCurrentWorker().then((workerData) => {
      if (alive) setWorker(workerData);
    }).catch((err: unknown) => {
      if (!alive) return;
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        clearAuthSession({ bumpEpoch: false });
        navigate("/login", { replace: true });
      }
    });

    void getMyTempReports().then((reportData) => {
      if (alive) setReports(Array.isArray(reportData) ? reportData : []);
    }).catch(() => {
      // Keep the home page usable if the recent-report endpoint is slow or unavailable.
      if (alive) setReports([]);
    });

    return () => { alive = false; };
  }, [navigate]);

  const todayReports = useMemo(() => reports
    .filter((report) => String(report.work_date || "").slice(0, 10) === todayKey)
    .sort((a, b) => String(b.entry_date || b.work_date).localeCompare(String(a.entry_date || a.work_date))), [reports, todayKey]);

  const todayStats = useMemo(
    () => calculateWorkerHomeTodayStats(todayReports, getReportActualHours),
    [todayReports],
  );

  const trainingPercent = Number(worker?.training_percent ?? 0);
  const displayReports = todayReports.length ? todayReports.slice(0, 4) : reports.slice(0, 4);
  const greetingName = worker?.full_name || "Công nhân";

  return (
    <main className="worker-home-page worker-home-v2">
      <div className="worker-home-shell">
        <section className="worker-home-welcome" aria-label="Chào mừng công nhân">
          <div className="worker-home-welcome-copy">
            <span className="worker-home-eyebrow"><Sparkles size={14} /> KHÔNG GIAN LÀM VIỆC KTC</span>
            <span className="worker-home-date">{formatWeekday(today)}, {formatDate(todayKey)}</span>
            <h1>Chào bạn,<br /><strong>{greetingName}!</strong></h1>
            <p>Ghi nhận sản xuất, theo dõi kết quả và quản lý báo cáo của bạn tại một nơi.</p>
            <div className="worker-home-identity">
              <span>MÃ NHÂN VIÊN · {worker?.worker_code || "--"}</span>
              <span className="worker-home-training">Học việc {formatPercent(trainingPercent)}</span>
            </div>
          </div>
          <div className="worker-home-welcome-aside" aria-hidden="true">
            <div className="worker-home-hero-orbit"><Activity size={56} strokeWidth={1.3}/></div>
            <span>PRODUCTION PORTAL</span>
            <strong>KTC <em>HANOI</em></strong>
          </div>
        </section>

        <section className="worker-home-today card" aria-label="Tổng quan hôm nay">
          <div className="worker-home-section-title">
            <div>
              <span className="worker-home-overline">HIỆU SUẤT TRONG NGÀY</span>
              <div className="worker-home-section-heading"><TrendingUp size={21}/><h2>Tổng quan sản xuất</h2></div>
            </div>
            <div className="worker-home-date-filter"><CalendarDays size={17}/><span>{formatDate(todayKey)}</span></div>
          </div>
          <div className="worker-home-metrics">
            <div className="metric ok"><div className="worker-home-metric-top"><span>SẢN PHẨM ĐẠT</span><span className="worker-home-metric-icon"><CheckCircle2 size={21}/></span></div><strong>{formatNumber(todayStats.ok)}</strong><small>OK · Thành phẩm đạt</small></div>
            <div className="metric ng"><div className="worker-home-metric-top"><span>SẢN PHẨM LỖI</span><span className="worker-home-metric-icon"><XCircle size={21}/></span></div><strong>{formatNumber(todayStats.ng)}</strong><small>NG · Sản phẩm lỗi</small></div>
            <div className="metric time"><div className="worker-home-metric-top"><span>THỜI GIAN LÀM</span><span className="worker-home-metric-icon"><Clock3 size={21}/></span></div><strong>{formatHours(todayStats.time).replace(" giờ", "")}<em>giờ</em></strong><small>Thời gian thực tế</small></div>
            <div className="metric reports"><div className="worker-home-metric-top"><span>ĐÃ GHI NHẬN</span><span className="worker-home-metric-icon"><ClipboardList size={21}/></span></div><strong>{formatNumber(todayStats.reportCount)}</strong><small>Báo cáo trong ngày</small></div>
          </div>
        </section>

        <section className="worker-home-actions-section" aria-label="Thao tác nhanh">
          <div className="worker-home-actions-header">
            <div><span className="worker-home-overline">ĐIỀU HƯỚNG NHANH</span><h2>Bắt đầu công việc</h2></div>
            <span className="worker-home-actions-description">Chọn công việc bạn cần thực hiện</span>
          </div>
          <div className="worker-home-actions">
          <button type="button" className="worker-home-action primary" onClick={() => navigate("/worker/process/select")}>
            <span className="worker-home-action-icon"><ClipboardPenLine size={27} /></span>
            <span><strong>Nhập báo cáo sản xuất</strong><small>Bắt đầu ghi nhận kết quả công việc</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
          <button type="button" className="worker-home-action" onClick={() => navigate("/worker/history")}>
            <span className="worker-home-action-icon"><History size={27} /></span>
            <span><strong>Lịch sử báo cáo</strong><small>Xem tiến độ duyệt và các báo cáo</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
          <button type="button" className="worker-home-action" onClick={() => navigate("/worker/statistics")}>
            <span className="worker-home-action-icon"><BarChart3 size={27} /></span>
            <span><strong>Thống kê của tôi</strong><small>Theo dõi sản lượng và hiệu suất</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
          <button type="button" className="worker-home-action" onClick={() => navigate("/worker/notifications")}>
            <span className="worker-home-action-icon notification"><Bell size={27} /></span>
            <span><strong>Thông báo</strong><small>Cập nhật tin mới từ hệ thống</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
          </div>
        </section>

        <section className="worker-home-reports card">
          <div className="worker-home-section-title">
            <div><span className="worker-home-overline">HOẠT ĐỘNG GẦN ĐÂY</span><div className="worker-home-section-heading"><History size={21}/><h2>Báo cáo mới nhất</h2></div></div>
            <button type="button" className="worker-home-see-all" onClick={() => navigate("/worker/history")}>Xem lịch sử <ArrowRight size={15} /></button>
          </div>
          <div className="worker-home-report-list">
            {displayReports.length ? displayReports.map((report) => {
              const status = statusMeta(report.status);
              const reportTime = getReportActualHours(report);
              return (
                <button type="button" className="worker-home-report" key={report.id ?? `${report.work_date}-${report.machine_no}-${report.product_name}`} onClick={() => report.id && navigate(`/worker/history/${report.id}`)}>
                  <span className="worker-home-report-date"><strong>{formatDate(report.work_date).slice(0, 5)}</strong><small>{formatDate(report.work_date).slice(6)}</small></span>
                  <span className="worker-home-report-main"><strong>{report.process_name || report.process_code || "Sản xuất"}{report.machine_no ? ` - Máy ${report.machine_no}` : ""}</strong><small>{report.product_name || "Sản phẩm"} · {formatHours(reportTime)}</small></span>
                  <span className="worker-home-report-output"><b>{formatNumber(report.tt_ok ?? 0)} OK</b><b>{formatNumber(getWorkerReportNg(report))} NG</b></span>
                  <span className={`worker-home-status ${status.className}`}>{status.label}</span>
                  <ChevronRight className="worker-home-report-arrow" size={18} />
                </button>
              );
            }) : <div className="worker-home-empty"><History size={24} /><strong>Chưa có báo cáo</strong><span>Tạo báo cáo đầu tiên trong hôm nay.</span></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
