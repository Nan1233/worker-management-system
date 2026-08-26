import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Bell, CalendarDays, CheckCircle2, ChevronRight, ClipboardPenLine, Clock3, History, XCircle } from "lucide-react";
import { clearAuthSession, getStoredUser } from "../../utils/authStorage";
import { getCurrentWorker } from "../../services/workerService";
import { getMyTempReports } from "../../services/productionService";
import type { WorkerProfile } from "../../types/worker";
import type { ProductionReport } from "../../types/production";
import { useNotificationBadge } from "../../hooks/useNotificationBadge";
import { usePermissions } from "../../hooks/usePermissions";
import "./WorkerHome.css";

const formatNumber = (value: unknown) => new Intl.NumberFormat("vi-VN").format(Number(value ?? 0));
const formatPercent = (value: unknown) => `${Math.max(0, Math.min(100, Number(value ?? 0))).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;
const formatDate = (value?: string) => {
  if (!value) return "--/--/----";
  const [year, month, day] = value.split("T")[0].split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const statusMeta = (status?: string) => {
  switch (status) {
    case "approved": return { label: "Approved", className: "approved" };
    case "rejected": return { label: "Rejected", className: "rejected" };
    case "need_fix": return { label: "Need fix", className: "need-fix" };
    default: return { label: "Pending", className: "pending" };
  }
};

export default function WorkerHome() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { unreadCount } = useNotificationBadge(can("NOTIFICATION_VIEW"));
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
        const [workerData, reportData] = await Promise.all([
          getCurrentWorker(true),
          getMyTempReports(),
        ]);
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
    const total = todayReports.reduce((sum, report) => sum + Number(report.actual_output ?? 0), 0);
    const ok = todayReports.reduce((sum, report) => sum + Number(report.tt_ok ?? 0), 0);
    const ng = todayReports.reduce((sum, report) => sum + Number((report.defects || []).reduce((defectSum, defect) => defectSum + Number(defect.quantity ?? 0), 0)), 0);
    const time = todayReports.reduce((sum, report) => sum + Number(report.total_time ?? 0), 0);
    return { total, ok, ng, time };
  }, [todayReports]);

  const processLabel = worker?.processes?.map((item) => item.name).filter(Boolean).join(", ") || worker?.process_names || "Chưa phân công";
  const trainingPercent = Number(worker?.training_percent ?? 0);
  const displayReports = todayReports.length ? todayReports : reports.slice(0, 4);

  if (loading) {
    return <main className="worker-home-page"><div className="worker-home-state">Đang tải dữ liệu...</div></main>;
  }

  if (error) {
    return <main className="worker-home-page"><div className="worker-home-state error"><strong>Không thể tải trang chủ</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Thử lại</button></div></main>;
  }

  return (
    <main className="worker-home-page">
      <div className="worker-home-shell">
        <header className="worker-home-topbar">
          <button type="button" className="worker-home-brand" onClick={() => navigate("/worker")} aria-label="KTC Worker Home">
            <span className="worker-home-brand-mark">K</span>
            <span><strong>KTC (HANOI) CO., LTD.</strong><small>Worker</small></span>
          </button>
          <button type="button" className="worker-home-notification" onClick={() => navigate("/worker/system")} aria-label="Thông báo">
            <Bell size={18} />
            {unreadCount > 0 && <b>{unreadCount > 99 ? "99+" : unreadCount}</b>}
          </button>
        </header>

        <section className="worker-home-welcome">
          <div>
            <span className="worker-home-eyebrow">Hôm nay</span>
            <h1>Xin chào, <strong>{worker?.full_name || "Nguyễn Văn An"}</strong></h1>
            <div className="worker-home-identity">
              <span>KTC-{worker?.worker_code || "00125"}</span>
              <span>Process: {processLabel}</span>
              <span className="worker-home-training">Học việc: {formatPercent(trainingPercent)}</span>
            </div>
          </div>
          <div className="worker-home-avatar" aria-hidden="true">{(worker?.full_name || "N").slice(0, 1).toUpperCase()}</div>
        </section>

        <section className="worker-home-today card" aria-label="Tổng quan hôm nay">
          <div className="worker-home-section-title"><span>Hôm nay</span><small>{formatDate(todayKey)}</small></div>
          <div className="worker-home-metrics">
            <div><span>Tổng SL</span><strong>{formatNumber(todayStats.total)}</strong><small>sản phẩm</small></div>
            <div className="ok"><span>OK</span><strong>{formatNumber(todayStats.ok)}</strong><small>sản phẩm</small></div>
            <div className="ng"><span>NG</span><strong>{formatNumber(todayStats.ng)}</strong><small>sản phẩm</small></div>
            <div className="time"><span>Thời gian</span><strong>{Math.floor(todayStats.time / 60)}h {todayStats.time % 60}m</strong><small>đã làm việc</small></div>
          </div>
        </section>

        <button type="button" className="worker-home-create" onClick={() => navigate("/worker/process/select")}>
          <span><ClipboardPenLine size={20} /><strong>+ BÁO CÁO SẢN XUẤT</strong><small>Nhập báo cáo sản lượng mới</small></span>
          <ChevronRight size={20} />
        </button>

        <section className="worker-home-reports card">
          <div className="worker-home-section-title">
            <div><span>Báo cáo gần đây</span><small>{todayReports.length ? `${todayReports.length} báo cáo hôm nay` : "Báo cáo mới nhất"}</small></div>
            <button type="button" onClick={() => navigate("/worker/history")}>Xem tất cả <ChevronRight size={15} /></button>
          </div>
          <div className="worker-home-report-list">
            {displayReports.length ? displayReports.map((report) => {
              const status = statusMeta(report.status);
              return (
                <button type="button" className="worker-home-report" key={report.id ?? `${report.work_date}-${report.machine_no}-${report.product_name}`} onClick={() => report.id && navigate(`/worker/history/${report.id}`)}>
                  <span className="worker-home-report-date"><CalendarDays size={14} /><strong>{formatDate(report.work_date)}</strong><small>· Ca {report.shift || "--"}</small></span>
                  <span className="worker-home-report-main"><strong>{formatNumber(report.actual_output ?? 0)} sp</strong><small>{report.process_name || report.process_code || "Sản xuất"} · {report.machine_no || "--"}</small></span>
                  <span className={`worker-home-status ${status.className}`}>{status.className === "approved" ? <CheckCircle2 size={12} /> : status.className === "rejected" ? <XCircle size={12} /> : <Clock3 size={12} />}{status.label}</span>
                  <ChevronRight className="worker-home-report-arrow" size={16} />
                </button>
              );
            }) : <div className="worker-home-empty"><History size={22} /><strong>Chưa có báo cáo</strong><span>Tạo báo cáo đầu tiên trong hôm nay.</span></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
