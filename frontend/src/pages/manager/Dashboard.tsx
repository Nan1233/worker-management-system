import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Factory,
  Network,
  TrendingUp,
  XCircle,
} from "lucide-react";
import api from "../../services/api";
import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import { getStoredUser } from "../../utils/authStorage";
import { usePermissions } from "../../hooks/usePermissions";
import "./Dashboard.css";

const formatNumber = (value: number) =>
  Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

const toLocalDate = (date: Date): string => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().split("T")[0];
};

type PeriodKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";
type ProcessOption = { id: number; process_code?: string; process_name: string };
type ProcessSummary = {
  process_id: number;
  process_code?: string;
  process_name: string;
  report_count: number;
  ok: number;
  ng: number;
};
type ShiftSummary = { shift: string; report_count: number; ok: number; ng: number };
type DashboardSummary = {
  pending_count: number;
  approved_count: number;
  total_ok: number;
  total_ng: number;
  ng_rate: number;
  processes: ProcessOption[];
  process_summary: ProcessSummary[];
  shift_summary: ShiftSummary[];
};

const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hôm nay",
  yesterday: "Hôm qua",
  last7: "7 ngày gần nhất",
  thisMonth: "Tháng này",
  lastMonth: "Tháng trước",
};

const EMPTY_SUMMARY: DashboardSummary = {
  pending_count: 0,
  approved_count: 0,
  total_ok: 0,
  total_ng: 0,
  ng_rate: 0,
  processes: [],
  process_summary: [],
  shift_summary: [],
};

const getPeriodRange = (period: PeriodKey) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (period === "last7") {
    start.setDate(start.getDate() - 6);
  } else if (period === "thisMonth") {
    start.setDate(1);
  } else if (period === "lastMonth") {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
  }

  return { from: toLocalDate(start), to: toLocalDate(end) };
};

const makePoints = (values: number[], maxValue: number) =>
  values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : 5 + (index * 90) / Math.max(1, values.length - 1);
      const y = 88 - (value / Math.max(1, maxValue)) * 72;
      return `${x},${y}`;
    })
    .join(" ");

