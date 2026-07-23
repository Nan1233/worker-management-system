import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../../api/axios";
import AppIcon from "../../components/common/AppIcon";
import { useToast } from "../../components/feedback/toastContext";
import { getApiError } from "../../utils/apiError";
import "./Dashboard.css";

const formatNumber = (value: number) =>
    Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

const toLocalDate = (date: Date): string => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().split("T")[0];
};

type PeriodKey = "today" | "yesterday" | "last7" | "thisMonth" | "lastMonth";

type ProcessOption = {
    id: number;
    process_code?: string;
    process_name: string;
};

type ProcessSummary = {
    process_id: number;
    process_code?: string;
    process_name: string;
    report_count: number;
    ok: number;
    ng: number;
};

type ShiftSummary = {
    shift: string;
    report_count: number;
    ok: number;
    ng: number;
};

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
    lastMonth: "Tháng trước"
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

const EMPTY_SUMMARY: DashboardSummary = {
    pending_count: 0,
    approved_count: 0,
    total_ok: 0,
    total_ng: 0,
    ng_rate: 0,
    processes: [],
    process_summary: [],
    shift_summary: []
};

function Dashboard() {
    const navigate = useNavigate();
    const toast = useToast();
    const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState<PeriodKey>("today");

    const currentUser = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("user") || "null") as { role?: string } | null;
        } catch {
            return null;
        }
    }, []);

    const basePath = currentUser?.role === "admin"
        ? "/admin"
        : currentUser?.role === "lead"
            ? "/lead"
            : "/manager";

    useEffect(() => {
        const controller = new AbortController();
        const load = async () => {
            setLoading(true);
            try {
                const range = getPeriodRange(period);
                const response = await api.get("/dashboard/summary", {
                    params: range,
                    signal: controller.signal
                });
                setSummary({ ...EMPTY_SUMMARY, ...(response.data?.data || {}) });
            } catch (error) {
                if (controller.signal.aborted) return;
                toast.showToast(getApiError(error, "Không thể tải dữ liệu tổng quan").message, "error");
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void load();
        return () => controller.abort();
    }, [period, toast]);

    const processData = useMemo(() => {
        const byId = new Map(summary.process_summary.map(item => [Number(item.process_id), item]));
        return summary.processes.map(process => {
            const value = byId.get(Number(process.id));
            return {
                id: Number(process.id),
                name: process.process_name,
                code: process.process_code,
                ok: Number(value?.ok || 0),
                ng: Number(value?.ng || 0),
                count: Number(value?.report_count || 0)
            };
        }).sort((a, b) => (b.ok + b.ng) - (a.ok + a.ng) || a.name.localeCompare(b.name, "vi"));
    }, [summary]);

    const processWithData = processData.filter(item => item.count > 0 || item.ok + item.ng > 0);
    const processWithoutData = processData.filter(item => item.count === 0 && item.ok + item.ng === 0);
    const maxProcessOutput = Math.max(1, ...processWithData.map(item => item.ok + item.ng));
    const NG_SCALE_MAX = 1;
    const shiftChartData = summary.shift_summary.map(item => {
        const ok = Number(item.ok || 0);
        const ng = Number(item.ng || 0);
        const total = ok + ng;
        return {
            ...item,
            ok,
            ng,
            total,
            ngRate: total > 0 ? (ng / total) * 100 : 0
        };
    });
    const maxShiftOutput = Math.max(1, ...shiftChartData.map(item => item.total));

    if (loading) {
        return (
            <main className="manager-dashboard">
                <div className="dashboard-skeleton dashboard-skeleton-title" />
                <div className="dashboard-kpi-grid">
                    {[1, 2, 3, 4].map(item => <div key={item} className="dashboard-skeleton dashboard-skeleton-card" />)}
                </div>
            </main>
        );
    }

    return (
        <main className="manager-dashboard">
            <header className="manager-dashboard-header">
                <h1>Tổng quan sản xuất</h1>
                <label className="dashboard-period-filter" aria-label="Khoảng thời gian">
                    <select value={period} onChange={event => setPeriod(event.target.value as PeriodKey)}>
                        {Object.entries(PERIOD_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>
            </header>

            <section className="dashboard-kpi-grid">
                <article className="dashboard-kpi-card">
                    <div className="dashboard-kpi-icon"><AppIcon name="pending" size={24} /></div>
                    <div><span>Chờ duyệt</span><strong>{formatNumber(summary.pending_count)}</strong></div>
                </article>
                <article className="dashboard-kpi-card success">
                    <div className="dashboard-kpi-icon"><AppIcon name="ok" size={24} /></div>
                    <div><span>Sản lượng OK</span><strong>{formatNumber(summary.total_ok)}</strong></div>
                </article>
                <article className="dashboard-kpi-card danger">
                    <div className="dashboard-kpi-icon"><AppIcon name="warning" size={24} /></div>
                    <div>
                        <span>Tỷ lệ NG</span>
                        <strong>{Number(summary.ng_rate || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%</strong>
                        <small>{formatNumber(summary.total_ng)} sản phẩm NG</small>
                    </div>
                </article>
                <article className="dashboard-kpi-card info">
                    <div className="dashboard-kpi-icon"><AppIcon name="approved" size={24} /></div>
                    <div>
                        <span>Báo cáo đã duyệt</span>
                        <strong>{formatNumber(summary.approved_count)}</strong>
                        <small>{processWithData.length}/{processData.length} công đoạn có dữ liệu</small>
                    </div>
                </article>
            </section>

            <section className="dashboard-content-grid">
                <article className="dashboard-panel dashboard-chart-panel">
                    <div className="dashboard-panel-heading"><h2>Sản lượng theo công đoạn</h2></div>
                    {processWithData.length === 0 ? (
                        <div className="dashboard-empty">Chưa có dữ liệu trong khoảng thời gian này</div>
                    ) : (
                        <div className="dashboard-process-chart">
                            {processWithData.map((item, index) => {
                                const total = item.ok + item.ng;
                                const ngRate = total > 0 ? (item.ng / total) * 100 : 0;
                                const outputWidth = total > 0 ? Math.max(1.5, (total / maxProcessOutput) * 100) : 0;
                                const ngWidth = Math.min(100, (ngRate / NG_SCALE_MAX) * 100);
                                const qualityClass = ngRate >= 1 ? "critical" : ngRate >= 0.3 ? "warning" : "good";
                                return (
                                    <div className="dashboard-process-rank" key={item.id}>
                                        <span className="dashboard-rank-number">{index + 1}</span>
                                        <div className="dashboard-chart-label">
                                            <strong>{item.name}</strong>
                                            <span>{item.count} báo cáo</span>
                                        </div>
                                        <div className="dashboard-process-main">
                                            <div className="dashboard-process-metric">
                                                <span className="dashboard-process-metric-name">Sản lượng</span>
                                                <div className="dashboard-ranking-track" title={`Tổng ${total} · OK ${item.ok} · NG ${item.ng}`}>
                                                    <span className="dashboard-ranking-bar" style={{ width: `${outputWidth}%` }} />
                                                </div>
                                            </div>
                                            <div className="dashboard-process-metric quality">
                                                <span className="dashboard-process-metric-name">Tỷ lệ NG</span>
                                                <div className="dashboard-quality-track" title={`Tỷ lệ NG ${ngRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`}>
                                                    <span
                                                        className={`dashboard-quality-bar ${qualityClass}`}
                                                        style={{ width: `${ngWidth}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="dashboard-process-meta">
                                                <span>OK {formatNumber(item.ok)}</span>
                                                <span>NG {formatNumber(item.ng)}</span>
                                            </div>
                                        </div>
                                        <div className="dashboard-chart-value">
                                            <strong>{formatNumber(total)}</strong>
                                            <span className={`dashboard-ng-badge ${qualityClass}`}>{ngRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% NG</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {processWithoutData.length > 0 && (
                        <div className="dashboard-zero-processes">
                            <span>Chưa phát sinh:</span>
                            {processWithoutData.map(item => <i key={item.id}>{item.name}</i>)}
                        </div>
                    )}
                    <div className="dashboard-legend dashboard-quality-legend">
                        <span><i className="legend-ok" />Sản lượng (thang tuyến tính)</span>
                        <span><i className="legend-ng" />Tỷ lệ NG (thang 0–1%)</span>
                    </div>
                </article>

                <article className="dashboard-panel dashboard-shift-panel">
                    <div className="dashboard-panel-heading"><h2>Sản lượng và tỷ lệ NG theo ca</h2></div>
                    {shiftChartData.length === 0 ? (
                        <div className="dashboard-empty">Chưa có dữ liệu theo ca</div>
                    ) : (
                        <div className="dashboard-shift-bars">
                            {shiftChartData.map(item => {
                                const qualityClass = item.ngRate >= 1 ? "critical" : item.ngRate >= 0.3 ? "warning" : "good";
                                const outputWidth = item.total > 0 ? Math.max(2, (item.total / maxShiftOutput) * 100) : 0;
                                const ngWidth = Math.min(100, (item.ngRate / NG_SCALE_MAX) * 100);
                                return (
                                    <div className="dashboard-shift-row" key={item.shift}>
                                        <div className="dashboard-shift-label">
                                            <strong>Ca {item.shift}</strong>
                                            <span>{item.report_count} báo cáo</span>
                                        </div>
                                        <div className="dashboard-shift-measures">
                                            <div className="dashboard-shift-measure">
                                                <span>Tổng</span>
                                                <div className="dashboard-ranking-track">
                                                    <i className="dashboard-ranking-bar" style={{ width: `${outputWidth}%` }} />
                                                </div>
                                            </div>
                                            <div className="dashboard-shift-measure quality">
                                                <span>NG</span>
                                                <div className="dashboard-quality-track">
                                                    <i className={`dashboard-quality-bar ${qualityClass}`} style={{ width: `${ngWidth}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="dashboard-shift-values">
                                            <strong>{formatNumber(item.total)}</strong>
                                            <span>OK {formatNumber(item.ok)} · NG {formatNumber(item.ng)}</span>
                                            <b className={qualityClass}>{item.ngRate.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}% NG</b>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="dashboard-legend dashboard-combo-legend">
                                <span><i className="legend-ok" />Tổng sản lượng (tuyến tính)</span>
                                <span><i className="legend-ng" />Tỷ lệ NG (0–1%)</span>
                            </div>
                        </div>
                    )}
                </article>
            </section>

            <section className="dashboard-quick-actions">
                <button type="button" onClick={() => navigate(`${basePath}/reports`)}><span className="dashboard-quick-icon"><AppIcon name="pending" size={24} /></span><strong>Duyệt báo cáo</strong></button>
                <button type="button" onClick={() => navigate(`${basePath}/approved`)}><span className="dashboard-quick-icon"><AppIcon name="approved" size={24} /></span><strong>Báo cáo đã duyệt</strong></button>
                <button type="button" onClick={() => navigate(`${basePath}/master`)}><span className="dashboard-quick-icon"><AppIcon name="settings" size={24} /></span><strong>Trung tâm quản lý</strong></button>
            </section>
        </main>
    );
}

export default Dashboard;
