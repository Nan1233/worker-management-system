import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { BarChart3, Bell, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, ClipboardPenLine, Clock3, History, XCircle } from "lucide-react";
import { clearAuthSession, getStoredUser } from "../../utils/authStorage";
import { getCurrentWorker } from "../../services/workerService";
import { getMyTempReports } from "../../services/productionService";
import type { WorkerProfile } from "../../types/worker";
import type { ProductionReport } from "../../types/production";
import "./WorkerHome.css";

const formatNumber = (value: unknown) => new Intl.NumberFormat("vi-VN").format(Number(value ?? 0));
const formatPercent = (value: unknown) => `${Math.max(0, Math.min(100, Number(value ?? 0))).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const user = getStoredUser();
        if (!user || user.role !== "worker") {
          clearAuthSession({ bumpEpoch: false });
          navigate("/login", { replace: true });
          return;
        }
        const [workerData, reportData] = await Promise.all([getCurrentWorker(true), getMyTempReports()]);
        if (!alive) return;
        setWorker(workerData);
        setReports(Array.isArray(reportData) ? reportData : []);
      } catch (err: unknown) {
        if (!alive) return;
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          clearAuthSession({ bumpEpoch: false });
          navigate("/login", { replace: true });
          return;
        }
        setError(axios.isAxiosError(err) ? (err.response?.data?.message || "Không thể tải dữ liệu trang chủ") : "Không thể tải dữ liệu trang chủ");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load();
    return () => { alive = false; };
  }, [navigate]);

  const todayReports = useMemo(() => reports
    .filter((report) => String(report.work_date || "").slice(0, 10) === todayKey)
    .sort((a, b) => String(b.entry_date || b.work_date).localeCompare(String(a.entry_date || a.work_date)))
    .slice(0, 4), [reports, todayKey]);

  const todayStats = useMemo(() => {
    const ok = todayReports.reduce((sum, report) => sum + Number(report.tt_ok ?? 0), 0);
    const ng = todayReports.reduce((sum, report) => sum + Number((report.defects || []).reduce((defectSum, defect) => defectSum + Number(defect.quantity ?? 0), 0)), 0);
    const time = todayReports.reduce((sum, report) => sum + Number(report.total_time ?? 0), 0);
    return { ok, ng, time, reportCount: todayReports.length };
  }, [todayReports]);

  const trainingPercent = Number(worker?.training_percent ?? 0);
  const displayReports = todayReports.length ? todayReports : reports.slice(0, 4);
  const greetingName = worker?.full_name || "Công nhân";

  if (loading) return <main className="worker-home-page"><div className="worker-home-state">Đang tải dữ liệu...</div></main>;
  if (error) return <main className="worker-home-page"><div className="worker-home-state error"><strong>Không thể tải trang chủ</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Thử lại</button></div></main>;

  return (
    <main className="worker-home-page">
      <div className="worker-home-shell">
        <section className="worker-home-welcome">
          <div className="worker-home-welcome-copy">
            <span className="worker-home-date">{formatWeekday(today)}, {formatDate(todayKey)}</span>
            <h1>Chào bạn, <strong>{greetingName}!</strong></h1>
            <p>Chúc bạn một ngày làm việc hiệu quả!</p>
            <div className="worker-home-identity">
              <span>KTC-{worker?.worker_code || "--"}</span>
              <span className="worker-home-training">Học việc: {formatPercent(trainingPercent)}</span>
            </div>
          </div>
        </section>

        <section className="worker-home-today card" aria-label="Tổng quan hôm nay">
          <div className="worker-home-section-title">
            <div className="worker-home-section-heading"><span className="worker-home-section-mark" /> <span>Tổng quan hôm nay</span></div>
            <div className="worker-home-date-filter"><CalendarDays size={19} /><span>{formatDate(todayKey)}</span><ChevronRight size={17} /></div>
          </div>
          <div className="worker-home-metrics">
            <div className="metric ok"><CheckCircle2 size={27} /><strong>{formatNumber(todayStats.ok)}</strong><span>OK</span></div>
            <div className="metric ng"><XCircle size={27} /><strong>{formatNumber(todayStats.ng)}</strong><span>NG</span></div>
            <div className="metric time"><Clock3 size={27} /><strong>{Math.floor(todayStats.time / 60)}.{String(todayStats.time % 60).padStart(2, "0")}</strong><span>Giờ làm</span></div>
            <div className="metric reports"><ClipboardList size={27} /><strong>{todayStats.reportCount}</strong><span>Báo cáo</span></div>
          </div>
        </section>

        <section className="worker-home-actions" aria-label="Thao tác nhanh">
          <button type="button" className="worker-home-action primary" onClick={() => navigate("/worker/process/select")}>
            <span className="worker-home-action-icon"><ClipboardPenLine size={27} /></span>
            <span><strong>Nhập báo cáo</strong><small>Tạo báo cáo mới</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
          <button type="button" className="worker-home-action" onClick={() => navigate("/worker/history")}>
            <span className="worker-home-action-icon"><History size={27} /></span>
            <span><strong>Lịch sử báo cáo</strong><small>Xem báo cáo đã gửi</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
          <button type="button" className="worker-home-action" onClick={() => navigate("/worker/statistics")}>
            <span className="worker-home-action-icon"><BarChart3 size={27} /></span>
            <span><strong>Thống kê của tôi</strong><small>Xem hiệu suất</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
          <button type="button" className="worker-home-action" onClick={() => navigate("/worker/notifications")}>
            <span className="worker-home-action-icon notification"><Bell size={27} /></span>
            <span><strong>Thông báo</strong><small>Xem thông báo mới</small></span>
            <span className="worker-home-action-arrow"><ChevronRight size={19} /></span>
          </button>
        </section>

        <section className="worker-home-reports card">
          <div className="worker-home-section-title">
            <div className="worker-home-section-heading"><span className="worker-home-section-mark" /> <span>Báo cáo gần đây</span></div>
            <button type="button" className="worker-home-see-all" onClick={() => navigate("/worker/history")}>Xem tất cả <ChevronRight size={15} /></button>
          </div>
          <div className="worker-home-report-list">
            {displayReports.length ? displayReports.map((report) => {
              const status = statusMeta(report.status);
              return (
                <button type="button" className="worker-home-report" key={report.id ?? `${report.work_date}-${report.machine_no}-${report.product_name}`} onClick={() => report.id && navigate(`/worker/history/${report.id}`)}>
                  <span className="worker-home-report-date"><strong>{formatDate(report.work_date).slice(0, 5)}</strong><small>{formatDate(report.work_date).slice(6)}</small></span>
                  <span className="worker-home-report-main"><strong>{report.process_name || report.process_code || "Sản xuất"}{report.machine_no ? ` - Máy ${report.machine_no}` : ""}</strong><small>{report.product_name || "Sản phẩm"} · {report.total_time ? `${(Number(report.total_time) / 60).toFixed(1)} giờ` : "--"}</small></span>
                  <span className="worker-home-report-output"><b>{formatNumber(report.tt_ok ?? 0)} OK</b><b>{formatNumber((report.defects || []).reduce((sum, defect) => sum + Number(defect.quantity ?? 0), 0))} NG</b></span>
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