function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("today");
  const currentUser = useMemo(() => getStoredUser(), []);
  const { can } = usePermissions();
  const basePath =
    currentUser?.role === "admin" ? "/admin" : currentUser?.role === "lead" ? "/lead" : "/manager";

  useEffect(() => {
    const controller = new AbortController();
    const range = getPeriodRange(period);
    const cacheKey = `ktc:dashboard:${range.from}:${range.to}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - Number(parsed?.savedAt || 0) < 15000 && parsed?.data) {
          setSummary({ ...EMPTY_SUMMARY, ...parsed.data });
          setLoading(false);
          return () => controller.abort();
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get("/dashboard/summary", {
          params: range,
          signal: controller.signal,
        });
        const data = { ...EMPTY_SUMMARY, ...(response.data?.data || {}) };
        setSummary(data);
        sessionStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.showToast(getApiError(error, "Không thể tải dữ liệu tổng quan").message, "error");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [period, toast]);

  const processData = useMemo(() => {
    const byId = new Map(summary.process_summary.map((item) => [Number(item.process_id), item]));
    return summary.processes
      .map((process) => {
        const value = byId.get(Number(process.id));
        return {
          id: Number(process.id),
          name: process.process_name,
          code: process.process_code,
          ok: Number(value?.ok || 0),
          ng: Number(value?.ng || 0),
          count: Number(value?.report_count || 0),
        };
      })
      .sort((a, b) => (b.ok + b.ng) - (a.ok + a.ng) || a.name.localeCompare(b.name, "vi"));
  }, [summary]);

  const processWithData = processData.filter((item) => item.count > 0 || item.ok + item.ng > 0);
  const shiftData = summary.shift_summary.map((item) => {
    const ok = Number(item.ok || 0);
    const ng = Number(item.ng || 0);
    const total = ok + ng;
    return { ...item, ok, ng, total, ngRate: total ? (ng / total) * 100 : 0 };
  });

  const totalOutput = Number(summary.total_ok || 0) + Number(summary.total_ng || 0);
  const okRate = totalOutput ? (Number(summary.total_ok || 0) / totalOutput) * 100 : 0;
  const maxShiftOutput = Math.max(1, ...shiftData.map((item) => item.total));
  const maxProcessOutput = Math.max(1, ...processWithData.map((item) => item.ok + item.ng));
  const displayName = currentUser?.full_name || currentUser?.username || "Quản lý";
  const shortName = displayName.split(" ").slice(-2).join(" ");
  const totalNg = Number(summary.total_ng || 0);

  const totalPoints = makePoints(shiftData.map((item) => item.total), maxShiftOutput);
  const okPoints = makePoints(shiftData.map((item) => item.ok), maxShiftOutput);
  const ngPoints = makePoints(shiftData.map((item) => item.ng), maxShiftOutput);

  const ngSegments = useMemo(() => {
    if (!totalNg) return { background: "#edf2f7", legend: [] as { label: string; value: number; rate: number }[] };
    let cursor = 0;
    const palette = ["#2877d6", "#2c9b68", "#e6b04a", "#e05b63", "#7c8ca1"];
    const rows = shiftData
      .filter((item) => item.ng > 0)
      .slice(0, 5)
      .map((item) => ({ label: `Ca ${item.shift}`, value: item.ng, rate: (item.ng / totalNg) * 100 }));
    const stops = rows.map((row, index) => {
      const start = cursor;
      cursor += row.rate;
      return `${palette[index % palette.length]} ${start}% ${cursor}%`;
    });
    return { background: `conic-gradient(${stops.join(",")})`, legend: rows };
  }, [shiftData, totalNg]);

  if (loading) {
    return (
      <main className="manager-dashboard">
        <div className="dashboard-loading-title" />
        <div className="dashboard-kpi-grid">
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="dashboard-loading-card" />)}
        </div>
      </main>
    );
  }

  return (
    <main className="manager-dashboard">
      <header className="manager-dashboard-header">
        <div>
          <span className="dashboard-eyebrow">KTC (HANOI) CO., LTD.</span>
          <p className="dashboard-greeting">Xin chào, {shortName} <span aria-hidden="true">👋</span></p>
          <h1>KTC Production Dashboard</h1>
        </div>
        <label className="dashboard-period-filter">
          <span>Khoảng thời gian</span>
          <div className="dashboard-period-control">
            <CalendarDays size={16} />
            <select value={period} onChange={(event) => setPeriod(event.target.value as PeriodKey)}>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </label>
      </header>

      {summary.pending_count > 0 && can("REPORT_PENDING_VIEW") && (
        <section className="dashboard-attention">
          <div className="dashboard-attention-icon"><Clock3 size={18} /></div>
          <div className="dashboard-attention-copy">
            <strong>{formatNumber(summary.pending_count)} báo cáo đang chờ duyệt</strong>
            <span>Ưu tiên xử lý các báo cáo mới trước khi xem thống kê.</span>
          </div>
          <button type="button" onClick={() => navigate(`${basePath}/reports`)}>Duyệt báo cáo</button>
        </section>
      )}

      <section className="dashboard-kpi-grid">
        <article className="dashboard-kpi-card primary">
          <div className="dashboard-kpi-icon"><Factory size={19} /></div>
          <span>Tổng sản lượng</span>
          <strong>{formatNumber(totalOutput)}</strong>
          <small>Trong khoảng đã chọn</small>
        </article>
        <article className="dashboard-kpi-card success">
          <div className="dashboard-kpi-icon"><CheckCircle2 size={19} /></div>
          <span>OK</span>
          <strong>{formatNumber(summary.total_ok)}</strong>
          <small>{okRate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% tổng sản lượng</small>
        </article>
        <article className="dashboard-kpi-card danger">
          <div className="dashboard-kpi-icon"><XCircle size={19} /></div>
          <span>NG</span>
          <strong>{formatNumber(summary.total_ng)}</strong>
          <small>{Number(summary.ng_rate || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% tổng sản lượng</small>
        </article>
        <article className="dashboard-kpi-card info">
          <div className="dashboard-kpi-icon"><TrendingUp size={19} /></div>
          <span>Tỷ lệ OK</span>
          <strong>{okRate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong>
          <small>Chất lượng sản xuất</small>
        </article>
        <article className="dashboard-kpi-card neutral">
          <div className="dashboard-kpi-icon"><Network size={19} /></div>
          <span>Công đoạn</span>
          <strong>{processData.length}</strong>
          <small>{processWithData.length} công đoạn đang có dữ liệu</small>
        </article>
        <article className="dashboard-kpi-card warning">
          <div className="dashboard-kpi-icon"><Clock3 size={19} /></div>
          <span>Chờ phê duyệt</span>
          <strong>{formatNumber(summary.pending_count)}</strong>
          <small>{formatNumber(summary.approved_count)} báo cáo đã duyệt</small>
        </article>
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-panel dashboard-daily-panel">
          <div className="dashboard-panel-heading">
            <div><span>PHÂN TÍCH SẢN XUẤT</span><h2>Sản lượng theo ca</h2></div>
            <div className="dashboard-legend">
              <span><i className="legend-blue" />Sản lượng</span>
              <span><i className="legend-green" />OK</span>
              <span><i className="legend-red" />NG</span>
            </div>
          </div>
          {shiftData.length === 0 ? (
            <div className="dashboard-empty">Chưa có dữ liệu trong khoảng thời gian này</div>
          ) : (
            <div className="dashboard-line-chart">
              <div className="dashboard-line-axis"><span>{formatNumber(maxShiftOutput)}</span><span>{formatNumber(maxShiftOutput * .75)}</span><span>{formatNumber(maxShiftOutput * .5)}</span><span>{formatNumber(maxShiftOutput * .25)}</span><span>0</span></div>
              <div className="dashboard-line-grid"><i /><i /><i /><i /><i /></div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <polyline className="chart-line-total" points={totalPoints} />
                <polyline className="chart-line-ok" points={okPoints} />
                <polyline className="chart-line-ng" points={ngPoints} />
                {shiftData.map((item, index) => {
                  const x = shiftData.length === 1 ? 50 : 5 + (index * 90) / Math.max(1, shiftData.length - 1);
                  const y = 88 - (item.total / maxShiftOutput) * 72;
                  return <circle key={`total-${item.shift}`} className="chart-dot-total" cx={x} cy={y} r="1.7" />;
                })}
              </svg>
              <div className="dashboard-line-labels">
                {shiftData.map((item) => <span key={item.shift}>Ca {item.shift}</span>)}
              </div>
            </div>
          )}
        </article>

        <article className="dashboard-panel dashboard-quality-panel">
          <div className="dashboard-panel-heading"><div><span>CHẤT LƯỢNG</span><h2>Tỷ lệ OK / NG</h2></div></div>
          <div className="dashboard-donut-wrap">
            <div className="dashboard-donut" style={{ background: `conic-gradient(#2c9b68 0 ${okRate}%, #e05b63 ${okRate}% 100%)` }}>
              <div><strong>{okRate.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</strong><span>OK</span></div>
            </div>
          </div>
          <div className="dashboard-quality-stats">
            <div><i className="legend-green" /><span>OK</span><b>{formatNumber(summary.total_ok)}</b></div>
            <div><i className="legend-red" /><span>NG</span><b>{formatNumber(summary.total_ng)}</b></div>
          </div>
        </article>

        <article className="dashboard-panel dashboard-process-panel">
          <div className="dashboard-panel-heading">
            <div><span>HIỆU SUẤT CÔNG ĐOẠN</span><h2>Sản lượng theo công đoạn</h2></div>
            <button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xem báo cáo <ArrowUpRight size={13} /></button>
          </div>
          {processWithData.length === 0 ? (
            <div className="dashboard-empty">Chưa có dữ liệu</div>
          ) : (
            <div className="dashboard-process-chart">
              {processWithData.slice(0, 9).map((item) => {
                const total = item.ok + item.ng;
                const height = Math.max(7, (total / maxProcessOutput) * 100);
                return (
                  <div className="dashboard-process-column" key={item.id} title={`${item.name}: ${formatNumber(total)}`}>
                    <div className="dashboard-process-value">{formatNumber(total)}</div>
                    <div className="dashboard-process-track"><span style={{ height: `${height}%` }} /></div>
                    <strong>{item.name}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="dashboard-panel dashboard-ng-panel">
          <div className="dashboard-panel-heading"><div><span>NG QUALITY</span><h2>Phân bố NG</h2></div></div>
          <div className="dashboard-ng-visual">
            <div className="dashboard-pie" style={{ background: ngSegments.background }} />
            <div className="dashboard-pie-legend">
              {ngSegments.legend.length ? ngSegments.legend.map((row, index) => (
                <span key={row.label}><i className={`ng-pie-dot ng-pie-dot-${index}`} /><b>{row.label}</b><em>{row.rate.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}% ({formatNumber(row.value)})</em></span>
              )) : <span className="dashboard-ng-empty">Chưa có sản phẩm NG</span>}
            </div>
          </div>
          <div className="dashboard-ng-total"><strong>{formatNumber(summary.total_ng)}</strong><span>Tổng sản phẩm NG</span></div>
        </article>
      </section>

      <section className="dashboard-panel dashboard-activity-panel">
        <div className="dashboard-panel-heading">
          <div><span>ACTIVITY</span><h2>Hoạt động gần đây</h2></div>
          <button type="button" onClick={() => navigate(`${basePath}/reports`)}>Xem tất cả <ArrowUpRight size={13} /></button>
        </div>
        <div className="dashboard-activity-list">
          {processWithData.slice(0, 3).map((item, index) => (
            <div className="dashboard-activity-row" key={item.id}>
              <span className={`dashboard-activity-icon ${index === 0 ? "success" : index === 1 ? "info" : "warning"}`}><Activity size={15} /></span>
              <div>
                <strong>{index === 0 ? "Đã ghi nhận sản lượng" : index === 1 ? "Cập nhật báo cáo sản xuất" : "Đang theo dõi công đoạn"} · {item.name}</strong>
                <small>{item.count} báo cáo · OK {formatNumber(item.ok)} · NG {formatNumber(item.ng)}</small>
              </div>
              <b>{index === 0 ? "Mới" : "Đã ghi nhận"}</b>
            </div>
          ))}
          {processWithData.length === 0 && <div className="dashboard-empty">Chưa có hoạt động gần đây</div>}
        </div>
      </section>
    </main>
  );
}

export default Dashboard;
