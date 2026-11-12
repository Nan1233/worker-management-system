import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, BarChart3, CheckCircle2, ClipboardCheck, Clock3, Layers3, PackageCheck, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { getApiError } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import "./Dashboard.css";

type PeriodKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";
type DailyReport = { work_date: string; report_count: number; ok: number; ng: number };
type DashboardSummary = {
  pending_count: number; approved_count: number; total_ok: number; total_ng: number;
  daily_summary?: DailyReport[];
  worker_performance?: { actual_worker_hours: number };
};
type PendingReport = {
  id: number; work_date?: string; worker_name?: string; full_name?: string;
  worker_code?: string; process_name?: string; process_code?: string;
  actual_output?: number; tt_ok?: number; tt_ng?: number;
};
const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hôm nay", yesterday: "Hôm qua", last7: "7 ngày gần nhất",
  thisMonth: "Tháng này", lastMonth: "Tháng trước",
};
const EMPTY: DashboardSummary = { pending_count: 0, approved_count: 0, total_ok: 0, total_ng: 0 };
const safeNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const fmt = (value: unknown) => safeNumber(value).toLocaleString("vi-VN", { maximumFractionDigits: 2 });
const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function rangeFor(period: PeriodKey) {
  const now = new Date(), start = new Date(now), end = new Date(now);
  if (period === "yesterday") {
    start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1);
  } else if (period === "last7") {
    start.setDate(start.getDate() - 6);
  } else if (period === "thisMonth") {
    start.setDate(1);
  } else if (period === "lastMonth") {
    start.setMonth(start.getMonth() - 1, 1); end.setDate(0);
  }
  return { from: isoDate(start), to: isoDate(end) };
}
function dateText(value?: string) {
  const iso = String(value || "").slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}` : iso || "—";
}
const reportTotal = (report: PendingReport) => {
  const ok = safeNumber(report.tt_ok), ng = safeNumber(report.tt_ng);
  const actual = Number(report.actual_output);
  return Number.isFinite(actual) && actual >= 0 ? actual : ok + ng;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useMemo(() => getStoredUser(), []);
  const basePath = user?.role === "admin" ? "/admin" : user?.role === "admin_ops" ? "/admin-ops" : user?.role === "lead" ? "/lead" : "/manager";
  const name = user?.full_name || user?.username || "Quản lý";

  const [period, setPeriod] = useState<PeriodKey>("today");
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY);
  const [pending, setPending] = useState<PendingReport[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [pendingRetryKey, setPendingRetryKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const summarySequence = useRef(0);
  const pendingSequence = useRef(0);
  const selectedRange = useMemo(() => rangeFor(period), [period, retryKey]);
  const from = selectedRange.from, to = selectedRange.to;

  useEffect(() => {
    const seq = ++summarySequence.current;
    const controller = new AbortController();
    let finished = false;
    setSummaryLoading(true);
    setSummaryError(null);
    const timeout = window.setTimeout(() => {
      if (finished || controller.signal.aborted) return;
      setSummaryError("Máy chủ phản hồi quá lâu. Vui lòng thử tải lại.");
      finished = true;
      controller.abort();
      setSummaryLoading(false);
    }, 20000);
    void api.get("/dashboard/summary", {
      params: { from, to }, signal: controller.signal,
    }).then(response => {
      if (controller.signal.aborted || seq !== summarySequence.current) return;
      const payload = response.data?.data;
      if (!payload || typeof payload !== "object") throw new Error("Máy chủ trả về dữ liệu thống kê không hợp lệ.");
      setSummary({ ...EMPTY, ...payload });
      setLastUpdated(new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }));
    }).catch(error => {
      if (controller.signal.aborted || seq !== summarySequence.current) return;
      setSummaryError(getApiError(error, "Không thể tải dữ liệu tổng quan").message);
    }).finally(() => {
      finished = true;
      window.clearTimeout(timeout);
      if (!controller.signal.aborted && seq === summarySequence.current) setSummaryLoading(false);
    });
    return () => {
      ++summarySequence.current;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [from, to, retryKey]);

  useEffect(() => {
    const seq = ++pendingSequence.current;
    const controller = new AbortController();
    setPendingLoading(true);
    setPendingError(null);
    void api.get("/production-temp/pending", {
      params: { date_from: from, date_to: to, page: 1, page_size: 5, include_meta: 1 },
      signal: controller.signal,
    }).then(response => {
      if (controller.signal.aborted || seq !== pendingSequence.current) return;
      const payload = response.data?.data;
      if (!Array.isArray(payload) && !Array.isArray(response.data)) {
        throw new Error("Danh sách chờ duyệt không hợp lệ.");
      }
      const list = (Array.isArray(payload) ? payload : response.data) as PendingReport[];
      setPending(list.slice(0, 5));
    }).catch(error => {
      if (controller.signal.aborted || seq !== pendingSequence.current) return;
      setPendingError(getApiError(error, "Không thể tải danh sách chờ duyệt").message);
    }).finally(() => {
      if (!controller.signal.aborted && seq === pendingSequence.current) setPendingLoading(false);
    });
    return () => {
      ++pendingSequence.current;
      controller.abort();
    };
  }, [from, to, retryKey, pendingRetryKey]);

  const days = useMemo(() => {
    const items = Array.isArray(summary.daily_summary) ? summary.daily_summary : [];
    return items
      .filter(item => /^\d{4}-\d{2}-\d{2}/.test(String(item.work_date || "")))
      .slice().sort((a, b) => String(a.work_date).localeCompare(String(b.work_date)))
      .slice(-10);
  }, [summary.daily_summary]);
  const maxDaily = Math.max(1, ...days.map(item => safeNumber(item.ok) + safeNumber(item.ng)));
  const ok = safeNumber(summary.total_ok);
  const ng = safeNumber(summary.total_ng);
  const total = ok + ng;
  const hours = safeNumber(summary.worker_performance?.actual_worker_hours);
  const rangeLabel = `${dateText(from)} – ${dateText(to)}`;
  const refreshAll = () => { setRetryKey(value => value + 1); };

  if (summaryLoading && !lastUpdated) {
    return <main className="manager-dashboard dashboard-loading" aria-busy="true" aria-label="Đang tải dữ liệu tổng quan">
      <div className="dashboard-loading-heading"/><div className="dashboard-loading-body"/>
    </main>;
  }
  if (summaryError && !lastUpdated) {
    return <main className="manager-dashboard dashboard-error-state">
      <section role="alert" className="dashboard-error-card">
        <span className="dashboard-error-icon"><AlertTriangle size={22}/></span>
        <div><h1>Không thể tải dữ liệu tổng quan</h1><p>{summaryError}</p><small>Vui lòng kiểm tra kết nối hoặc phiên đăng nhập.</small></div>
        <button type="button" onClick={refreshAll}>Thử tải lại</button>
      </section>
    </main>;
  }

  return <main className="manager-dashboard manager-dashboard-compact manager-dashboard-review" aria-busy={summaryLoading}>
    <section className="dashboard-welcome">
      <div><h1>Chào bạn, {name}!</h1><p>Chúc bạn một ngày làm việc hiệu quả.</p>
        <div className="dashboard-tags"><span>KTC-{user?.worker_code || user?.username || "—"}</span>
          <span>Vai trò: {user?.role === "admin_ops" ? "Admin vận hành" : user?.role === "lead" ? "Lead" : user?.role === "manager" ? "Manager" : "Admin"}</span>
        </div>
      </div>
    </section>
    <div className="dashboard-period-context">
      <span>Phạm vi dữ liệu</span><strong>{PERIOD_LABELS[period]}</strong>
      <span className="dashboard-period-range">{rangeLabel}</span>
      <select aria-label="Chọn khoảng thời gian" value={period} onChange={e => { setPeriod(e.target.value as PeriodKey); setLastUpdated(null); }}>
        {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button className="dashboard-refresh-button" type="button" disabled={summaryLoading} onClick={refreshAll}>
        <RefreshCw size={14}/>{summaryLoading ? "Đang tải..." : "Làm mới"}
      </button>
    </div>
    {summaryError && <div className="dashboard-inline-error" role="alert">
      <AlertTriangle size={16}/><span>{summaryError} Số liệu đang hiển thị là lần tải thành công gần nhất.</span>
      <button type="button" onClick={refreshAll}>Thử lại</button>
    </div>}
    <section className="dashboard-kpi-row dashboard-kpi-row-compact" aria-label="Các chỉ số sản xuất">
      <article className="dashboard-kpi-card"><span><PackageCheck size={18}/></span><div><small>Sản lượng OK</small><strong>{fmt(ok)}</strong></div></article>
      <article className="dashboard-kpi-card"><span><AlertTriangle size={18}/></span><div><small>Sản lượng NG</small><strong>{fmt(ng)}</strong></div></article>
      <article className="dashboard-kpi-card"><span><Clock3 size={18}/></span><div><small>Tổng giờ công</small><strong>{fmt(hours)} <em>giờ</em></strong></div></article>
      <article className="dashboard-kpi-card"><span><ClipboardCheck size={18}/></span><div><small>Chờ duyệt</small><strong>{fmt(summary.pending_count)}</strong></div></article>
    </section>
    <section className="dashboard-compact-main">
      <article className="dashboard-panel dashboard-daily-panel">
        <div className="dashboard-panel-title"><div><span>SẢN XUẤT</span><h2>Sản lượng OK / NG theo ngày</h2></div>
          <span className="dashboard-chart-period">{PERIOD_LABELS[period]}</span>
        </div>
        <div className="dashboard-daily-legend"><span><i className="daily-ok-dot"/>OK</span><span><i className="daily-ng-dot"/>NG</span></div>
        {days.length ? <div className="dashboard-daily-chart" role="img" aria-label={`Sản lượng theo ${days.length} ngày gần nhất trong kỳ đã chọn`}>
          {days.map(day => {
            const dailyOk = safeNumber(day.ok), dailyNg = safeNumber(day.ng), value = dailyOk + dailyNg;
            return <div className="dashboard-daily-column" key={day.work_date}
              title={`${dateText(day.work_date)} · OK ${fmt(dailyOk)} · NG ${fmt(dailyNg)}`}>
              <strong>{fmt(value)}</strong>
              <div className="dashboard-daily-stack">
                <i className="daily-ok-bar" style={{ height: `${dailyOk / maxDaily * 100}%` }}/>
                <i className="daily-ng-bar" style={{ height: `${dailyNg / maxDaily * 100}%` }}/>
              </div>
              <span className="dashboard-chart-date">{dateText(day.work_date)}</span>
            </div>;
          })}
        </div> : <div className="dashboard-compact-empty"><BarChart3 size={24}/><strong>Chưa có dữ liệu sản lượng</strong><span>Không có báo cáo sản xuất trong khoảng thời gian đã chọn.</span></div>}
        <div className="dashboard-daily-summary"><span>Tổng sản lượng: <b>{fmt(total)}</b></span>
          <span>Tỷ lệ NG: <b>{total ? fmt(ng / total * 100) : "0"}%</b></span>
        </div>
      </article>
      <article className="dashboard-panel dashboard-focus-panel">
        <div className="dashboard-panel-title"><div><span>QUẢN LÝ SẢN XUẤT</span><h2>Công việc cần chú ý</h2></div></div>
        <button className="dashboard-focus-row" type="button" onClick={() => navigate(`${basePath}/reports`)}>
          <span className="dashboard-focus-icon"><ClipboardCheck size={18}/></span>
          <span><strong>Báo cáo chờ duyệt</strong><small>Các báo cáo cần kiểm tra và xử lý</small></span>
          <b>{fmt(summary.pending_count)}</b><ArrowUpRight size={16}/>
        </button>
        {basePath === "/manager" && <button className="dashboard-focus-row" type="button" onClick={() => navigate("/manager/edit-proposals")}>
          <span className="dashboard-focus-icon"><RefreshCw size={18}/></span>
          <span><strong>Yêu cầu chỉnh sửa</strong><small>Kiểm tra đề xuất thay đổi báo cáo</small></span><ArrowUpRight size={16}/>
        </button>}
        <button className="dashboard-process-entry" type="button" onClick={() => navigate(`${basePath}/processes`)}>
          <span className="dashboard-process-entry-icon"><Layers3 size={20}/></span>
          <span><strong>Theo dõi công đoạn</strong><small>Chọn công đoạn để xem tình hình chi tiết</small></span><ArrowUpRight size={18}/>
        </button>
      </article>
    </section>
    <section className="dashboard-panel pending-table-panel dashboard-pending-compact">
      <div className="dashboard-panel-title"><div><span>CẦN XỬ LÝ</span><h2>Báo cáo chờ duyệt gần đây</h2></div>
        <button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xem tất cả <ArrowUpRight size={14}/></button>
      </div>
      {pendingLoading ? <div className="dashboard-table-state" role="status">Đang tải danh sách chờ duyệt...</div>
      : pendingError ? <div className="dashboard-table-state dashboard-pending-error" role="alert">
          <span>{pendingError}</span><button type="button" onClick={() => setPendingRetryKey(value => value + 1)}>Thử tải lại</button>
        </div>
      : <div className="pending-table-wrap" role="region" aria-label="Bảng báo cáo chờ duyệt gần đây, có thể cuộn ngang" tabIndex={0}>
        <table><caption className="dashboard-table-caption">Năm báo cáo chờ duyệt gần đây nhất trong kỳ</caption>
          <thead><tr><th>Ngày</th><th>Công nhân</th><th>Công đoạn</th><th>Sản lượng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>{pending.length ? pending.map(report => <tr key={report.id}>
            <td>{dateText(report.work_date)}</td><td>{report.full_name || report.worker_name || report.worker_code || "—"}</td>
            <td>{report.process_name || report.process_code || "—"}</td><td>{fmt(reportTotal(report))}</td>
            <td><span className="pending-status">Chờ duyệt</span></td>
            <td><button className="view-btn" type="button" aria-label={`Xem báo cáo #${report.id}`} onClick={() => navigate(`${basePath}/reports`)}>Xem</button></td>
          </tr>) : <tr><td colSpan={6} className="table-empty">Không có báo cáo chờ duyệt trong kỳ</td></tr>}</tbody>
        </table>
      </div>}
    </section>
    <div className="dashboard-data-footnote"><CheckCircle2 size={14}/>
      <span>Dữ liệu theo phạm vi quyền được cấp · {fmt(summary.approved_count)} báo cáo đã duyệt trong kỳ
        {lastUpdated ? ` · Cập nhật lúc ${lastUpdated}` : ""}</span>
    </div>
  </main>;
}
