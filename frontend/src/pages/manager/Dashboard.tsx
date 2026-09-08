import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, CheckCircle2, ClipboardList, Clock3, Factory, Network, Users, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import "./Dashboard.css";

type PeriodKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";
type ProcessOption = { id: number; process_code?: string; process_name: string };
type ProcessSummary = { process_id: number; process_code?: string; process_name: string; report_count: number; ok: number; ng: number };
type DailySummary = { work_date: string; report_count: number; ok: number; ng: number };
type DashboardSummary = { pending_count: number; approved_count: number; total_ok: number; total_ng: number; ng_rate: number; processes: ProcessOption[]; process_summary: ProcessSummary[]; daily_summary?: DailySummary[] };

const PERIOD_LABELS: Record<PeriodKey, string> = { today: "Hôm nay", yesterday: "Hôm qua", last7: "7 ngày gần nhất", thisMonth: "Tháng này", lastMonth: "Tháng trước" };
const EMPTY: DashboardSummary = { pending_count: 0, approved_count: 0, total_ok: 0, total_ng: 0, ng_rate: 0, processes: [], process_summary: [], daily_summary: [] };
const number = (value: number) => Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const percent = (value: number) => Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });
function localDate(date: Date) { const offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().split("T")[0]; }
function rangeFor(period: PeriodKey) { const now = new Date(); const start = new Date(now); const end = new Date(now); if (period === "yesterday") { start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); } else if (period === "last7") start.setDate(start.getDate() - 6); else if (period === "thisMonth") start.setDate(1); else if (period === "lastMonth") { start.setMonth(start.getMonth() - 1, 1); end.setDate(0); } return { from: localDate(start), to: localDate(end) }; }

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const user = useMemo(() => getStoredUser(), []);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const basePath = user?.role === "admin" ? "/admin" : user?.role === "lead" ? "/lead" : "/manager";
  const displayName = user?.full_name || user?.username || "Quản lý";

  useEffect(() => {
    const controller = new AbortController();
    const range = rangeFor(period);
    const key = `ktc:dashboard:${range.from}:${range.to}`;
    const cached = sessionStorage.getItem(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - Number(parsed?.savedAt || 0) < 15000 && parsed?.data) {
          setSummary({ ...EMPTY, ...parsed.data });
          setLoading(false);
          return () => controller.abort();
        }
      } catch { sessionStorage.removeItem(key); }
    }
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get("/dashboard/summary", { params: range, signal: controller.signal });
        const data = { ...EMPTY, ...(response.data?.data || {}) };
        setSummary(data);
        sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
      } catch (error) {
        if (!controller.signal.aborted) toast.showToast(getApiError(error, "Không thể tải dữ liệu tổng quan").message, "error");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [period, toast]);

  const processRows = useMemo(() => {
    const map = new Map(summary.process_summary.map((row) => [Number(row.process_id), row]));
    return summary.processes.map((process) => {
      const row = map.get(Number(process.id));
      return { id: Number(process.id), name: process.process_name, ok: Number(row?.ok || 0), ng: Number(row?.ng || 0), reports: Number(row?.report_count || 0) };
    }).filter((row) => row.ok + row.ng > 0).sort((a, b) => b.ok + b.ng - (a.ok + a.ng) || a.name.localeCompare(b.name, "vi"));
  }, [summary]);

  const total = Number(summary.total_ok || 0) + Number(summary.total_ng || 0);
  const okRate = total ? Number(summary.total_ok || 0) / total * 100 : 0;
  const maxProcessOutput = Math.max(1, ...processRows.map((row) => row.ok + row.ng));
  const maxProcessNg = Math.max(1, ...processRows.map((row) => row.ng));
  const activeProcesses = processRows.length;

  if (loading) return <main className="manager-dashboard dashboard-loading"><div className="dashboard-loading-heading"/><div className="dashboard-kpi-grid">{Array.from({ length: 4 }, (_, i) => <div className="dashboard-loading-card" key={i}/>)}</div><div className="dashboard-loading-chart"/><div className="dashboard-loading-chart"/></main>;

  return <main className="manager-dashboard">
    <header className="manager-dashboard-header">
      <div className="dashboard-title-block">
        <p className="dashboard-eyebrow">TỔNG QUAN SẢN XUẤT</p>
        <p className="dashboard-greeting">Chào bạn, {displayName}! <span aria-hidden="true">👋</span></p>
        <h1>Cùng theo dõi hoạt động sản xuất hiệu quả.</h1>
        <div className="dashboard-user-tags"><span>KTC-{user?.employee_code || user?.username || "—"}</span><span>Khu vực quản lý</span><span>Vai trò: {user?.role === "lead" ? "Lead" : user?.role === "manager" ? "Manager" : "Admin"}</span></div>
      </div>
      <label className="dashboard-period-filter"><span>Khoảng thời gian</span><div className="dashboard-period-control"><CalendarDays size={17}/><select value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>{Object.entries(PERIOD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div></label>
    </header>

    <section className="dashboard-kpi-grid">
      <article className="dashboard-kpi-card primary"><div className="dashboard-kpi-icon"><Factory size={20}/></div><span>Tổng sản lượng</span><strong>{number(total)}</strong><small>Trong khoảng đã chọn</small></article>
      <article className="dashboard-kpi-card success"><div className="dashboard-kpi-icon"><CheckCircle2 size={20}/></div><span>OK</span><strong>{number(summary.total_ok)}</strong><small>{percent(okRate)}% tổng sản lượng</small></article>
      <article className="dashboard-kpi-card danger"><div className="dashboard-kpi-icon"><XCircle size={20}/></div><span>NG</span><strong>{number(summary.total_ng)}</strong><small>{percent(summary.ng_rate)}% tổng sản lượng</small></article>
      <article className="dashboard-kpi-card warning"><div className="dashboard-kpi-icon"><ClipboardList size={20}/></div><span>Báo cáo chờ duyệt</span><strong>{number(summary.pending_count)}</strong><small>{number(summary.approved_count)} báo cáo đã duyệt</small></article>
    </section>

    <section className="dashboard-chart-grid">
      <article className="dashboard-panel dashboard-process-output">
        <div className="dashboard-panel-heading"><div><span>SẢN XUẤT</span><h2>Sản lượng theo công đoạn</h2></div><select aria-label="Khoảng thời gian biểu đồ" value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>{Object.entries(PERIOD_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        {activeProcesses ? <div className="process-output-chart"><div className="process-axis"><span>{number(maxProcessOutput)}</span><span>{number(maxProcessOutput * .75)}</span><span>{number(maxProcessOutput * .5)}</span><span>{number(maxProcessOutput * .25)}</span><span>0</span></div><div className="process-grid-lines"><i/><i/><i/><i/><i/></div><div className="process-bars">{processRows.slice(0, 9).map((row) => { const value = row.ok + row.ng; return <div className="process-bar-item" key={row.id}><strong>{number(value)}</strong><div className="process-bar-track"><b style={{ height: `${Math.max(5, value / maxProcessOutput * 100)}%` }}/></div><span title={row.name}>{row.name}</span></div>; })}</div></div> : <div className="dashboard-chart-empty">Chưa có dữ liệu sản lượng</div>}
      </article>

      <article className="dashboard-panel dashboard-quality-process">
        <div className="dashboard-panel-heading"><div><span>CHẤT LƯỢNG</span><h2>Tỷ lệ OK / NG theo công đoạn</h2></div><div className="dashboard-legend"><span><i className="green"/>OK</span><span><i className="red"/>NG</span></div></div>
        {activeProcesses ? <div className="quality-process-chart">{processRows.slice(0, 9).map((row) => { const totalProcess = row.ok + row.ng; const ok = totalProcess ? row.ok / totalProcess * 100 : 0; const ng = totalProcess ? row.ng / totalProcess * 100 : 0; return <div className="quality-process-row" key={row.id}><div className="quality-process-name" title={row.name}>{row.name}</div><div className="quality-process-bar"><b className="quality-ok" style={{ width: `${ok}%` }}>{ok >= 12 ? `${percent(ok)}%` : ""}</b><b className="quality-ng" style={{ width: `${ng}%` }}>{ng >= 10 ? `${percent(ng)}%` : ""}</b></div><div className="quality-process-value">{number(row.ok)} / {number(row.ng)}</div></div>; })}</div> : <div className="dashboard-chart-empty">Chưa có dữ liệu chất lượng</div>}
      </article>
    </section>

    <section className="dashboard-bottom-grid">
      <article className="dashboard-panel dashboard-pending-panel">
        <div className="dashboard-panel-heading"><div><span>CẦN XỬ LÝ</span><h2>Báo cáo chờ duyệt</h2></div><button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xem tất cả <ArrowUpRight size={13}/></button></div>
        <div className="dashboard-pending-list">
          {summary.pending_count > 0 ? <><div className="pending-summary"><span className="pending-count">{number(summary.pending_count)}</span><div><strong>Báo cáo đang chờ xử lý</strong><small>Kiểm tra và phê duyệt báo cáo sản xuất của công nhân.</small></div><button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xử lý <ArrowUpRight size={14}/></button></div><div className="pending-mini-stats"><span><Users size={16}/> {activeProcesses} công đoạn đang có dữ liệu</span><span><Clock3 size={16}/> Theo dõi theo từng công đoạn</span></div></> : <div className="dashboard-empty-success"><CheckCircle2 size={24}/><div><strong>Không có báo cáo chờ duyệt</strong><span>Tất cả báo cáo hiện đã được xử lý.</span></div></div>}
        </div>
      </article>

      <article className="dashboard-panel dashboard-ng-process-panel">
        <div className="dashboard-panel-heading"><div><span>NG</span><h2>NG theo công đoạn</h2></div></div>
        {activeProcesses ? <div className="ng-process-list">{processRows.filter((row) => row.ng > 0).slice(0, 6).map((row) => <div className="ng-process-row" key={row.id}><div><strong>{row.name}</strong><span>{number(row.ng)} NG</span></div><div className="ng-process-track"><b style={{ width: `${row.ng / maxProcessNg * 100}%` }}/></div></div>)}{!processRows.some((row) => row.ng > 0) && <div className="dashboard-chart-empty">Chưa có sản phẩm NG</div>}</div> : <div className="dashboard-chart-empty">Chưa có dữ liệu</div>}
      </article>
    </section>
  </main>;
}
